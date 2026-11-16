-- 010: confirmações do assistente (escritas/exclusões) persistidas — funciona em serverless multi-instância.
-- Migração apenas aditiva.

create table assistente_pendentes (
  id          uuid primary key,
  user_id     uuid not null references users(id) on delete cascade,
  kind        text not null check (kind in ('exclusao', 'escrita')),
  tipo        text,
  id_alvo     text,
  tool        text,
  args        jsonb,
  preview     jsonb,
  resumo      text not null default '',
  assinatura  text not null,
  expira_em   timestamptz not null,
  created_at  timestamptz not null default now()
);

create index assistente_pendentes_user_idx on assistente_pendentes (user_id);
create index assistente_pendentes_expira_idx on assistente_pendentes (expira_em);
