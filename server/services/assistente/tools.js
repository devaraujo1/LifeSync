import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { HttpError, conflito, naoEncontrado, requisicaoInvalida } from '../../lib/errors.js'
import { formatarNoFuso } from '../../lib/dates.js'
import { validar, zData, zTexto, zUrlHttp, zValor } from '../../lib/validate.js'
import { centavosParaDecimal, cicloDaFatura, mesDaFatura, montarAgenda, paraCentavos, statusDaFatura } from '../../lib/cartoes.js'
import { CATEGORIAS as CATEGORIAS_EVENTO } from '../eventMapping.js'
import { zEvento } from '../../routes/eventos.js'
import { CATEGORIAS_PADRAO } from './prompt.js'
import { TOOLS_ESCRITA, montarPreviaEscrita } from './previa.js'
import { zMeta } from '../../routes/transacoes.js'

const zTipo = z.enum(['expense', 'income', 'saving'])
const zUuid = z.string().uuid()

const prop = (schema, description) => {
  const o = typeof schema === 'object' && schema !== null ? { ...schema } : { type: 'string' }
  if (description) o.description = description
  return o
}

export const DEFINICOES_TOOLS = [
  {
    name: 'criar_transacao',
    description:
      'Propõe registrar Pix/dinheiro (ou receita/guardado). Para gasto no CARTÃO use criar_compra_cartao. Em despesa, informe pagamento pix|dinheiro. Não use se a forma de pagamento ainda for desconhecida — pergunte antes. Gera prévia (não grava sozinho).',
    parameters: {
      type: 'object',
      properties: {
        type: prop({ type: 'string', enum: ['expense', 'income', 'saving'] }, 'Tipo da movimentação'),
        description: prop({ type: 'string' }, 'Descrição curta'),
        category: prop({ type: 'string' }, 'Categoria'),
        amount: prop({ type: 'number' }, 'Valor positivo em reais'),
        date: prop({ type: 'string' }, 'Data AAAA-MM-DD; omita para hoje'),
        pagamento: prop(
          { type: 'string', enum: ['pix', 'dinheiro'] },
          'Obrigatório em expense: pix ou dinheiro. Não use para cartão.'
        )
      },
      required: ['type', 'description', 'category', 'amount']
    }
  },
  {
    name: 'atualizar_transacao',
    description: 'Atualiza uma movimentação existente pelo id.',
    parameters: {
      type: 'object',
      properties: {
        id: prop({ type: 'string' }, 'UUID da movimentação'),
        type: prop({ type: 'string', enum: ['expense', 'income', 'saving'] }),
        description: prop({ type: 'string' }),
        category: prop({ type: 'string' }),
        amount: prop({ type: 'number' }),
        date: prop({ type: 'string' })
      },
      required: ['id']
    }
  },
  {
    name: 'listar_resumo_financeiro',
    description:
      'Resumo financeiro do mês (entradas, despesas, saldo, caixa, cartão, faturas). Use para aprofundar além do snapshot ou quando o usuário pedir outro mês.',
    parameters: {
      type: 'object',
      properties: { mes: prop({ type: 'string' }, 'AAAA-MM; omita para o mês atual') },
      required: []
    }
  },
  {
    name: 'listar_categorias',
    description: 'Lista categorias padrão e as criadas pelo usuário.',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'criar_categoria',
    description: 'Cria categoria financeira própria.',
    parameters: {
      type: 'object',
      properties: {
        tipo: prop({ type: 'string', enum: ['expense', 'income', 'saving'] }),
        nome: prop({ type: 'string' })
      },
      required: ['tipo', 'nome']
    }
  },
  {
    name: 'obter_meta',
    description: 'Lê a meta financeira salva.',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'salvar_meta',
    description: 'Define ou atualiza a meta financeira.',
    parameters: {
      type: 'object',
      properties: {
        nome: prop({ type: 'string' }),
        valor: prop({ type: 'number' }),
        prazo: prop({ type: 'string' }, 'AAAA-MM')
      },
      required: ['valor', 'prazo']
    }
  },
  {
    name: 'listar_cartoes_painel',
    description:
      'Painel completo de cartões (limite, usado, disponível, fatura atual). Use antes de compra no cartão se faltar o nome, ou para explicar faturas/limites.',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'criar_compra_cartao',
    description:
      'Propõe compra no CARTÃO (prévia). Exige cartão (nomeCartao ou cartaoId) e parcelas (1 = à vista). Se o usuário não disse qual cartão ou se é à vista/parcelado, PERGUNTE — não invente. Use listar_cartoes_painel se precisar listar cartões.',
    parameters: {
      type: 'object',
      properties: {
        cartaoId: prop({ type: 'string' }, 'UUID do cartão; se omitido, use nomeCartao'),
        nomeCartao: prop({ type: 'string' }, 'Nome do cartão (obrigatório se não tiver cartaoId)'),
        tipo: prop({ type: 'string', enum: ['compra', 'estorno', 'ajuste'] }),
        descricao: prop({ type: 'string' }),
        categoria: prop({ type: 'string' }),
        valor: prop({ type: 'number' }),
        parcelas: prop({ type: 'integer' }, '1 = à vista; 2–48 = parcelado'),
        data: prop({ type: 'string' }, 'AAAA-MM-DD')
      },
      required: ['descricao', 'categoria', 'valor', 'parcelas']
    }
  },
  {
    name: 'registrar_pagamento_fatura',
    description: 'Registra pagamento de uma fatura de cartão.',
    parameters: {
      type: 'object',
      properties: {
        faturaId: prop({ type: 'string' }),
        valor: prop({ type: 'number' }),
        data: prop({ type: 'string' })
      },
      required: ['faturaId', 'valor']
    }
  },
  {
    name: 'criar_evento',
    description: 'Cria evento na agenda (sincroniza com Google se conectado).',
    parameters: {
      type: 'object',
      properties: {
        titulo: prop({ type: 'string' }),
        data: prop({ type: 'string' }, 'AAAA-MM-DD'),
        diaInteiro: prop({ type: 'boolean' }),
        inicio: prop({ type: 'string' }, 'HH:MM'),
        fim: prop({ type: 'string' }, 'HH:MM'),
        categoria: prop({ type: 'string', enum: CATEGORIAS_EVENTO }),
        notas: prop({ type: 'string' })
      },
      required: ['titulo', 'data']
    }
  },
  {
    name: 'atualizar_evento',
    description: 'Atualiza evento existente.',
    parameters: {
      type: 'object',
      properties: {
        id: prop({ type: 'string' }),
        titulo: prop({ type: 'string' }),
        data: prop({ type: 'string' }),
        diaInteiro: prop({ type: 'boolean' }),
        inicio: prop({ type: 'string' }),
        fim: prop({ type: 'string' }),
        categoria: prop({ type: 'string', enum: CATEGORIAS_EVENTO }),
        notas: prop({ type: 'string' })
      },
      required: ['id']
    }
  },
  {
    name: 'listar_eventos',
    description:
      'Lista eventos da agenda (título, data, horário). Use para achar id antes de editar/excluir ou quando o usuário perguntar a agenda além do snapshot.',
    parameters: {
      type: 'object',
      properties: { limite: prop({ type: 'integer' }, 'Máximo de itens (padrão 30)') },
      required: []
    }
  },
  {
    name: 'criar_tarefa',
    description: 'Cria uma tarefa.',
    parameters: {
      type: 'object',
      properties: {
        texto: prop({ type: 'string' }),
        prioridade: prop({ type: 'string', enum: ['baixa', 'media', 'alta'] }),
        dueOn: prop({ type: 'string' }, 'AAAA-MM-DD'),
        notes: prop({ type: 'string' })
      },
      required: ['texto']
    }
  },
  {
    name: 'listar_tarefas',
    description:
      'Lista tarefas (texto, prioridade, prazo, status). Use filtro ativas/atrasadas/concluidas ou prioridade para aprofundar além do snapshot; necessário para obter id antes de atualizar/excluir.',
    parameters: {
      type: 'object',
      properties: {
        filtro: prop({ type: 'string', enum: ['todas', 'ativas', 'concluidas', 'atrasadas'] }),
        prioridade: prop({ type: 'string', enum: ['baixa', 'media', 'alta'] })
      },
      required: []
    }
  },
  {
    name: 'atualizar_tarefa',
    description: 'Atualiza campos de uma tarefa.',
    parameters: {
      type: 'object',
      properties: {
        id: prop({ type: 'string' }),
        texto: prop({ type: 'string' }),
        prioridade: prop({ type: 'string', enum: ['baixa', 'media', 'alta'] }),
        dueOn: prop({ type: 'string' }),
        notes: prop({ type: 'string' })
      },
      required: ['id']
    }
  },
  {
    name: 'atualizar_status_tarefa',
    description: 'Define status da tarefa em um dia (pendente, andamento, concluida).',
    parameters: {
      type: 'object',
      properties: {
        id: prop({ type: 'string' }),
        data: prop({ type: 'string' }, 'AAAA-MM-DD; omita para hoje'),
        status: prop({ type: 'string', enum: ['pendente', 'andamento', 'concluida'] })
      },
      required: ['id', 'status']
    }
  },
  {
    name: 'criar_favorito',
    description: 'Salva um link nos favoritos.',
    parameters: {
      type: 'object',
      properties: {
        nome: prop({ type: 'string' }),
        url: prop({ type: 'string' }),
        categoria: prop({ type: 'string' }),
        fixado: prop({ type: 'boolean' })
      },
      required: ['nome', 'url']
    }
  },
  {
    name: 'listar_favoritos',
    description: 'Lista favoritos salvos.',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'atualizar_favorito',
    description: 'Atualiza um favorito.',
    parameters: {
      type: 'object',
      properties: {
        id: prop({ type: 'string' }),
        nome: prop({ type: 'string' }),
        url: prop({ type: 'string' }),
        categoria: prop({ type: 'string' }),
        fixado: prop({ type: 'boolean' })
      },
      required: ['id']
    }
  },
  {
    name: 'obter_preferencias_resumo',
    description: 'Resumo seguro das preferências (sem foto).',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'atualizar_fuso',
    description: 'Altera o fuso horário da conta.',
    parameters: {
      type: 'object',
      properties: { fuso: prop({ type: 'string' }, 'Ex.: America/Sao_Paulo') },
      required: ['fuso']
    }
  },
  {
    name: 'pedir_confirmacao_exclusao',
    description:
      'Propõe exclusão de um registro. NÃO apaga agora — o usuário confirma no chat. Tipos: transacao, evento, tarefa, favorito, compra_cartao, pagamento_fatura.',
      parameters: {
        type: 'object',
        properties: {
          tipo: prop({
            type: 'string',
            enum: ['transacao', 'evento', 'tarefa', 'favorito', 'compra_cartao', 'pagamento_fatura']
          }),
        id: prop({ type: 'string' }),
        resumo: prop({ type: 'string' }, 'Frase curta do que será apagado')
      },
      required: ['tipo', 'id', 'resumo']
    }
  }
]

