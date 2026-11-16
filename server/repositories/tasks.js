import { atualizarCampos } from './sql.js'

const SELECT = `
  select t.id, t.text as texto, t.kind as tipo, to_char(t.date, 'YYYY-MM-DD') as data,
         t.weekdays as dias, to_char(t.created_on, 'YYYY-MM-DD') as criada,
         t.priority as prioridade, to_char(t.due_on, 'YYYY-MM-DD') as "dueOn",
         t.notes as notes,
         coalesce((select jsonb_object_agg(to_char(c.day, 'YYYY-MM-DD'), true)
                     from task_completions c where c.task_id = t.id), '{}'::jsonb) as concluidas,
         coalesce((select jsonb_object_agg(to_char(p.day, 'YYYY-MM-DD'), true)
                     from task_progress p where p.task_id = t.id), '{}'::jsonb) as andamento,
         coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'nome', g.name, 'cor', g.color) order by lower(g.name))
                     from task_tag_links l join task_tags g on g.id = l.tag_id
                    where l.task_id = t.id), '[]'::jsonb) as tags,
         coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'texto', i.text, 'feito', i.done, 'posicao', i.position)
                                    order by i.position, i.id)
                     from task_checklist i where i.task_id = t.id), '[]'::jsonb) as checklist
    from tasks t`

const mapear = (r) => ({
  id: r.id,
  texto: r.texto,
  tipo: r.tipo,
  data: r.data,
  dias: (r.dias ?? []).map(Number),
  criada: r.criada,
  prioridade: r.prioridade ?? 'media',
  dueOn: r.dueOn ?? null,
  notes: r.notes ?? '',
  concluidas: r.concluidas ?? {},
  andamento: r.andamento ?? {},
  tags: Array.isArray(r.tags) ? r.tags : [],
  checklist: Array.isArray(r.checklist) ? r.checklist : []
})

async function definirTags(db, userId, taskId, tagIds) {
  const ids = [...new Set((tagIds ?? []).map(String))]
  if (ids.length) {
    const ok = await db.query(
      `select count(*)::int as n from task_tags where user_id = $1 and id = any($2::uuid[])`,
      [userId, ids]
    )
    if ((ok[0]?.n ?? 0) !== ids.length) return false
  }
  await db.query(
    `delete from task_tag_links l using tasks t
      where l.task_id = t.id and t.id = $1 and t.user_id = $2`,
    [taskId, userId]
  )
  if (!ids.length) return true
  await db.query(
    `insert into task_tag_links (task_id, tag_id)
     select $1, x from unnest($2::uuid[]) as x
     on conflict do nothing`,
    [taskId, ids]
  )
  return true
}

