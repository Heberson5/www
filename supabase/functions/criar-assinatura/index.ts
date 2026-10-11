// Cria uma assinatura recorrente (cartão) no Mercado Pago para UM sistema.
// O preço NUNCA vem do navegador: é lido de site_config (só admin grava).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

const SITE_URL = Deno.env.get('SITE_URL') || 'https://www.sauberlich.com.br'
const cors = {
  'Access-Control-Allow-Origin': SITE_URL,
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Vary': 'Origin',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const emailOk = (e: string) => /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(e)

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)
  try {
    const b = await req.json()
    const sistema = String(b.sistema || '')
    const k = Number(b.plano)
    const ciclo = b.ciclo === 'anual' ? 'anual' : 'mensal'
    const nome = String(b.nome || '').trim().slice(0, 120)
    const email = String(b.email || '').trim().toLowerCase().slice(0, 120)
    const documento = String(b.documento || '').replace(/\D/g, '').slice(0, 14)
    if (!nome || !emailOk(email)) return json({ error: 'Informe nome e um e-mail válido.' }, 400)
    if (documento && ![11, 14].includes(documento.length)) return json({ error: 'CPF ou CNPJ inválido.' }, 400)

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Preço e plano vêm do conteúdo salvo pelo administrador.
    const { data: cfg } = await db.from('site_config').select('conteudo').eq('id', 1).maybeSingle()
    const projeto = cfg?.conteudo?.projects?.find((p: any) => p.id === sistema && !p.hidden)
    const plano = projeto?.plans?.[k]
    const mensal = Number(plano?.[1])
    if (!projeto || !plano || !(mensal > 0)) return json({ error: 'Plano não encontrado.' }, 404)
    const valor = ciclo === 'anual' ? mensal * 10 : mensal   // anual = 2 meses grátis

    // Freio simples contra abuso: no máximo 5 pedidos pendentes por e-mail na última hora.
    const { count } = await db.from('assinaturas').select('id', { count: 'exact', head: true })
      .eq('email', email).eq('status', 'pendente').gte('criado_em', new Date(Date.now() - 3600_000).toISOString())
    if ((count ?? 0) >= 5) return json({ error: 'Muitas tentativas. Aguarde um pouco e tente de novo.' }, 429)

    const { data: cred } = await db.from('configuracoes_pagamento').select('access_token').eq('provedor', 'mercadopago').maybeSingle()
    const token = cred?.access_token || Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')
    if (!token) return json({ error: 'Pagamento não configurado.' }, 500)

    const { data: ass, error } = await db.from('assinaturas')
      .insert({ sistema, plano: String(plano[0]), ciclo, valor, nome, email, documento: documento || null })
      .select('id').single()
    if (error || !ass) return json({ error: 'Não foi possível registrar o pedido.' }, 500)

    const mp = await fetch('https://api.mercadopago.com/preapproval', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason: `Sauberlich System · ${projeto.name} · ${plano[0]}`,
        external_reference: ass.id,
        payer_email: email,
        back_url: `${SITE_URL}/?pedido=${ass.id}`,
        status: 'pending',
        auto_recurring: {
          frequency: ciclo === 'anual' ? 12 : 1,
          frequency_type: 'months',
          transaction_amount: valor,
          currency_id: 'BRL',
        },
      }),
    })
    const r = await mp.json()
    if (!mp.ok || !r.init_point) {
      console.error('Mercado Pago recusou a assinatura:', JSON.stringify(r))
      await db.from('assinaturas').update({ status: 'cancelada', observacoes: 'Falha ao criar no Mercado Pago' }).eq('id', ass.id)
      return json({ error: 'O Mercado Pago não aceitou o pedido. Tente de novo.' }, 502)
    }
    await db.from('assinaturas').update({ mp_preapproval_id: r.id }).eq('id', ass.id)
    return json({ url: r.init_point })
  } catch (e) {
    console.error(e)
    return json({ error: 'Erro inesperado.' }, 500)
  }
})