const zCriarTx = z.object({
  type: zTipo,
  description: zTexto(1, 200),
  category: zTexto(1, 60),
  amount: zValor,
  date: zData.optional()
})
const zAtualizarTx = z
  .object({
    id: zUuid,
    type: zTipo,
    description: zTexto(1, 200),
    category: zTexto(1, 60),
    amount: zValor,
    date: zData
  })
  .partial()
  .required({ id: true })

function hojeDe(usuario, agora) {
  return formatarNoFuso(agora, usuario.timezone || 'America/Sao_Paulo').data
}

function planejarCompra(dados, cartao) {
  const sinal = dados.tipo === 'estorno' ? -1 : dados.tipo === 'ajuste' && dados.sentido === 'credito' ? -1 : 1
  const centavos = paraCentavos(dados.valor)
  if (dados.tipo !== 'compra' && dados.parcelas !== 1) throw requisicaoInvalida('Estornos e ajustes não podem ser parcelados.')
  if (centavos < dados.parcelas) throw requisicaoInvalida('O valor é pequeno demais para esse número de parcelas.')
  const agenda = montarAgenda({
    data: dados.data,
    totalCentavos: centavos * sinal,
    parcelas: dados.parcelas,
    diaFechamento: cartao.diaFechamento,
    diaVencimento: cartao.diaVencimento
  })
  const TIPO_SQL = { compra: 'purchase', estorno: 'refund', ajuste: 'adjustment' }
  return {
    kind: TIPO_SQL[dados.tipo],
    total: centavosParaDecimal(centavos * sinal),
    itens: agenda.itens.map((i) => ({
      numero: i.numero,
      valor: centavosParaDecimal(i.centavos),
      competencia: i.competencia,
      ref_month: i.mesRef
    })),
    ciclos: agenda.ciclos.map((c) => ({
      ref_month: c.mesRef,
      period_start: c.inicio,
      closing_date: c.fechamento,
      due_date: c.vencimento
    }))
  }
}

