// Recebe os avisos do Mercado Pago (assinatura e pagamentos) e atualiza o banco.
// Só aceita avisos com assinatura (x-signature) válida.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

async function assinaturaValida(req: Request, dataId: string, secret: string) {
  try {
    const sig = req.headers.get('x-signature') || ''
    const rid = req.headers.get('x-request-id') || ''
    if (!sig || !rid || !dataId) return false
    const p = Object.fromEntries(sig.split(',').map((x) => x.trim().split('='))) as Record<string, string>
    if (!p.ts || !p.v1) return false
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`id:${dataId};request-id:${rid};ts:${p.ts};`))
    const hex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('')
    if (hex.length !== p.v1.length) return false
    let d = 0
    for (let i = 0; i < hex.length; i++) d |= hex.charCodeAt(i) ^ p.v1.charCodeAt(i)
    return d === 0
  } catch { return false }
}

const STATUS: Record<string, string> = { authorized: 'ativa', paused: 'pausada', cancelled: 'cancelada', pending: 'pendente' }

/** Avisa o dono do site por e-mail (opcional: precisa de RESEND_API_KEY e AVISO_EMAIL). */
async function avisar(assunto: string, html: string) {
  const key = Deno.env.get('RESEND_API_KEY'), to = Deno.env.get('AVISO_EMAIL')
  if (!key || !to) return
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: Deno.env.get('AVISO_REMETENTE') || 'Sauberlich System <onboarding@resend.dev>', to, subject: assunto, html }),
    })
  } catch (e) { console.error('Aviso por e-mail falhou:', e) }
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok')
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: cred } = await db.from('configuracoes_pagamento').select('access_token, webhook_secret').eq('provedor', 'mercadopago').maybeSingle()
  const token = cred?.access_token || Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')
  const secret = cred?.webhook_secret || Deno.env.get('MERCADOPAGO_WEBHOOK_SECRET')
  if (!token || !secret) return new Response('Webhook não configurado', { status: 503 })

  const body = await req.json().catch(() => ({}))
  const type: string = body?.type || body?.topic || ''
  const id = String(body?.data?.id || '')
  if (!(await assinaturaValida(req, id, secret))) return new Response('Assinatura inválida', { status: 400 })
  const mp = (path: string) => fetch(`https://api.mercadopago.com${path}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json())

  try {
    if (type === 'subscription_preapproval') {
      const s = await mp(`/preapproval/${id}`)
      const status = STATUS[s.status]
      if (s.external_reference && status) {
        const { data: antes } = await db.from('assinaturas').select('status, nome, sistema, plano, ciclo, valor, email').eq('id', s.external_reference).maybeSingle()
        await db.from('assinaturas').update({ status, mp_preapproval_id: String(s.id), atualizado_em: new Date().toISOString() }).eq('id', s.external_reference)
        if (antes && antes.status !== 'ativa' && status === 'ativa') {
          await avisar(`Nova assinatura ativa: ${antes.sistema}`, `<p><b>${esc(antes.nome)}</b> (${esc(antes.email)}) assinou <b>${esc(antes.sistema)}</b>, plano ${esc(antes.plano)} (${antes.ciclo}, R$ ${antes.valor}).</p><p>Crie o acesso no sistema e marque como liberado no painel do site.</p>`)
        }
      }
    } else if (type === 'subscription_authorized_payment' || type === 'payment') {
      const pg = type === 'payment' ? await mp(`/v1/payments/${id}`) : await mp(`/authorized_payments/${id}`).then(async (a) => a?.payment?.id ? await mp(`/v1/payments/${a.payment.id}`) : null)
      if (pg?.id) {
        let assId: string | null = null
        if (pg.metadata?.preapproval_id) {
          const { data } = await db.from('assinaturas').select('id').eq('mp_preapproval_id', String(pg.metadata.preapproval_id)).maybeSingle()
          assId = data?.id ?? null
        }
        // mp_payment_id é único: um aviso repetido não duplica o registro.
        const { error } = await db.from('pagamentos').upsert({ assinatura_id: assId, mp_payment_id: String(pg.id), valor: pg.transaction_amount, status: String(pg.status) }, { onConflict: 'mp_payment_id' })
        if (error) console.error('Pagamento não gravado:', error.message)
      }
    }
  } catch (e) {
    console.error('Erro ao processar aviso:', e)
    return new Response('erro', { status: 500 })   // o Mercado Pago tenta de novo
  }
  return new Response('ok')
})