export function criarRepoTarefas(db) {
  return {
    async listar(userId, { limite = 2000, filtro = 'todas', tag = null, prioridade = null, refDia = null } = {}) {
      const params = [userId]
      const where = ['t.user_id = $1']
      if (prioridade) {
        params.push(prioridade)
        where.push(`t.priority = $${params.length}`)
      }
      if (tag) {
        params.push(tag)
        where.push(`exists (select 1 from task_tag_links l where l.task_id = t.id and l.tag_id = $${params.length}::uuid)`)
      }
      params.push(limite)
      const linhas = await db.query(
        `${SELECT} where ${where.join(' and ')} order by
           case t.priority when 'alta' then 0 when 'media' then 1 else 2 end,
           t.due_on nulls last, t.created_at, t.id
         limit $${params.length}`,
        params
      )
      let tarefas = linhas.map(mapear)
      const dia = refDia
      if (filtro === 'concluidas' && dia) {
        tarefas = tarefas.filter((t) => t.concluidas?.[dia])
      } else if (filtro === 'ativas' && dia) {
        tarefas = tarefas.filter((t) => !t.concluidas?.[dia])
      } else if (filtro === 'atrasadas' && dia) {
        tarefas = tarefas.filter((t) => t.dueOn && t.dueOn < dia && !t.concluidas?.[dia])
      }
      return tarefas
    },
    async obter(userId, id) {
      const [r] = await db.query(`${SELECT} where t.user_id = $1 and t.id = $2`, [userId, id])
      return r ? mapear(r) : null
    },
    async criar(userId, t) {
      const [{ id }] = await db.query(
        `insert into tasks (user_id, text, kind, date, weekdays, created_on, priority, due_on, notes)
         values ($1, $2, $3, $4::date, $5::int[], $6::date, $7, $8::date, $9) returning id`,
        [userId, t.texto, t.tipo, t.data ?? null, t.dias, t.criada, t.prioridade ?? 'media', t.dueOn ?? null, t.notes ?? '']
      )
      if (t.tagIds) await definirTags(db, userId, id, t.tagIds)
      if (Array.isArray(t.checklist)) await this.definirChecklist(userId, id, t.checklist)
      return this.obter(userId, id)
    },
    async atualizar(userId, id, campos) {
      const mapa = {}
      if ('texto' in campos) mapa.text = [campos.texto]
      if ('tipo' in campos) mapa.kind = [campos.tipo]
      if ('data' in campos) mapa.date = [campos.data, 'date']
      if ('dias' in campos) mapa.weekdays = [campos.dias, 'int[]']
      if ('criada' in campos) mapa.created_on = [campos.criada, 'date']
      if ('prioridade' in campos) mapa.priority = [campos.prioridade]
      if ('dueOn' in campos) mapa.due_on = [campos.dueOn, 'date']
      if ('notes' in campos) mapa.notes = [campos.notes]
      const temCampos = Object.keys(mapa).length > 0
      if (temCampos) {
        const ok = await atualizarCampos(db, 'tasks', userId, id, mapa)
        if (!ok) return null
      } else {
        const existe = await this.obter(userId, id)
        if (!existe) return null
      }
      if ('tagIds' in campos) {
        const okTags = await definirTags(db, userId, id, campos.tagIds)
        if (!okTags) return null
      }
      if ('checklist' in campos && Array.isArray(campos.checklist)) {
        await this.definirChecklist(userId, id, campos.checklist)
      }
      return this.obter(userId, id)
    },
    async excluir(userId, id) {
      const r = await db.query('delete from tasks where id = $1 and user_id = $2 returning id', [id, userId])
      return r.length > 0
    },
    async definirStatus(userId, id, dia, status) {
      const [r] = await db.query(
        `with dono as (select 1 from tasks where id = $1 and user_id = $2),
              sai_concluida as (
                delete from task_completions
                 where task_id = $1 and day = $3::date and $4::text <> 'concluida' and exists (select 1 from dono)
                 returning 1),
              sai_andamento as (
                delete from task_progress
                 where task_id = $1 and day = $3::date and $4::text <> 'andamento' and exists (select 1 from dono)
                 returning 1),
              entra_concluida as (
                insert into task_completions (task_id, day)
                select $1, $3::date where $4::text = 'concluida' and exists (select 1 from dono)
                on conflict do nothing returning 1),
              entra_andamento as (
                insert into task_progress (task_id, day)
                select $1, $3::date where $4::text = 'andamento' and exists (select 1 from dono)
                on conflict do nothing returning 1)
         select exists (select 1 from dono) as ok`,
        [id, userId, dia, status]
      )
      return Boolean(r?.ok)
    },
    definirConclusao(userId, id, dia, concluida) {
      return this.definirStatus(userId, id, dia, concluida ? 'concluida' : 'pendente')
    },
    async listarTags(userId) {
      const linhas = await db.query(
        `select id, name as nome, color as cor from task_tags where user_id = $1 order by lower(name)`,
        [userId]
      )
      return linhas
    },
    async criarTag(userId, { nome, cor = 'ciano' }) {
      try {
        const [r] = await db.query(
          `insert into task_tags (user_id, name, color) values ($1, $2, $3)
           returning id, name as nome, color as cor`,
          [userId, nome, cor]
        )
        return r
      } catch (erro) {
        if (String(erro?.message ?? erro).includes('task_tags_unica')) {
          const [existente] = await db.query(
            `select id, name as nome, color as cor from task_tags where user_id = $1 and lower(name) = lower($2)`,
            [userId, nome]
          )
          return existente ?? null
        }
        throw erro
      }
    },
    async excluirTag(userId, id) {
      const r = await db.query('delete from task_tags where id = $1 and user_id = $2 returning id', [id, userId])
      return r.length > 0
    },
    async definirChecklist(userId, taskId, itens) {
      const dono = await db.query('select 1 from tasks where id = $1 and user_id = $2', [taskId, userId])
      if (!dono.length) return false
      await db.query('delete from task_checklist where task_id = $1', [taskId])
      const limpos = (itens ?? [])
        .map((i, idx) => ({
          texto: String(i.texto ?? i.text ?? '').trim().slice(0, 200),
          feito: Boolean(i.feito ?? i.done),
          posicao: Number.isFinite(i.posicao) ? i.posicao : idx
        }))
        .filter((i) => i.texto.length > 0)
        .slice(0, 50)
      if (!limpos.length) return true
      await db.query(
        `insert into task_checklist (task_id, text, done, position)
         select $1, x.texto, x.feito, x.posicao
           from jsonb_to_recordset($2::jsonb) as x(texto text, feito boolean, posicao int)`,
        [taskId, JSON.stringify(limpos)]
      )
      return true
    },
    async importar(userId, lote) {
      if (!lote.length) return { recebidos: 0, importados: 0 }
      const [r] = await db.query(
        `with entrada as (
           select * from jsonb_to_recordset($2::jsonb)
             as t(client_id text, texto text, tipo text, data date, dias int[], criada date, concluidas jsonb)
         ),
         novas as (
           insert into tasks (user_id, client_id, text, kind, date, weekdays, created_on)
           select $1::uuid, client_id, texto, tipo, data, coalesce(dias, '{}'), criada from entrada
           on conflict (user_id, client_id) do nothing
           returning id, client_id
         ),
         conclusoes as (
           insert into task_completions (task_id, day)
           select novas.id, d::date
             from novas join entrada using (client_id), jsonb_array_elements_text(entrada.concluidas) as d
           on conflict do nothing
           returning 1
         )
         select (select count(*) from entrada)::int as recebidos, (select count(*) from novas)::int as importados`,
        [userId, JSON.stringify(lote)]
      )
      return r
    }
  }
}