async function painelCartoes(ctx) {
  const { repos, usuario, agora } = ctx
  const hoje = hojeDe(usuario, agora)
  const [lista, faturasBase, pagoNoMes] = await Promise.all([
    repos.cartoes.listarCartoes(usuario.id),
    repos.cartoes.listarFaturas(usuario.id, { relevantesDesde: hoje }),
    repos.cartoes.pagoNoMes(usuario.id, hoje.slice(0, 7))
  ])
  const faturas = faturasBase.map((f) => ({
    ...f,
    status: statusDaFatura({
      total: f.total,
      pago: f.pago,
      fechamento: f.fechamento,
      vencimento: f.vencimento,
      hoje
    })
  }))
  const cartoes = lista.map((c) => {
    const mesRef = mesDaFatura(hoje, c.diaFechamento)
    const existente = faturas.find((f) => f.cartaoId === c.id && f.mesRef === mesRef)
    const ciclo = cicloDaFatura(mesRef, c.diaFechamento, c.diaVencimento)
    const faturaAtual =
      existente ??
      ({
        id: null,
        cartaoId: c.id,
        cartaoNome: c.nome,
        mesRef,
        inicio: ciclo.inicio,
        fechamento: ciclo.fechamento,
        vencimento: ciclo.vencimento,
        total: 0,
        pago: 0,
        pendente: 0,
        status: statusDaFatura({ total: 0, pago: 0, fechamento: ciclo.fechamento, vencimento: ciclo.vencimento, hoje })
      })
    return { id: c.id, nome: c.nome, instituicao: c.instituicao, limite: c.limite, usado: c.usado, disponivel: c.disponivel, ativo: c.ativo, faturaAtual }
  })
  return { hoje, cartoes, pagoNoMes }
}

