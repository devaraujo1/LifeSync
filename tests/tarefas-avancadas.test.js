import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cliente, criarAmbiente, entrar } from './helpers.js'

let amb, c
beforeAll(async () => {
  amb = await criarAmbiente()
  c = cliente(await entrar(amb.app, { sub: 'tarefas-adv' }))
})
afterAll(() => amb.fechar())

describe('tarefas avançadas', () => {
  it('cria com prioridade, vencimento, notas e checklist', async () => {
    const r = await c.post('/api/tarefas', {
      texto: 'Entregar proposta',
      prioridade: 'alta',
      dueOn: '2026-11-20',
      notes: 'Cliente X',
      checklist: [{ texto: 'Rascunho', feito: true }, { texto: 'Revisar' }]
    })
    expect(r.status).toBe(201)
    expect(r.body.tarefa).toMatchObject({
      prioridade: 'alta',
      dueOn: '2026-11-20',
      notes: 'Cliente X'
    })
    expect(r.body.tarefa.checklist).toHaveLength(2)
    expect(r.body.tarefa.checklist[0]).toMatchObject({ texto: 'Rascunho', feito: true })
  })

  it('etiquetas: cria, vincula, filtra e remove', async () => {
    const tag = (await c.post('/api/tarefas/tags', { nome: 'Faculdade', cor: 'ambar' })).body.tag
    expect(tag).toMatchObject({ nome: 'Faculdade', cor: 'ambar' })
    const repetida = (await c.post('/api/tarefas/tags', { nome: 'faculdade' })).body.tag
    expect(repetida.id).toBe(tag.id)

    const t = (await c.post('/api/tarefas', { texto: 'Com tag', tagIds: [tag.id], prioridade: 'baixa' })).body.tarefa
    expect(t.tags.map((x) => x.id)).toEqual([tag.id])

    const filtradas = (await c.get(`/api/tarefas?tag=${tag.id}&prioridade=baixa`)).body.tarefas
    expect(filtradas.some((x) => x.id === t.id)).toBe(true)

    expect((await c.delete(`/api/tarefas/tags/${tag.id}`)).status).toBe(204)
    const depois = (await c.get(`/api/tarefas`)).body.tarefas.find((x) => x.id === t.id)
    expect(depois.tags).toEqual([])
  })

  it('filtro atrasadas e checklist replace', async () => {
    const t = (await c.post('/api/tarefas', {
      texto: 'Atrasada',
      dueOn: '2020-01-01',
      prioridade: 'media'
    })).body.tarefa
    const atrasadas = (await c.get('/api/tarefas?filtro=atrasadas')).body.tarefas
    expect(atrasadas.some((x) => x.id === t.id)).toBe(true)

    const r = await c.put(`/api/tarefas/${t.id}/checklist`, {
      itens: [{ texto: 'Só um', feito: false }]
    })
    expect(r.body.tarefa.checklist).toHaveLength(1)
    expect(r.body.tarefa.checklist[0].texto).toBe('Só um')
  })

  it('patch aceita prioridade e dueOn null', async () => {
    const t = (await c.post('/api/tarefas', { texto: 'P', prioridade: 'alta', dueOn: '2026-12-01' })).body.tarefa
    const e = await c.patch(`/api/tarefas/${t.id}`, { prioridade: 'baixa', dueOn: null })
    expect(e.body.tarefa).toMatchObject({ prioridade: 'baixa', dueOn: null })
  })
})
