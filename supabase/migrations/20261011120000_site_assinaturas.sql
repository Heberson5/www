-- Backend do www.sauberlich.com.br: conteúdo editável do site, administradores,
-- assinaturas por sistema (Mercado Pago) e pagamentos.

-- Administradores do site (quem pode editar e ver pedidos).
create table if not exists public.administradores (
  user_id uuid primary key references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now()
);
alter table public.administradores enable row level security;

create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.administradores a where a.user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- Um administrador só enxerga a própria linha (não lista os demais).
drop policy if exists adm_self on public.administradores;
create policy adm_self on public.administradores for select to authenticated using (user_id = auth.uid());

-- Conteúdo da página (textos, sistemas, planos e preços). Visitantes leem; só admin grava.
create table if not exists public.site_config (
  id int primary key check (id = 1),
  conteudo jsonb not null,
  atualizado_em timestamptz not null default now()
);
alter table public.site_config enable row level security;
drop policy if exists sc_leitura on public.site_config;
drop policy if exists sc_ins on public.site_config;
drop policy if exists sc_upd on public.site_config;
create policy sc_leitura on public.site_config for select to anon, authenticated using (true);
create policy sc_ins on public.site_config for insert to authenticated with check (public.is_admin());
create policy sc_upd on public.site_config for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Assinaturas: uma por sistema contratado. Criadas só pela edge function (service role).
create table if not exists public.assinaturas (
  id uuid primary key default gen_random_uuid(),
  sistema text not null,
  plano text not null,
  ciclo text not null check (ciclo in ('mensal','anual')),
  valor numeric(10,2) not null check (valor > 0),
  nome text not null,
  email text not null,
  documento text,
  status text not null default 'pendente' check (status in ('pendente','ativa','pausada','cancelada')),
  mp_preapproval_id text unique,
  acesso_liberado boolean not null default false,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.assinaturas enable row level security;
drop policy if exists as_sel on public.assinaturas;
drop policy if exists as_upd on public.assinaturas;
create policy as_sel on public.assinaturas for select to authenticated using (public.is_admin());
-- O admin só altera o controle de acesso/observações; status e valores vêm do Mercado Pago.
create policy as_upd on public.assinaturas for update to authenticated using (public.is_admin()) with check (public.is_admin());
revoke update on public.assinaturas from authenticated;
grant update (acesso_liberado, observacoes) on public.assinaturas to authenticated;
create index if not exists assinaturas_status_idx on public.assinaturas(status, criado_em desc);

create table if not exists public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  assinatura_id uuid references public.assinaturas(id) on delete set null,
  mp_payment_id text not null unique,   -- evita processar o mesmo aviso duas vezes
  valor numeric(10,2) not null,
  status text not null,
  criado_em timestamptz not null default now()
);
alter table public.pagamentos enable row level security;
drop policy if exists pg_sel on public.pagamentos;
create policy pg_sel on public.pagamentos for select to authenticated using (public.is_admin());

-- Credenciais do Mercado Pago (opcional; o secret de ambiente também funciona).
-- Sem nenhuma policy: ninguém lê pelo navegador, só a service role das edge functions.
create table if not exists public.configuracoes_pagamento (
  provedor text primary key,
  access_token text,
  webhook_secret text,
  atualizado_em timestamptz not null default now()
);
alter table public.configuracoes_pagamento enable row level security;
revoke all on public.configuracoes_pagamento from anon, authenticated;
