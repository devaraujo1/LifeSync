-- 009: anotações — pastas, notas, etiquetas e vínculo opcional a tarefa.
-- Migração apenas aditiva (sem DROP/DELETE de dados).

create table if not exists note_folders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  name       text not null check (length(name) between 1 and 60),
  position   integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists note_folders_unica on note_folders (user_id, lower(name));
create index if not exists note_folders_user_idx on note_folders (user_id, position, id);

create table if not exists notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  folder_id  uuid references note_folders(id) on delete set null,
  title      text not null default '' check (length(title) <= 200),
  body       text not null default '' check (length(body) <= 50000),
  pinned     boolean not null default false,
  task_id    uuid references tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notes_user_idx on notes (user_id, pinned desc, updated_at desc, id);
create index if not exists notes_folder_idx on notes (folder_id) where folder_id is not null;
create index if not exists notes_task_idx on notes (task_id) where task_id is not null;

create table if not exists note_tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  name       text not null check (length(name) between 1 and 40),
  color      text not null default 'ciano'
    check (color in ('ciano', 'oceano', 'menta', 'ambar', 'coral')),
  created_at timestamptz not null default now()
);
create unique index if not exists note_tags_unica on note_tags (user_id, lower(name));
create index if not exists note_tags_user_idx on note_tags (user_id);

create table if not exists note_tag_links (
  note_id uuid not null references notes(id) on delete cascade,
  tag_id  uuid not null references note_tags(id) on delete cascade,
  primary key (note_id, tag_id)
);
create index if not exists note_tag_links_tag_idx on note_tag_links (tag_id);
