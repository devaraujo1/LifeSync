import { DocumentoPDF, hex } from '../services/pdf.js'

/* Relatório financeiro em PDF (A4, várias páginas).
   Visual alinhado ao LifeSync (charcoal + lime) e conteúdo detalhado:
   resumo, composição, indicadores, categorias, top despesas, meta e lista. */

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const brl = (valor) => moeda.format(valor)

const TIPOS = { income: 'Receita', expense: 'Despesa', saving: 'Guardado' }

/* Tokens do site (main.css :root — charcoal + lime) */
const COR = {
  fundo: hex('#050505'),
  surface: hex('#121214'),
  surfaceForte: hex('#16161a'),
  linha: hex('#2a2a2e'),
  linhaForte: hex('#3a4a20'),
  zebra: hex('#0e0e10'),
  texto: hex('#f2f4f6'),
  suave: hex('#9aa3ab'),
  faint: hex('#6b737a'),
  accent: hex('#A4EB3C'),
  accentSuave: hex('#c8f578'),
  mint: hex('#8fd94a'),
  ocean: hex('#6fa82a'),
  coral: hex('#f4909c'),
  petrol: hex('#1a2410'),
  branco: hex('#ffffff')
}

const CORES_CAT = {
  Moradia: '#A4EB3C',
  Alimentação: '#f4909c',
  Transporte: '#c8f578',
  Lazer: '#8fd94a',
  Outros: '#9aa3ab'
}
const PALETA_EXTRA = ['#c8f578', '#f4909c', '#A4EB3C', '#8fd94a', '#6fa82a', '#fcd34d', '#93c5fd', '#fdba74']

function corCategoria(nome) {
  if (CORES_CAT[nome]) return hex(CORES_CAT[nome])
  let hash = 0
  for (const letra of String(nome).toLowerCase()) hash = (hash * 31 + letra.charCodeAt(0)) >>> 0
  return hex(PALETA_EXTRA[hash % PALETA_EXTRA.length])
}

const MARGEM = 40
const RODAPE = 48

const dataBR = (iso) => {
  const [a, m, d] = String(iso || '').split('-')
  if (!a || !m || !d) return '—'
  return `${d}/${m}/${a}`
}

function somar(lista, tipo) {
  return lista.filter((t) => t.type === tipo).reduce((total, t) => total + Number(t.amount || 0), 0)
}

function ehCartao(t) {
  return t?.origem === 'cartao'
}

function rotuloOrigem(t) {
  if (ehCartao(t)) return t.cartaoNome ? `Cartão · ${t.cartaoNome}` : 'Cartão'
  return 'À vista'
}

/** Formata valor com sinal coerente (estorno de cartão não fica "- -R$"). */
function valorComSinal(t) {
  const amount = Number(t.amount || 0)
  if (t.type === 'income') return { texto: `+ ${brl(amount)}`, cor: COR.mint }
  if (t.type === 'saving') return { texto: brl(amount), cor: COR.accentSuave }
  // Despesa: estorno/crédito (negativo) aparece a favor
  if (amount < 0) return { texto: `+ ${brl(-amount)}`, cor: COR.mint }
  return { texto: `- ${brl(amount)}`, cor: COR.coral }
}

/**
 * @param {object} dados
 * @param {Array} dados.periodo
 * @param {Array} dados.exibidas
 * @param {string} dados.rotuloPeriodo
 * @param {string} dados.rotuloFiltro
 * @param {number} dados.totalGuardado
 * @param {{ nome?: string, valor: number, prazo: string } | null} [dados.meta]
 * @returns {Blob}
 */
