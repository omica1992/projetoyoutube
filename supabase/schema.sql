-- Execute este SQL no SQL Editor do seu projeto Supabase (uma única vez).
-- Tabelas não destrutivas para o FatoNexo Studio.

create table if not exists public.fatonexo_acervo (
  id uuid primary key,
  kind text not null check (kind in ('buscas', 'analises', 'roteiros')),
  title text not null default '',
  status text not null default '',
  archived boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fatonexo_acervo_kind_created_idx
  on public.fatonexo_acervo (kind, created_at desc);

create table if not exists public.fatonexo_chats (
  id uuid primary key,
  title text not null default 'Nova conversa',
  archived boolean not null default false,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fatonexo_chats_updated_idx
  on public.fatonexo_chats (updated_at desc);

create table if not exists public.fatonexo_kv (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Habilita RLS (o servidor usa SUPABASE_SERVICE_ROLE_KEY, que ignora RLS com segurança no backend)
alter table public.fatonexo_acervo enable row level security;
alter table public.fatonexo_chats enable row level security;
alter table public.fatonexo_kv enable row level security;

