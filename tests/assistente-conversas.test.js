import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

function memoria() {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear()
  }
}

const local = memoria()
const session = memoria()
globalThis.localStorage = local
globalThis.sessionStorage = session
globalThis.window = { dispatchEvent() {}, addEventListener() {} }

describe('conversas do assistente', () => {
  let chat

  beforeAll(async () => {
    chat = await import('../src/modules/assistente-chat.js')
  })

  beforeEach(() => {
    local.clear()
    session.clear()
  })

  it('a primeira conversa mantém o mesmo id entre leituras', () => {
    const a = chat.idConversaAtual()
    const b = chat.idConversaAtual()
    expect(b).toBe(a)
    expect(local.getItem(chat.STORE_KEY)).toContain(a)
  })

  it('grava a resposta mesmo quando o id ainda não estava no armazenamento', () => {
    const id = 'conversa-nova'
    chat.salvarHistorico(
      [
        { role: 'user', content: 'oi' },
        { role: 'assistant', content: 'olá' }
      ],
      id
    )
    expect(chat.idConversaAtual()).toBe(id)
    expect(chat.lerHistorico().map((m) => m.content)).toEqual(['oi', 'olá'])
  })
})