export async function executarTool(nome, argsBrutos, ctx) {
  const { repos, usuario, calendario, agora = new Date() } = ctx
  const args = argsBrutos && typeof argsBrutos === 'object' ? argsBrutos : {}

  try {
    if (TOOLS_ESCRITA.has(nome) && !ctx.forcarEscrita) {
      const previa = await montarPreviaEscrita(nome, args, ctx)
      return {
        ok: true,
        resumo: previa.resumo,
        dados: { previa: previa.preview },
        precisaConfirmacao: {
          kind: 'escrita',
          tool: nome,
          args: previa.args,
          preview: previa.preview,
          resumo: previa.resumo
        }
      }
    }

    switch (nome) {
      case 'criar_transacao': {
        const t = validar(zCriarTx, args)
        const data = t.date ?? hojeDe(usuario, agora)
        const transacao = await repos.transacoes.criar(usuario.id, { ...t, date: data })
        return {
          ok: true,
          resumo: `Registrei ${t.type === 'income' ? 'entrada' : t.type === 'saving' ? 'guardado' : 'despesa'} de R$ ${t.amount.toFixed(2)} (${t.category}).`,
          dados: { transacao },
          acao: { tool: nome, area: 'financeiro', entidade: transacao }
        }
      }
      case 'atualizar_transacao': {
        const c = validar(zAtualizarTx, args)
        const { id, ...resto } = c
        const transacao = await repos.transacoes.atualizar(usuario.id, id, resto)
        if (!transacao) throw naoEncontrado('Movimentação não encontrada.')
        return { ok: true, resumo: 'Movimentação atualizada.', dados: { transacao }, acao: { tool: nome, area: 'financeiro', entidade: transacao } }
      }
      case 'listar_resumo_financeiro': {
        const mes =
          typeof args.mes === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(args.mes)
            ? args.mes
            : hojeDe(usuario, agora).slice(0, 7)
        const resumo = await repos.transacoes.resumo(usuario.id, mes)
        return { ok: true, resumo: `Resumo de ${mes}: saldo R$ ${resumo.saldo.toFixed(2)}.`, dados: { resumo } }
      }
      case 'listar_categorias': {
        const proprias = await repos.transacoes.listarCategorias(usuario.id)
        return { ok: true, resumo: 'Categorias carregadas.', dados: { padrao: CATEGORIAS_PADRAO, proprias } }
      }
      case 'criar_categoria': {
        const c = validar(z.object({ tipo: zTipo, nome: zTexto(1, 40) }), args)
        if ((await repos.transacoes.contarCategorias(usuario.id)) >= 60) throw requisicaoInvalida('Limite de categorias atingido.')
        const categoria = await repos.transacoes.criarCategoria(usuario.id, c)
        return { ok: true, resumo: `Categoria “${categoria.nome}” criada.`, dados: { categoria }, acao: { tool: nome, area: 'financeiro', entidade: categoria } }
      }
      case 'obter_meta': {
        const meta = await repos.transacoes.obterMeta(usuario.id)
        return { ok: true, resumo: meta ? `Meta: ${meta.nome || 'sem nome'} R$ ${meta.valor}.` : 'Nenhuma meta definida.', dados: { meta } }
      }
      case 'salvar_meta': {
        const meta = await repos.transacoes.salvarMeta(usuario.id, validar(zMeta, args))
        return { ok: true, resumo: 'Meta salva.', dados: { meta }, acao: { tool: nome, area: 'financeiro', entidade: meta } }
      }
      case 'listar_cartoes_painel': {
        const painel = await painelCartoes(ctx)
        return { ok: true, resumo: `${painel.cartoes.length} cartão(ões).`, dados: painel }
      }
      case 'criar_compra_cartao': {
        const schema = z.object({
          cartaoId: zUuid.optional(),
          nomeCartao: z.string().trim().min(1).max(60).optional(),
          tipo: z.enum(['compra', 'estorno', 'ajuste']).default('compra'),
          sentido: z.enum(['cobranca', 'credito']).default('cobranca'),
          descricao: zTexto(1, 200),
          categoria: zTexto(1, 60),
          valor: zValor,
          parcelas: z.number().int().min(1).max(48).default(1),
          data: zData.optional()
        })
        const dados = validar(schema, args)
        const lista = await repos.cartoes.listarCartoes(usuario.id)
        let cartao = dados.cartaoId ? lista.find((c) => c.id === dados.cartaoId) : null
        if (!cartao && dados.nomeCartao) {
          const q = dados.nomeCartao.toLowerCase()
          cartao = lista.find((c) => c.nome.toLowerCase().includes(q) || (c.instituicao || '').toLowerCase().includes(q))
        }
        if (!cartao && lista.filter((c) => c.ativo).length === 1) cartao = lista.find((c) => c.ativo)
        if (!cartao) throw requisicaoInvalida('Qual cartão? Informe o nome ou o id.')
        if (!cartao.ativo) throw requisicaoInvalida('Este cartão está desativado.')
        const payload = { ...dados, data: dados.data ?? hojeDe(usuario, agora), parcelas: dados.parcelas ?? 1 }
        const plano = planejarCompra(payload, cartao)
        const id = randomUUID()
        const r = await repos.cartoes.criarCompra(usuario.id, {
          id,
          cartaoId: cartao.id,
          kind: plano.kind,
          descricao: payload.descricao,
          categoria: payload.categoria,
          total: plano.total,
          parcelas: payload.parcelas,
          data: payload.data,
          chave: null,
          ciclos: plano.ciclos,
          itens: plano.itens
        })
        if (!r.criada) throw conflito('Não foi possível registrar a compra agora.')
        return {
          ok: true,
          resumo: `Compra de R$ ${payload.valor.toFixed(2)} no ${cartao.nome}.`,
          dados: { compraId: id, cartao: cartao.nome },
          acao: { tool: nome, area: 'cartoes', entidade: { id, cartaoId: cartao.id } }
        }
      }
      case 'registrar_pagamento_fatura': {
        const dados = validar(
          z.object({ faturaId: zUuid, valor: zValor, data: zData.optional() }),
          args
        )
        const r = await repos.cartoes.registrarPagamento(usuario.id, {
          faturaId: dados.faturaId,
          valor: dados.valor,
          data: dados.data ?? hojeDe(usuario, agora)
        })
        if (!r.existe) throw naoEncontrado('Fatura não encontrada.')
        if (!r.id) throw requisicaoInvalida('O valor é maior que o saldo pendente da fatura.')
        return {
          ok: true,
          resumo: `Pagamento de R$ ${dados.valor.toFixed(2)} registrado.`,
          dados: { pagamentoId: r.id },
          acao: { tool: nome, area: 'cartoes', entidade: { id: r.id } }
        }
      }
      case 'criar_evento': {
        const bruto = {
          titulo: args.titulo,
          data: args.data,
          diaInteiro: args.diaInteiro ?? !args.inicio,
          inicio: args.inicio ?? '',
          fim: args.fim ?? '',
          categoria: args.categoria ?? 'pessoal',
          notas: args.notas ?? '',
          rec: { tipo: 'nenhuma', dias: [], ate: '' },
          excecoes: []
        }
        const dados = validar(zEvento, bruto)
        const estado = await calendario.estadoParaNovoEvento(usuario.id)
        const criado = await repos.eventos.criar(usuario.id, dados, estado)
        await calendario.enviarAgora(usuario.id, criado.id, usuario.timezone)
        const evento = await repos.eventos.obter(usuario.id, criado.id)
        return {
          ok: true,
          resumo: `Evento “${evento.titulo}” em ${evento.data}.`,
          dados: { evento },
          acao: { tool: nome, area: 'agenda', entidade: evento }
        }
      }
      case 'atualizar_evento': {
        const id = validar(zUuid, args.id)
        const bruto = await repos.eventos.bruto(usuario.id, id)
        if (!bruto || bruto.excluido) throw naoEncontrado('Evento não encontrado.')
        if (bruto.unsupported_recurrence) throw conflito('Evento só editável no Google Calendar.')
        const atual = await repos.eventos.obter(usuario.id, id)
        const mesclado = validar(zEvento, {
          titulo: args.titulo ?? atual.titulo,
          data: args.data ?? atual.data,
          diaInteiro: 'diaInteiro' in args ? Boolean(args.diaInteiro) : atual.diaInteiro,
          inicio: 'inicio' in args ? args.inicio ?? '' : atual.inicio,
          fim: 'fim' in args ? args.fim ?? '' : atual.fim,
          categoria: args.categoria ?? atual.categoria,
          notas: 'notas' in args ? args.notas ?? '' : atual.notas,
          rec: atual.rec,
          excecoes: atual.excecoes
        })
        const estado = await calendario.estadoParaNovoEvento(usuario.id)
        await repos.eventos.atualizar(usuario.id, id, mesclado, estado)
        await calendario.enviarAgora(usuario.id, id, usuario.timezone)
        const evento = await repos.eventos.obter(usuario.id, id)
        return { ok: true, resumo: 'Evento atualizado.', dados: { evento }, acao: { tool: nome, area: 'agenda', entidade: evento } }
      }
      case 'listar_eventos': {
        const limite = Math.min(Math.max(Number(args.limite) || 30, 1), 100)
        const eventos = await repos.eventos.listar(usuario.id, limite)
        return { ok: true, resumo: `${eventos.length} evento(s).`, dados: { eventos } }
      }
      case 'criar_tarefa': {
        const c = validar(
          z.object({
            texto: zTexto(1, 300),
            prioridade: z.enum(['baixa', 'media', 'alta']).optional().default('media'),
            dueOn: zData.optional().nullable(),
            notes: z.string().max(2000).optional().default('')
          }),
          args
        )
        const hoje = hojeDe(usuario, agora)
        const tarefa = await repos.tarefas.criar(usuario.id, {
          texto: c.texto,
          tipo: 'unica',
          data: hoje,
          dias: [],
          criada: hoje,
          prioridade: c.prioridade,
          dueOn: c.dueOn ?? null,
          notes: c.notes ?? ''
        })
        return { ok: true, resumo: `Tarefa “${tarefa.texto}” criada.`, dados: { tarefa }, acao: { tool: nome, area: 'tarefas', entidade: tarefa } }
      }
      case 'listar_tarefas': {
        const filtro = ['todas', 'ativas', 'concluidas', 'atrasadas'].includes(args.filtro) ? args.filtro : 'ativas'
        const prioridade = ['baixa', 'media', 'alta'].includes(args.prioridade) ? args.prioridade : null
        const tarefas = await repos.tarefas.listar(usuario.id, {
          filtro,
          prioridade,
          refDia: hojeDe(usuario, agora),
          limite: 40
        })
        return { ok: true, resumo: `${tarefas.length} tarefa(s).`, dados: { tarefas } }
      }
      case 'atualizar_tarefa': {
        const id = validar(zUuid, args.id)
        const campos = {}
        if ('texto' in args) campos.texto = validar(zTexto(1, 300), args.texto)
        if ('prioridade' in args) campos.prioridade = validar(z.enum(['baixa', 'media', 'alta']), args.prioridade)
        if ('dueOn' in args) campos.dueOn = args.dueOn == null ? null : validar(zData, args.dueOn)
        if ('notes' in args) campos.notes = String(args.notes ?? '').slice(0, 2000)
        const tarefa = await repos.tarefas.atualizar(usuario.id, id, campos)
        if (!tarefa) throw naoEncontrado('Tarefa não encontrada.')
        return { ok: true, resumo: 'Tarefa atualizada.', dados: { tarefa }, acao: { tool: nome, area: 'tarefas', entidade: tarefa } }
      }
      case 'atualizar_status_tarefa': {
        const id = validar(zUuid, args.id)
        const status = validar(z.enum(['pendente', 'andamento', 'concluida']), args.status)
        const data = args.data ? validar(zData, args.data) : hojeDe(usuario, agora)
        const ok = await repos.tarefas.definirStatus(usuario.id, id, data, status)
        if (!ok) throw naoEncontrado('Tarefa não encontrada.')
        const tarefa = await repos.tarefas.obter(usuario.id, id)
        return { ok: true, resumo: `Status da tarefa: ${status} em ${data}.`, dados: { tarefa }, acao: { tool: nome, area: 'tarefas', entidade: tarefa } }
      }
      case 'criar_favorito': {
        const c = validar(
          z.object({
            nome: zTexto(1, 80),
            url: zUrlHttp,
            categoria: zTexto(1, 40).default('Dia a dia'),
            fixado: z.boolean().default(true)
          }),
          args
        )
        const favorito = await repos.favoritos.criar(usuario.id, c)
        return { ok: true, resumo: `Favorito “${favorito.nome}” salvo.`, dados: { favorito }, acao: { tool: nome, area: 'favoritos', entidade: favorito } }
      }
      case 'listar_favoritos': {
        const favoritos = await repos.favoritos.listar(usuario.id)
        return { ok: true, resumo: `${favoritos.length} favorito(s).`, dados: { favoritos } }
      }
      case 'atualizar_favorito': {
        const id = validar(zUuid, args.id)
        const patch = {}
        if ('nome' in args) patch.nome = validar(zTexto(1, 80), args.nome)
        if ('url' in args) patch.url = validar(zUrlHttp, args.url)
        if ('categoria' in args) patch.categoria = validar(zTexto(1, 40), args.categoria)
        if ('fixado' in args) patch.fixado = Boolean(args.fixado)
        const favorito = await repos.favoritos.atualizar(usuario.id, id, patch)
        if (!favorito) throw naoEncontrado('Favorito não encontrado.')
        return { ok: true, resumo: 'Favorito atualizado.', dados: { favorito }, acao: { tool: nome, area: 'favoritos', entidade: favorito } }
      }
      case 'obter_preferencias_resumo': {
        const linha = await repos.preferencias.obter(usuario.id)
        const data = { ...(linha?.data ?? {}) }
        delete data.foto
        return {
          ok: true,
          resumo: 'Preferências carregadas.',
          dados: { preferencias: data, fuso: usuario.timezone, temFoto: Boolean(linha?.photo) }
        }
      }
      case 'atualizar_fuso': {
        const { fusoValido } = await import('../../lib/dates.js')
        const { fuso } = validar(z.object({ fuso: z.string().refine(fusoValido, 'Fuso horário inválido.') }), args)
        await repos.usuarios.definirFuso(usuario.id, fuso)
        return { ok: true, resumo: `Fuso atualizado para ${fuso}.`, dados: { fuso }, acao: { tool: nome, area: 'preferencias', entidade: { fuso } } }
      }
      case 'pedir_confirmacao_exclusao': {
        const c = validar(
          z.object({
            tipo: z.enum(['transacao', 'evento', 'tarefa', 'favorito', 'compra_cartao', 'pagamento_fatura']),
            id: zUuid,
            resumo: zTexto(1, 200)
          }),
          args
        )
        const preview = {
          titulo: 'Confirmar exclusão',
          modulo: 'Exclusão',
          destaque: c.resumo,
          status: 'Pendente',
          campos: [
            { label: 'Tipo', valor: c.tipo },
            { label: 'Resumo', valor: c.resumo }
          ],
          pergunta: 'Isso apaga o registro de forma permanente.'
        }
        return {
          ok: true,
          resumo: `Aguardando confirmação para apagar: ${c.resumo}`,
          precisaConfirmacao: {
            kind: 'exclusao',
            tipo: c.tipo,
            id: c.id,
            resumo: c.resumo,
            preview
          },
          dados: c
        }
      }
      default:
        return { ok: false, resumo: `Tool desconhecida: ${nome}`, dados: { erro: 'tool_desconhecida' } }
    }
  } catch (erro) {
    if (erro instanceof HttpError) {
      return { ok: false, resumo: erro.message, dados: { erro: erro.codigo, detalhes: erro.detalhes } }
    }
    throw erro
  }
}

