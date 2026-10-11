# www.sauberlich.com.br — Sauberlich System

Site principal da **Sauberlich System**: divulga todos os sistemas (Pesquisa NPS, Chamados, WhatsAtendente e Treinamentos), com vídeo e simulador de cada um, e vende cada sistema de forma individual (plano, cobrança e cancelamento próprios).

## Arquivos

| Arquivo | Para quê |
|---|---|
| `index.html` | O site inteiro (HTML, CSS, JS e as imagens reais embutidas). Não precisa de build. |
| `config.js` | Conexão pública com o Supabase (vazio = modo demonstração). |
| `Dockerfile` | Serve o site com nginx, no mesmo padrão dos outros sistemas. |
| `supabase/` | Migração do banco e funções `criar-assinatura` e `mercadopago-webhook`. |

## Como rodar

```bash
docker build -t sauberlich-www .
docker run -p 8080:80 sauberlich-www   # http://localhost:8080
```

Ou abra `index.html` direto no navegador.

## Como funciona a venda (Mercado Pago)

- Cada sistema é vendido separadamente. O cliente escolhe o plano e o ciclo (mensal ou anual = 2 meses grátis), informa nome, e-mail e CPF/CNPJ e é levado ao Mercado Pago para autorizar a **assinatura recorrente no cartão**.
- O preço **nunca** vem do navegador: a função `criar-assinatura` lê o plano e o valor de `site_config` (que só o administrador grava).
- O Mercado Pago avisa a função `mercadopago-webhook` (com assinatura verificada). Ela atualiza a assinatura (`pendente`, `ativa`, `pausada`, `cancelada`) e registra cada pagamento (sem duplicar).
- A liberação do acesso ao sistema é **manual**: no editor, aba **Pedidos**, você vê quem pagou, cria o acesso no sistema e marca "acesso liberado". Nenhum sistema é alterado. (Opcional: defina `RESEND_API_KEY` e `AVISO_EMAIL` para receber um e-mail a cada assinatura ativa.)
- Pix e boleto não renovam sozinhos no Mercado Pago, por isso a assinatura é no cartão.

## Colocar no ar (passo a passo)

1. **Supabase:** crie um projeto novo só para o www. Em *Authentication → Providers → Email*, **desative novos cadastros** (Allow new users to sign up = off).
2. **Banco:** aplique `supabase/migrations/20261011120000_site_assinaturas.sql` (SQL Editor ou `supabase db push`).
3. **Seu usuário administrador:** em *Authentication → Users* crie seu usuário (e-mail e senha) e rode no SQL Editor:
   ```sql
   insert into public.administradores (user_id) select id from auth.users where email = 'SEU@EMAIL';
   ```
4. **Mercado Pago:** em *Suas integrações* crie a aplicação e copie o **Access Token** de produção. Em *Webhooks*, cadastre a URL `https://<projeto>.supabase.co/functions/v1/mercadopago-webhook` com os eventos **Planos e assinaturas** e **Pagamentos**, e copie a **chave secreta** do webhook.
5. **Segredos das funções:**
   ```bash
   supabase secrets set MERCADOPAGO_ACCESS_TOKEN=... MERCADOPAGO_WEBHOOK_SECRET=... SITE_URL=https://www.sauberlich.com.br
   ```
6. **Funções:** `supabase functions deploy criar-assinatura mercadopago-webhook`.
7. **Site:** preencha `config.js` com a URL do projeto e a *anon key* (pública por desenho) e publique a pasta (`docker build` + `docker run`, como os outros sistemas).
8. **Primeiro conteúdo:** entre em *Área administrativa*, faça uma pequena edição (ou ajuste preços) e ela é gravada; a partir daí os visitantes veem o conteúdo salvo.
9. **Teste:** use credenciais de teste do Mercado Pago antes de trocar para produção.

Sem `config.js` preenchido, o site roda em **modo demonstração**: o login do editor aceita qualquer senha, as edições ficam só no navegador e o pedido não cobra nada.

## Editor administrativo

No rodapé, o botão **Área administrativa** abre o editor: arrastar seções e blocos, editar textos, preços, planos e imagens, trocar cores e fonte, definir o link do vídeo de cada sistema, ver os pedidos e pré-visualizar em desktop, tablet e celular. Com o Supabase conectado, o login é real (só quem está em `administradores` entra) e as edições são gravadas em `site_config`.

LGPD: o CPF/CNPJ do cliente fica na tabela `assinaturas`, que só o administrador lê. Inclua isso na política de privacidade do site.

## Vídeo e simulador

- **Vídeo:** no editor (aba *Sistemas*), cole o link do YouTube, Vimeo ou de um arquivo MP4 de cada sistema. Sem link, o site mostra um vídeo demonstrativo de exemplo.
- **Simulador:** cada sistema tem uma demonstração interativa com dados fictícios, que não toca nos sistemas reais.

## Imagens

Pesquisa NPS e Treinamentos usam capturas de tela reais com dados de demonstração. As telas de Chamados e WhatsAtendente são recriações; troque por capturas reais no editor (clique na imagem).
