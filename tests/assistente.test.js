import { describe, expect, it } from 'vitest'
import { cliente, criarAmbiente, entrar } from './helpers.js'
import { classificarIntencaoEscrita, filtrarToolsPorIntencao } from '../server/services/assistente/intencao.js'
import { criarProvedorGemini, paraContents } from '../server/services/assistente/providers/gemini.js'
import { DEFINICOES_TOOLS } from '../server/services/assistente/tools.js'

describe('assistente', () => {
  it('Gemini devolve thoughtSignature nos functionCall parts', () => {
    const contents = paraContents([
      { role: 'user', content: 'gastei 16' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'c1',
            name: 'criar_transacao',
            args: { type: 'expense', amount: 16 },
            thoughtSignature: 'sig-abc'
          },
          { id: 'c2', name: 'listar_resumo_financeiro', args: {} }
        ]
      },
      {
        role: 'tool',
        tool_call_id: 'c1',
        name: 'criar_transacao',
        content: '{"ok":true}'
      },
      {
        role: 'tool',
        tool_call_id: 'c2',
        name: 'listar_resumo_financeiro',
        content: '{"ok":true}'
      }
    ])
    const model = contents.find((c) => c.role === 'model')
    expect(model.parts[0].functionCall.name).toBe('criar_transacao')
    expect(model.parts[0].thoughtSignature).toBe('sig-abc')
    expect(model.parts[1].thoughtSignature).toBeUndefined()
    const fr = contents.find((c) => c.role === 'user' && c.parts?.[0]?.functionResponse)
    expect(fr.parts).toHaveLength(2)
    expect(fr.parts[0].functionResponse.id).toBe('c1')
  })

  it('Gemini autentica com header x-goog-api-key (não query ?key=)', async () => {
    let visto = null
    const fetchImpl = async (url, opcoes) => {
      visto = { url: String(url), headers: opcoes.headers }
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] })
        }
      }
    }
    const p = criarProvedorGemini({ apiKey: 'chave-teste', fetchImpl })
    const r = await p.chat({ system: 's', messages: [{ role: 'user', content: 'oi' }], tools: [], model: 'gemini-3.5-flash' })
    expect(r.text).toBe('ok')
    expect(visto.url).toContain('/models/gemini-3.5-flash:generateContent')
    expect(visto.url).not.toMatch(/[?&]key=/)
    expect(visto.headers['x-goog-api-key']).toBe('chave-teste')
  })

  it('Gemini captura thoughtSignature da resposta de functionCall', async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: { name: 'criar_transacao', args: { amount: 16 } },
                    thoughtSignature: 'assinatura-xyz'
                  }
                ]
              }
            }
          ]
        })
      }
    })
    const p = criarProvedorGemini({ apiKey: 'k', fetchImpl })
    const r = await p.chat({ system: 's', messages: [{ role: 'user', content: 'gastei 16' }], tools: [], model: 'gemini-3.5-flash' })
    expect(r.type).toBe('tool_calls')
    expect(r.calls[0].thoughtSignature).toBe('assinatura-xyz')
  })

  it('GET /status reflete configuração da IA', async () => {
    const a = await criarAmbiente({ env: { AI_API_KEY: '' } })
    const sessao = await entrar(a.app, { sub: 'ai-st' })
    const r = await sessao.agent.get('/api/assistente/status')
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ configurado: false, provider: 'gemini' })
    await a.fechar()
  })

  it('chat sem chave retorna 503', async () => {
    const a = await criarAmbiente({ env: { AI_API_KEY: '' } })
    const cl = cliente(await entrar(a.app, { sub: 'ai-503' }))
    const r = await cl.post('/api/assistente/chat', { mensagem: 'gastei 16 no açaí' })
    expect(r.status).toBe(503)
    expect(r.body.erro.codigo).toBe('ia_nao_configurada')
    await a.fechar()
  })

  it('exige autenticação e CSRF', async () => {
    const request = (await import('supertest')).default
    const llm = { nome: 'mock', chat: async () => ({ type: 'text', text: 'oi' }) }
    const a = await criarAmbiente({ env: { AI_API_KEY: 'k' }, llm })
    expect((await request(a.app).post('/api/assistente/chat').send({ mensagem: 'oi' })).status).toBe(401)
    const sessao = await entrar(a.app, { sub: 'ai-csrf' })
    const sem = await sessao.agent.post('/api/assistente/chat').send({ mensagem: 'oi' })
    expect(sem.status).toBe(403)
    await a.fechar()
  })

  it('gasto via tool só grava após Aprovar a prévia', async () => {
    let round = 0
    const llm = {
      nome: 'mock',
      async chat() {
        round += 1
        if (round === 1) {
          return {
            type: 'tool_calls',
            calls: [
              {
                id: 't1',
                name: 'criar_transacao',
                args: { type: 'expense', description: 'Açaí', category: 'Alimentação', amount: 16, pagamento: 'pix' }
              }
            ]
          }
        }
        return { type: 'text', text: 'Preparei a prévia de R$ 16,00. Aprove no card para salvar.' }
      }
    }
    const a = await criarAmbiente({ env: { AI_API_KEY: 'k', AI_MODEL: 'm', AI_MODEL_PENSAR: 'mp' }, llm })
    const cl = cliente(await entrar(a.app, { sub: 'ai-gasto' }))
    const r = await cl.post('/api/assistente/chat', { mensagem: 'gastei 16 no açaí' })
    expect(r.status).toBe(200)
    expect(r.body.acoes).toHaveLength(0)
    expect(r.body.precisaConfirmacao?.id).toBeTruthy()
    expect(r.body.precisaConfirmacao?.kind).toBe('escrita')
    expect(r.body.precisaConfirmacao?.preview?.modulo).toMatch(/Finan/i)
    expect(r.body.resposta).toMatch(/Prévia pronta/i)
    expect(r.body.resposta).not.toMatch(/açaí no Pix e o bolo/i)
    expect((await cl.get('/api/transacoes')).body.transacoes).toHaveLength(0)

    const conf = await cl.post('/api/assistente/confirmar', { confirmId: r.body.precisaConfirmacao.id })
    expect(conf.status).toBe(200)
    expect(conf.body.resumo).toMatch(/16|despesa|Alimentação/i)
    const lista = (await cl.get('/api/transacoes')).body.transacoes
    expect(lista).toHaveLength(1)
    expect(lista[0]).toMatchObject({ type: 'expense', amount: 16, category: 'Alimentação', description: 'Açaí' })
    await a.fechar()
  })

  it('cancelar prévia não grava nada', async () => {
    const llm = {
      nome: 'mock',
      async chat() {
        return {
          type: 'tool_calls',
          calls: [
            {
              id: 't1',
              name: 'criar_transacao',
              args: { type: 'expense', description: 'Uber', category: 'Transporte', amount: 7, pagamento: 'dinheiro' }
            }
          ]
        }
      }
    }
    // segundo round texto
    let n = 0
    llm.chat = async () => {
      n += 1
      if (n === 1) {
        return {
          type: 'tool_calls',
          calls: [
            {
              id: 't1',
              name: 'criar_transacao',
              args: { type: 'expense', description: 'Uber', category: 'Transporte', amount: 7, pagamento: 'dinheiro' }
            }
          ]
        }
      }
      return { type: 'text', text: 'Prévia pronta.' }
    }
    const a = await criarAmbiente({ env: { AI_API_KEY: 'k' }, llm })
    const cl = cliente(await entrar(a.app, { sub: 'ai-cancel' }))
    const r = await cl.post('/api/assistente/chat', { mensagem: 'anota 7 no uber' })
    expect(r.body.precisaConfirmacao?.id).toBeTruthy()
    const cancel = await cl.post('/api/assistente/cancelar', { confirmId: r.body.precisaConfirmacao.id })
    expect(cancel.status).toBe(200)
    expect((await cl.get('/api/transacoes')).body.transacoes).toHaveLength(0)
    await a.fechar()
  })

  it('resposta só texto não grava nada', async () => {
    const llm = {
      nome: 'mock',
      chat: async () => ({ type: 'text', text: 'Em que foi esse gasto de R$ 450? Qual a categoria?' })
    }
    const a = await criarAmbiente({ env: { AI_API_KEY: 'k' }, llm })
    const cl = cliente(await entrar(a.app, { sub: 'ai-perg' }))
    const r = await cl.post('/api/assistente/chat', { mensagem: 'saiu 450' })
    expect(r.status).toBe(200)
    expect(r.body.acoes).toEqual([])
    expect((await cl.get('/api/transacoes')).body.transacoes).toHaveLength(0)
    await a.fechar()
  })

  it('exclusão pede confirmação e só apaga ao confirmar', async () => {
    let round = 0
    let txId = null
    const llm = {
      nome: 'mock',
      async chat() {
        round += 1
        if (round === 1) {
          return {
            type: 'tool_calls',
            calls: [
              {
                id: 'c2',
                name: 'pedir_confirmacao_exclusao',
                args: { tipo: 'transacao', id: txId, resumo: 'despesa Temp' }
              }
            ]
          }
        }
        return { type: 'text', text: 'Confirme a exclusão.' }
      }
    }
    const a = await criarAmbiente({ env: { AI_API_KEY: 'k' }, llm })
    const cl = cliente(await entrar(a.app, { sub: 'ai-del' }))
    const criada = await cl.post('/api/transacoes', {
      type: 'expense',
      description: 'Temp',
      category: 'Outros',
      amount: 10,
      date: '2026-11-11'
    })
    expect(criada.status).toBe(201)
    txId = criada.body.transacao.id

    const pediu = await cl.post('/api/assistente/chat', { mensagem: 'apaga aquela despesa temp' })
    expect(pediu.status).toBe(200)
    expect(pediu.body.precisaConfirmacao?.id).toBeTruthy()
    expect(pediu.body.precisaConfirmacao?.kind).toBe('exclusao')
    expect((await cl.get('/api/transacoes')).body.transacoes).toHaveLength(1)

    const conf = await cl.post('/api/assistente/confirmar', { confirmId: pediu.body.precisaConfirmacao.id })
    expect(conf.status).toBe(200)
    expect((await cl.get('/api/transacoes')).body.transacoes).toHaveLength(0)
    await a.fechar()
  })

  it('evento via tool só grava após Aprovar', async () => {
    let round = 0
    const llm = {
      nome: 'mock',
      async chat() {
        round += 1
        if (round === 1) {
          return {
            type: 'tool_calls',
            calls: [
              {
                id: 'e1',
                name: 'criar_evento',
                args: { titulo: 'Dentista', data: '2026-11-14', diaInteiro: false, inicio: '15:00', categoria: 'saude' }
              }
            ]
          }
        }
        return { type: 'text', text: 'Prévia do evento pronta.' }
      }
    }
    const a = await criarAmbiente({ env: { AI_API_KEY: 'k' }, llm })
    const cl = cliente(await entrar(a.app, { sub: 'ai-ev' }))
    const r = await cl.post('/api/assistente/chat', { mensagem: 'marca dentista sexta 15h' })
    expect(r.status).toBe(200)
    expect(r.body.acoes).toHaveLength(0)
    expect(r.body.precisaConfirmacao?.kind).toBe('escrita')
    expect((await cl.get('/api/eventos')).body.eventos.some((e) => e.titulo === 'Dentista')).toBe(false)

    const conf = await cl.post('/api/assistente/confirmar', { confirmId: r.body.precisaConfirmacao.id })
    expect(conf.status).toBe(200)
    const eventos = (await cl.get('/api/eventos')).body.eventos
    expect(eventos.some((e) => e.titulo === 'Dentista')).toBe(true)
    await a.fechar()
  })

  it('intenção: pergunta / só conta bloqueia escrita; comando claro libera', () => {
    expect(classificarIntencaoEscrita('gastei 7 no uber hoje, de quanto?')).toBe('bloquear_escrita')
    expect(classificarIntencaoEscrita('não quero registrar, só conta mesmo')).toBe('bloquear_escrita')
    expect(classificarIntencaoEscrita('quanto gastei este mês?')).toBe('bloquear_escrita')
    expect(classificarIntencaoEscrita('gastei 16 no açaí')).toBe('liberar')
    expect(classificarIntencaoEscrita('sim')).toBe('liberar')
    const filtradas = filtrarToolsPorIntencao(DEFINICOES_TOOLS, 'gastei 7 no uber hoje d aquanto?')
    expect(filtradas.some((t) => t.name === 'criar_transacao')).toBe(false)
    expect(filtradas.some((t) => t.name === 'listar_resumo_financeiro')).toBe(true)
  })

  it('não registra quando a mensagem é pergunta de total', async () => {
    let toolsVistas = null
    const llm = {
      nome: 'mock',
      async chat({ tools }) {
        toolsVistas = tools.map((t) => t.name)
        return { type: 'text', text: 'Este mês você gastou R$ 120. Quer que eu registre os R$7 do Uber?' }
      }
    }
    const a = await criarAmbiente({ env: { AI_API_KEY: 'k' }, llm })
    const cl = cliente(await entrar(a.app, { sub: 'ai-ask' }))
    const r = await cl.post('/api/assistente/chat', {
      mensagem: 'gastei 7 reais no uber hoje, de quanto?'
    })
    expect(r.status).toBe(200)
    expect(r.body.acoes ?? []).toHaveLength(0)
    expect(toolsVistas).not.toContain('criar_transacao')
    expect(toolsVistas).toContain('listar_resumo_financeiro')
    await a.fechar()
  })

  it('pensar: true usa AI_MODEL_PENSAR', async () => {
    const modelos = []
    const llm = {
      nome: 'mock',
      async chat({ model }) {
        modelos.push(model)
        return { type: 'text', text: 'ok' }
      }
    }
    const a = await criarAmbiente({
      env: { AI_API_KEY: 'k', AI_MODEL: 'gemini-3.5-flash-lite', AI_MODEL_PENSAR: 'gemini-3.8-flash' },
      llm
    })
    const cl = cliente(await entrar(a.app, { sub: 'ai-pensar' }))
    const normal = await cl.post('/api/assistente/chat', { mensagem: 'oi', pensar: false })
    const pensado = await cl.post('/api/assistente/chat', { mensagem: 'analisa meu mês', pensar: true })
    expect(normal.status).toBe(200)
    expect(pensado.status).toBe(200)
    expect(normal.body.model).toBe('gemini-3.5-flash-lite')
    expect(pensado.body.model).toBe('gemini-3.8-flash')
    expect(modelos).toEqual(['gemini-3.5-flash-lite', 'gemini-3.8-flash'])
    await a.fechar()
  })

  it('normaliza horário de evento na edição da prévia', async () => {
    const { normalizarHoraEdit } = await import('../server/services/assistente/previa.js')
    expect(normalizarHoraEdit('Dia inteiro')).toEqual({ diaInteiro: true, inicio: '', fim: '' })
    expect(normalizarHoraEdit('14:00')).toEqual({ diaInteiro: false, inicio: '14:00', fim: '' })
    expect(normalizarHoraEdit('9:00–10:30')).toEqual({ diaInteiro: false, inicio: '09:00', fim: '10:30' })
    expect(normalizarHoraEdit('14h30 às 16h')).toEqual({ diaInteiro: false, inicio: '14:30', fim: '16:00' })
    expect(normalizarHoraEdit('—')).toEqual({ diaInteiro: true, inicio: '', fim: '' })
  })

  it('editar prévia aceita data Hoje e parcelas À vista', async () => {
    let n = 0
    const llm = {
      nome: 'mock',
      async chat() {
        n += 1
        if (n === 1) {
          return {
            type: 'tool_calls',
            calls: [
              {
                id: 't1',
                name: 'criar_transacao',
                args: {
                  type: 'expense',
                  description: 'Açaí',
                  category: 'Alimentação',
                  amount: 16,
                  pagamento: 'pix'
                }
              }
            ]
          }
        }
        return { type: 'text', text: 'Prévia.' }
      }
    }
    const a = await criarAmbiente({ env: { AI_API_KEY: 'k' }, llm })
    const cl = cliente(await entrar(a.app, { sub: 'ai-edit' }))
    const r = await cl.post('/api/assistente/chat', { mensagem: 'gastei 16 no açaí no pix' })
    const id = r.body.precisaConfirmacao?.id
    expect(id).toBeTruthy()

    const edit = await cl.post('/api/assistente/editar-previa', {
      confirmId: id,
      campos: { description: 'Açaí grande', amount: 'R$ 18,50', date: 'Hoje' }
    })
    expect(edit.status).toBe(200)
    expect(edit.body.precisaConfirmacao.preview.destaque).toMatch(/18/)
    expect(edit.body.precisaConfirmacao.preview.campos.some((c) => c.valor === 'Açaí grande')).toBe(true)
    await a.fechar()
  })

  it('system prompt inclui snapshot financeiro e tarefas', async () => {
    let systemVisto = ''
    const llm = {
      nome: 'mock',
      async chat({ system }) {
        systemVisto = String(system || '')
        return { type: 'text', text: 'Seu saldo do mês está no snapshot.' }
      }
    }
    const a = await criarAmbiente({ env: { AI_API_KEY: 'k' }, llm })
    const cl = cliente(await entrar(a.app, { sub: 'ai-ctx' }))
    await cl.post('/api/transacoes', {
      type: 'expense',
      description: 'Café',
      category: 'Alimentação',
      amount: 12,
      date: new Date().toISOString().slice(0, 10)
    })
    await cl.post('/api/tarefas', { texto: 'Pagar aluguel', prioridade: 'alta' })
    const r = await cl.post('/api/assistente/chat', { mensagem: 'como estou?' })
    expect(r.status).toBe(200)
    expect(systemVisto).toMatch(/Dados atuais do usuário/i)
    expect(systemVisto).toMatch(/Mês \d{4}-\d{2}:/i)
    expect(systemVisto).toMatch(/Pagar aluguel/i)
    await a.fechar()
  })
})
