-- 008: tarefas avançadas — prioridade, vencimento, notas, etiquetas e checklist.
-- Migração apenas aditiva (sem DROP/DELETE de dados).

alter table tasks add column if not exists priority text;
alter table tasks add column if not exists due_on date;
alter table tasks add column if not exists notes text;

update tasks set priority = 'media' where priority is null;
update tasks set notes = '' where notes is null;

alter table tasks alter column priority set default 'media';
alter table tasks alter column priority set not null;
alter table tasks alter column notes set default '';
alter table tasks alter column notes set not null;

do $$ begin
  alter table tasks add constraint tasks_priority_check check (priority in ('baixa', 'media', 'alta'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table tasks add constraint tasks_notes_len check (length(notes) <= 2000);
exception when duplicate_object then null;
end $$;

create table if not exists task_tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  name       text not null check (length(name) between 1 and 40),
  color      text not null default 'ciano'
    check (color in ('ciano', 'oceano', 'menta', 'ambar', 'coral')),
  created_at timestamptz not null default now()
);
create unique index if not exists task_tags_unica on task_tags (user_id, lower(name));
create index if not exists task_tags_user_idx on task_tags (user_id);

create table if not exists task_tag_links (
  task_id uuid not null references tasks(id) on delete cascade,
  tag_id  uuid not null references task_tags(id) on delete cascade,
  primary key (task_id, tag_id)
);
create index if not exists task_tag_links_tag_idx on task_tag_links (tag_id);

create table if not exists task_checklist (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references tasks(id) on delete cascade,
  text       text not null check (length(text) between 1 and 200),
  done       boolean not null default false,
  position   integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now()
);
create index if not exists task_checklist_task_idx on task_checklist (task_id, position, id);