export function gerarRelatorioFinanceiro({
  periodo,
  exibidas,
  rotuloPeriodo,
  rotuloFiltro,
  totalGuardado,
  meta = null
}) {
  const doc = new DocumentoPDF({ titulo: `LifeSync · Relatório financeiro — ${rotuloPeriodo}` })
  const L = doc.largura
  const A = doc.altura
  const largUtil = L - MARGEM * 2
  const limite = A - RODAPE - 14

  const entradas = somar(periodo, 'income')
  const despesas = somar(periodo, 'expense')
  const guardado = somar(periodo, 'saving')
  const saldo = entradas - despesas - guardado

  const despesasLista = periodo.filter((t) => t.type === 'expense')
  const despesasCartao = despesasLista.filter(ehCartao)
  const despesasVista = despesasLista.filter((t) => !ehCartao(t))
  const totalCartao = despesasCartao.reduce((s, t) => s + Number(t.amount || 0), 0)
  const totalVista = despesasVista.reduce((s, t) => s + Number(t.amount || 0), 0)

  let y = 0

  function pintarFundo() {
    doc.retangulo(0, 0, L, A, { preenchimento: COR.fundo })
  }

  function novaPagina() {
    doc.novaPagina()
    pintarFundo()
    y = MARGEM + 8
  }

  function garantir(altura, aoQuebrar) {
    if (y + altura <= limite) return
    novaPagina()
    aoQuebrar?.()
  }

  function titulo(texto, detalhe = '') {
    doc.texto(texto, MARGEM, y, { tam: 12, negrito: true, cor: COR.texto })
    if (detalhe) doc.texto(detalhe, L - MARGEM, y, { tam: 9, cor: COR.suave, alinhar: 'direita' })
    doc.linha(MARGEM, y + 8, L - MARGEM, y + 8, { cor: COR.linha, espessura: 0.7 })
    doc.retangulo(MARGEM, y + 7.2, 28, 1.6, { preenchimento: COR.accent })
    y += 24
  }

  function kicker(texto) {
    doc.texto(texto.toUpperCase(), MARGEM, y, { tam: 8, negrito: true, cor: COR.accent })
    y += 14
  }

  /* ---------- Cabeçalho ---------- */

  doc.novaPagina()
  pintarFundo()
  doc.retangulo(0, 0, L, 112, { preenchimento: COR.surfaceForte })
  doc.retangulo(0, 112, L, 3, { preenchimento: COR.accent })
  // brilho sutil no canto (aurora)
  doc.retangulo(L - 160, 0, 160, 112, { preenchimento: COR.petrol })

  doc.texto('LIFESYNC', MARGEM, 32, { tam: 9, negrito: true, cor: COR.accent })
  doc.texto('Relatório financeiro', MARGEM, 58, { tam: 22, negrito: true, cor: COR.texto })
  doc.texto(`Período: ${rotuloPeriodo}`, MARGEM, 82, { tam: 10.5, cor: COR.suave })
  doc.texto(`Filtro: ${rotuloFiltro}`, MARGEM, 98, { tam: 9.5, cor: COR.faint })

  const geradoEm = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  doc.texto('Gerado em', L - MARGEM, 32, { tam: 8, cor: COR.faint, alinhar: 'direita' })
  doc.texto(geradoEm, L - MARGEM, 48, { tam: 10, negrito: true, cor: COR.texto, alinhar: 'direita' })
  doc.texto(`${periodo.length} no período`, L - MARGEM, 82, {
    tam: 10,
    cor: COR.accentSuave,
    alinhar: 'direita'
  })
  doc.texto(`${exibidas.length} listadas`, L - MARGEM, 98, {
    tam: 9.5,
    cor: COR.faint,
    alinhar: 'direita'
  })

  y = 138

  /* ---------- Resumo (cards como na tela) ---------- */

  kicker('Resumo')
  const cartoes = [
    { rotulo: 'Saldo do período', valor: saldo, cor: saldo < 0 ? COR.coral : COR.accent, nota: 'Entradas − despesas − guardado' },
    { rotulo: 'Total de entradas', valor: entradas, cor: COR.mint, nota: 'Receitas no período' },
    { rotulo: 'Total de despesas', valor: despesas, cor: COR.coral, nota: 'Gastos no período' },
    { rotulo: 'Dinheiro guardado', valor: totalGuardado, cor: COR.accentSuave, nota: `No período: ${brl(guardado)}` }
  ]
  const espaco = 10
  const larguraCartao = (largUtil - espaco * 3) / 4

  cartoes.forEach((c, i) => {
    const x = MARGEM + i * (larguraCartao + espaco)
    doc.retangulo(x, y, larguraCartao, 72, { preenchimento: COR.surface, borda: COR.linha })
    doc.retangulo(x, y, 3, 72, { preenchimento: c.cor })
    doc.texto(c.rotulo, x + 12, y + 18, { tam: 8, cor: COR.suave })

    const texto = brl(c.valor)
    let tam = 13
    while (tam > 8 && doc.medir(texto, { tam, negrito: true }) > larguraCartao - 22) tam -= 0.5
    doc.texto(texto, x + 12, y + 40, { tam, negrito: true, cor: c.cor })
    doc.texto(doc.truncar(c.nota, larguraCartao - 20, { tam: 7 }), x + 12, y + 58, { tam: 7, cor: COR.faint })
  })
  y += 72 + 16

  /* ---------- Composição das despesas ---------- */

  if (despesasLista.length) {
    garantir(110)
    kicker('Despesas')
    titulo('Composição dos gastos', `${despesasLista.length} lançamentos`)

    // % sobre o gasto bruto (só valores > 0). Estornos reduzem o líquido mas não geram 104% / -4%.
    const brutoVista = despesasVista.filter((t) => Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0)
    const brutoCartao = despesasCartao.filter((t) => Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0)
    const gastoBruto = brutoVista + brutoCartao
    const blocos = [
      {
        rotulo: 'À vista / Pix',
        valor: totalVista,
        bruto: brutoVista,
        qtd: despesasVista.length,
        cor: COR.coral
      },
      {
        rotulo: 'Cartão de crédito',
        valor: totalCartao,
        bruto: brutoCartao,
        qtd: despesasCartao.length,
        cor: COR.accent
      }
    ]
    const largBloco = (largUtil - 12) / 2
    blocos.forEach((b, i) => {
      const x = MARGEM + i * (largBloco + 12)
      const pct = gastoBruto ? b.bruto / gastoBruto : 0
      doc.retangulo(x, y, largBloco, 54, { preenchimento: COR.surface, borda: COR.linha })
      doc.texto(b.rotulo, x + 14, y + 18, { tam: 9, cor: COR.suave })
      doc.texto(brl(b.valor), x + 14, y + 36, { tam: 13, negrito: true, cor: b.cor })
      doc.texto(
        `${b.qtd} ${b.qtd === 1 ? 'item' : 'itens'} · ${Math.round(pct * 100)}% do bruto`,
        x + largBloco - 14,
        y + 36,
        { tam: 8, cor: COR.faint, alinhar: 'direita' }
      )
    })
    y += 54 + 14

    /* Indicadores */
    const positivas = despesasLista.filter((t) => Number(t.amount) > 0)
    const maior = positivas.reduce((m, t) => (Number(t.amount) > Number(m?.amount || 0) ? t : m), null)
    const media = positivas.length ? positivas.reduce((s, t) => s + Number(t.amount), 0) / positivas.length : 0

    garantir(70)
    titulo('Indicadores do período')
    const inds = [
      ['Quantidade', String(despesasLista.length)],
      ['Ticket médio', brl(media)],
      ['Maior despesa', maior ? brl(maior.amount) : '—'],
      ['Categorias', String(new Set(despesasLista.map((t) => t.category)).size)]
    ]
    const largInd = (largUtil - 9 * 3) / 4
    inds.forEach(([rotulo, valor], i) => {
      const x = MARGEM + i * (largInd + 9)
      doc.retangulo(x, y, largInd, 42, { preenchimento: COR.surface, borda: COR.linha })
      doc.texto(rotulo, x + 10, y + 16, { tam: 7.5, cor: COR.faint })
      doc.texto(doc.truncar(valor, largInd - 16, { tam: 11, negrito: true }), x + 10, y + 32, {
        tam: 11,
        negrito: true,
        cor: COR.texto
      })
    })
    y += 42 + 18

    if (maior) {
      doc.texto(
        doc.truncar(`Maior lançamento: ${maior.description} · ${maior.category} · ${dataBR(maior.date)}`, largUtil, {
          tam: 8
        }),
        MARGEM,
        y,
        { tam: 8, cor: COR.suave }
      )
      y += 16
    }
  }

  /* ---------- Despesas por categoria ---------- */

  const porCategoria = new Map()
  despesasLista.forEach((t) => {
    porCategoria.set(t.category, (porCategoria.get(t.category) ?? 0) + Number(t.amount || 0))
  })

  if (porCategoria.size) {
    const linhas = [...porCategoria.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
    if (linhas.length) {
      garantir(24 + Math.min(linhas.length, 3) * 26)
      titulo('Despesas por categoria', `${linhas.length} ${linhas.length === 1 ? 'categoria' : 'categorias'}`)

      const colValor = L - MARGEM
      const colPct = colValor - 92
      const inicioBarra = MARGEM + 132
      const larguraBarra = colPct - inicioBarra - 14
      const base = linhas.reduce((s, [, v]) => s + v, 0)

      linhas.forEach(([categoria, valor]) => {
        garantir(26, () => titulo('Despesas por categoria (continuação)'))
        const pct = base ? valor / base : 0
        const cor = corCategoria(categoria)

        doc.retangulo(MARGEM, y - 10, 8, 8, { preenchimento: cor })
        doc.texto(doc.truncar(categoria, 110, { tam: 9.5 }), MARGEM + 14, y, { tam: 9.5, cor: COR.texto })
        doc.retangulo(inicioBarra, y - 7, larguraBarra, 7, { preenchimento: COR.zebra, borda: COR.linha })
        if (pct > 0) {
          doc.retangulo(inicioBarra, y - 7, Math.max(larguraBarra * pct, 1.5), 7, { preenchimento: cor })
        }
        doc.texto(`${Math.round(pct * 100)}%`, colPct, y, { tam: 9, cor: COR.suave, alinhar: 'direita' })
        doc.texto(brl(valor), colValor, y, { tam: 9.5, negrito: true, cor: COR.texto, alinhar: 'direita' })
        y += 24
      })
      y += 8
    }
  }

  /* ---------- Top despesas ---------- */

  const top = [...despesasLista]
    .filter((t) => Number(t.amount) > 0)
    .sort((a, b) => Number(b.amount) - Number(a.amount))
    .slice(0, 8)

  if (top.length) {
    garantir(24 + top.length * 20)
    titulo('Maiores despesas', `Top ${top.length}`)

    top.forEach((t, i) => {
      garantir(20, () => titulo('Maiores despesas (continuação)'))
      if (i % 2 === 0) doc.retangulo(MARGEM, y - 11, largUtil, 18, { preenchimento: COR.zebra })
      doc.texto(String(i + 1).padStart(2, '0'), MARGEM + 4, y, { tam: 8.5, negrito: true, cor: COR.accent })
      doc.texto(doc.truncar(t.description, 200, { tam: 9 }), MARGEM + 28, y, { tam: 9, cor: COR.texto })
      doc.texto(doc.truncar(rotuloOrigem(t), 90, { tam: 8 }), MARGEM + 250, y, { tam: 8, cor: COR.faint })
      doc.texto(dataBR(t.date), L - MARGEM - 110, y, { tam: 8.5, cor: COR.suave, alinhar: 'direita' })
      doc.texto(brl(t.amount), L - MARGEM, y, { tam: 9.5, negrito: true, cor: COR.coral, alinhar: 'direita' })
      y += 18
    })
    y += 12
  }

  /* ---------- Meta ---------- */

  if (meta && Number(meta.valor) > 0) {
    garantir(90)
    titulo('Meta financeira', meta.nome || 'Sua meta')
    const guardadoMeta = Number(totalGuardado) || 0
    const alvo = Number(meta.valor)
    const falta = Math.max(alvo - guardadoMeta, 0)
    const pct = Math.min(guardadoMeta / alvo, 1)

    doc.retangulo(MARGEM, y, largUtil, 56, { preenchimento: COR.surface, borda: COR.linha })
    doc.texto(`Progresso: ${Math.floor(pct * 100)}%`, MARGEM + 14, y + 18, { tam: 9, cor: COR.suave })
    doc.texto(`${brl(guardadoMeta)} de ${brl(alvo)}`, MARGEM + 14, y + 36, {
      tam: 12,
      negrito: true,
      cor: COR.accent
    })
    doc.texto(falta === 0 ? 'Meta atingida' : `Faltam ${brl(falta)}`, L - MARGEM - 14, y + 36, {
      tam: 10,
      cor: falta === 0 ? COR.mint : COR.suave,
      alinhar: 'direita'
    })
    y += 56 + 8
    doc.retangulo(MARGEM, y, largUtil, 8, { preenchimento: COR.zebra, borda: COR.linha })
    if (pct > 0) doc.retangulo(MARGEM, y, Math.max(largUtil * pct, 2), 8, { preenchimento: COR.accent })
    y += 22
    if (meta.prazo) {
      const [ano, mes] = String(meta.prazo).split('-')
      doc.texto(`Prazo: ${mes}/${ano}`, MARGEM, y, { tam: 8.5, cor: COR.faint })
      y += 16
    }
  }

  /* ---------- Movimentações ---------- */

  const col = {
    data: MARGEM + 6,
    descricao: MARGEM + 68,
    categoria: MARGEM + 248,
    origem: MARGEM + 338,
    tipo: MARGEM + 430,
    valor: L - MARGEM - 6
  }
  const larguraDescricao = col.categoria - col.descricao - 8
  const larguraCategoria = col.origem - col.categoria - 8
  const larguraOrigem = col.tipo - col.origem - 8

  function cabecalhoTabela() {
    doc.retangulo(MARGEM, y - 12, largUtil, 20, { preenchimento: COR.surfaceForte })
    doc.retangulo(MARGEM, y + 8, largUtil, 1.2, { preenchimento: COR.accent })
    const opc = { tam: 7.5, negrito: true, cor: COR.accent }
    doc.texto('DATA', col.data, y + 1, opc)
    doc.texto('DESCRIÇÃO', col.descricao, y + 1, opc)
    doc.texto('CATEGORIA', col.categoria, y + 1, opc)
    doc.texto('ORIGEM', col.origem, y + 1, opc)
    doc.texto('TIPO', col.tipo, y + 1, opc)
    doc.texto('VALOR', col.valor, y + 1, { ...opc, alinhar: 'direita' })
    y += 18
  }

  garantir(24 + 20 + 22)
  titulo('Movimentações', `${exibidas.length} ${exibidas.length === 1 ? 'registro' : 'registros'}`)

  if (exibidas.length === 0) {
    doc.texto('Nenhuma movimentação para os filtros selecionados.', MARGEM, y + 4, {
      tam: 10,
      cor: COR.suave
    })
    y += 30
  } else {
    cabecalhoTabela()

    exibidas.forEach((t, i) => {
      garantir(22, cabecalhoTabela)

      if (i % 2 === 0) doc.retangulo(MARGEM, y - 12, largUtil, 20, { preenchimento: COR.zebra })

      const { texto: valorTxt, cor: corValor } = valorComSinal(t)
      const tipoCor =
        t.type === 'income' ? COR.mint : t.type === 'expense' ? COR.coral : COR.accentSuave

      doc.texto(dataBR(t.date), col.data, y + 1, { tam: 8.5, cor: COR.suave })
      doc.texto(doc.truncar(t.description || '—', larguraDescricao, { tam: 8.5 }), col.descricao, y + 1, {
        tam: 8.5,
        cor: COR.texto
      })
      doc.texto(doc.truncar(t.category || '—', larguraCategoria, { tam: 8 }), col.categoria, y + 1, {
        tam: 8,
        cor: COR.suave
      })
      doc.texto(doc.truncar(rotuloOrigem(t), larguraOrigem, { tam: 7.5 }), col.origem, y + 1, {
        tam: 7.5,
        cor: COR.faint
      })
      doc.texto(TIPOS[t.type] ?? t.type, col.tipo, y + 1, { tam: 8, cor: tipoCor })
      doc.texto(valorTxt, col.valor, y + 1, { tam: 8.5, negrito: true, cor: corValor, alinhar: 'direita' })
      y += 20
    })

    garantir(70)
    y += 8
    doc.linha(MARGEM, y - 10, L - MARGEM, y - 10, { cor: COR.linha, espessura: 0.7 })

    const totais = [
      ['Receitas listadas', somar(exibidas, 'income'), COR.mint],
      ['Despesas listadas', somar(exibidas, 'expense'), COR.coral],
      ['Guardado listado', somar(exibidas, 'saving'), COR.accentSuave]
    ].filter(([, valor]) => valor !== 0)

    totais.forEach(([rotulo, valor, cor]) => {
      doc.texto(rotulo, col.valor - 130, y + 2, { tam: 9, cor: COR.suave, alinhar: 'direita' })
      doc.texto(brl(valor), col.valor, y + 2, { tam: 9.5, negrito: true, cor, alinhar: 'direita' })
      y += 16
    })
  }

  /* ---------- Rodapé ---------- */

  const total = doc.total
  for (let p = 1; p <= total; p++) {
    doc.irParaPagina(p)
    doc.linha(MARGEM, A - RODAPE, L - MARGEM, A - RODAPE, { cor: COR.linha })
    doc.retangulo(MARGEM, A - RODAPE - 1, 24, 1.5, { preenchimento: COR.accent })
    doc.texto('LifeSync · Relatório financeiro', MARGEM, A - RODAPE + 16, { tam: 8, cor: COR.faint })
    doc.texto(`Página ${p} de ${total}`, L - MARGEM, A - RODAPE + 16, {
      tam: 8,
      cor: COR.faint,
      alinhar: 'direita'
    })
  }

  return doc.blob()
}

export function nomeArquivoFinanceiro(ano, mes) {
  if (ano === 'all') return 'lifesync-financeiro-todo-o-periodo.pdf'
  return mes === 'all' ? `lifesync-financeiro-${ano}.pdf` : `lifesync-financeiro-${ano}-${mes}.pdf`
}

export function baixarArquivo(blob, nome) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nome
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
