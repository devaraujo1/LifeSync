import { describe, expect, it } from 'vitest'
import { dominioPrincipal } from '../src/modules/favoritos.js'
import { statusDoDia } from '../src/services/tarefasApi.js'

describe('ícones dos sites', () => {
  it('sugere o domínio principal sem quebrar sufixos como .com.br', () => {
    expect(dominioPrincipal('mail.google.com')).toBe('google.com')
    expect(dominioPrincipal('app.empresa.com.br')).toBe('empresa.com.br')
    expect(dominioPrincipal('empresa.com.br')).toBeNull()
    expect(dominioPrincipal('github.com')).toBeNull()
    expect(dominioPrincipal('localhost')).toBeNull()
  })
})

describe('status da tarefa na tela', () => {
  it('concluída vence andamento, que vence pendente', () => {
    const t = { concluidas: { '2026-10-22': true }, andamento: { '2026-10-22': true, '2026-10-23': true } }
    expect(statusDoDia(t, '2026-10-22')).toBe('concluida')
    expect(statusDoDia(t, '2026-10-23')).toBe('andamento')
    expect(statusDoDia(t, '2026-10-24')).toBe('pendente')
    expect(statusDoDia({}, '2026-10-24')).toBe('pendente')
  })
})
