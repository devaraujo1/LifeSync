import { describe, expect, it } from 'vitest'
import { CHAVE_DONO, definirDonoDoCache, donoDoCache, limparCache } from '../src/services/cacheLocal.js'

function armazenamentoFalso(inicial = {}) {
  const m = new Map(Object.entries(inicial))
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    chaves: () => [...m.keys()]
  }
}

describe('cache local pertence a uma conta', () => {
  it('registra o dono e descarta o cache ao limpar', () => {
    const arm = armazenamentoFalso({ 'lifesync-preferencias': '{}', 'lifesync-preferencias-pendente': '1' })
    definirDonoDoCache('u1', arm)
    expect(donoDoCache(arm)).toBe('u1')
    limparCache(arm)
    expect(arm.chaves()).toEqual([])
    expect(arm.getItem(CHAVE_DONO)).toBeNull()
  })
})