export async function executarEscritaConfirmada({ tool, args }, ctx) {
  if (!TOOLS_ESCRITA.has(tool)) throw requisicaoInvalida('Ação de escrita inválida.')
  const r = await executarTool(tool, args, { ...ctx, forcarEscrita: true })
  if (!r.ok) throw requisicaoInvalida(r.resumo || 'Não foi possível executar.')
  return r
}

export async function executarExclusaoConfirmada({ tipo, id }, ctx) {
  const { repos, usuario, calendario } = ctx
  switch (tipo) {
    case 'transacao':
      if (!(await repos.transacoes.excluir(usuario.id, id))) throw naoEncontrado('Movimentação não encontrada.')
      return { resumo: 'Movimentação apagada.', area: 'financeiro' }
    case 'evento': {
      const bruto = await repos.eventos.bruto(usuario.id, id)
      if (!bruto || bruto.excluido) throw naoEncontrado('Evento não encontrado.')
      const estado = await calendario.estadoParaNovoEvento(usuario.id)
      if (bruto.google_etag && estado === 'pending') {
        await repos.eventos.marcarParaExclusao(usuario.id, id)
        await calendario.enviarAgora(usuario.id, id, usuario.timezone)
      } else {
        await repos.eventos.excluirDefinitivo(usuario.id, id)
      }
      return { resumo: 'Evento apagado.', area: 'agenda' }
    }
    case 'tarefa':
      if (!(await repos.tarefas.excluir(usuario.id, id))) throw naoEncontrado('Tarefa não encontrada.')
      return { resumo: 'Tarefa apagada.', area: 'tarefas' }
    case 'favorito':
      if (!(await repos.favoritos.excluir(usuario.id, id))) throw naoEncontrado('Favorito não encontrado.')
      return { resumo: 'Favorito apagado.', area: 'favoritos' }
    case 'compra_cartao':
      if (!(await repos.cartoes.obterCompra(usuario.id, id))) throw naoEncontrado('Lançamento não encontrado.')
      if (!(await repos.cartoes.excluirCompra(usuario.id, id))) throw conflito('Há pagamentos nesta compra.')
      return { resumo: 'Compra do cartão apagada.', area: 'cartoes' }
    case 'pagamento_fatura':
      if (!(await repos.cartoes.excluirPagamento(usuario.id, id))) throw naoEncontrado('Pagamento não encontrado.')
      return { resumo: 'Pagamento apagado.', area: 'cartoes' }
    default:
      throw requisicaoInvalida('Tipo de exclusão inválido.')
  }
}
