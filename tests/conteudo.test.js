import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cliente, criarAmbiente, entrar } from './helpers.js'

let amb, c

beforeAll(async () => {
  amb = await criarAmbiente()
  const s = await entrar(amb.app, { sub: 'conteudo' })
  c = { ...cliente(s), agent: s.agent, csrf: s.csrf }
})
afterAll(() => amb.fechar())

describe('favoritos', () => {
  it('CRUD com padrões e validação de URL', async () => {
    const f = (await c.post('/api/favoritos', { nome: 'Docs', url: 'https://developer.mozilla.org' })).body.favorito
    expect(f).toMatchObject({ categoria: 'Dia a dia', fixado: true })
    expect((await c.patch(`/api/favoritos/${f.id}`, { fixado: false, categoria: 'Estudos' })).body.favorito).toMatchObject({ fixado: false, categoria: 'Estudos' })
    for (const url of ['javascript:alert(1)', 'ftp://x.com', 'sem esquema', 'data:text/html,x']) {
      expect((await c.post('/api/favoritos', { nome: 'x', url })).status, url).toBe(400)
    }
    expect((await c.delete(`/api/favoritos/${f.id}`)).status).toBe(204)
  })
})

describe('preferências e perfil', () => {
  it('mescla alterações parciais sem perder o restante', async () => {
    await c.patch('/api/preferencias', { nome: 'Gustavo', destaque: 'menta', clima: { unidade: 'F' }, cartoes: { clima: false } })
    const r = await c.patch('/api/preferencias', { hora24: false, clima: { ativo: true }, cartoes: { tarefas: true } })
    expect(r.body.preferencias).toMatchObject({
      nome: 'Gustavo', destaque: 'menta', hora24: false, clima: { unidade: 'F', ativo: true }, cartoes: { clima: false, tarefas: true }, foto: null
    })
  })

  it('valida valores e ignora campos desconhecidos', async () => {
    const r = await c.patch('/api/preferencias', { destaque: 'roxo', hacker: true, nome: 'Ok' })
    expect(r.status).toBe(400)
    const ok = await c.patch('/api/preferencias', { nome: 'Ok', desconhecido: 1 })
    expect(ok.status).toBe(200)
    expect(ok.body.preferencias.desconhecido).toBeUndefined()
  })
})
