import { describe, expect, it } from 'vitest'
import { gerarRelatorioFinanceiro, nomeArquivoFinanceiro } from '../src/modules/financeiro-pdf.js'

const base = [
  {
    type: 'income',
    description: 'Salário',
    category: 'Salário',
    amount: 5000,
    date: '2026-11-05'
  },
  {
    type: 'expense',
    description: 'Mercado',
    category: 'Alimentação',
    amount: 320.5,
    date: '2026-11-08'
  },
  {
    type: 'expense',
    description: 'Uber',
    category: 'Transporte',
    amount: 28,
    date: '2026-11-09',
    origem: 'cartao',
    cartaoNome: 'Nubank'
  },
  {
    type: 'expense',
    description: 'Estorno loja',
    category: 'Lazer',
    amount: -40,
    date: '2026-11-10',
    origem: 'cartao',
    cartaoNome: 'Nubank',
    tipoCompra: 'estorno'
  },
  {
    type: 'saving',
    description: 'Reserva',
    category: 'Reserva',
    amount: 200,
    date: '2026-11-11'
  }
]

describe('relatório financeiro PDF', () => {
  it('gera PDF com visual LifeSync e seções detalhadas', async () => {
    const blob = gerarRelatorioFinanceiro({
      periodo: base,
      exibidas: base.filter((t) => t.type === 'expense'),
      rotuloPeriodo: 'Novembro de 2026',
      rotuloFiltro: 'Despesas',
      totalGuardado: 450,
      meta: { nome: 'Viagem', valor: 3000, prazo: '2027-06' }
    })

    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('application/pdf')
    expect(blob.size).toBeGreaterThan(800)

    const texto = await blob.text()
    expect(texto.startsWith('%PDF-1.4')).toBe(true)
    expect(texto).toContain('LifeSync')
    // Acentos saem como escapes WinAnsi (\363 etc.)
    expect(texto).toMatch(/Relat\\363rio financeiro/)
    expect(texto).toContain('Despesas por categoria')
    expect(texto).toContain('Maiores despesas')
    expect(texto).toMatch(/Composi\\347\\343o dos gastos/)
    expect(texto).toContain('Meta financeira')
    expect(texto).toContain('ORIGEM')
    expect(texto).toContain('do bruto')
    // Estorno aparece a favor; sinal ASCII de despesa intacto
    expect(texto).toContain('+ R$')
    expect(texto).toMatch(/- R\$/)
    expect(texto).not.toMatch(/- -R\$/)
  })

  it('nomeia o arquivo com prefixo lifesync', () => {
    expect(nomeArquivoFinanceiro('2026', '11')).toBe('lifesync-financeiro-2026-11.pdf')
    expect(nomeArquivoFinanceiro('2026', 'all')).toBe('lifesync-financeiro-2026.pdf')
    expect(nomeArquivoFinanceiro('all', 'all')).toBe('lifesync-financeiro-todo-o-periodo.pdf')
  })
})
