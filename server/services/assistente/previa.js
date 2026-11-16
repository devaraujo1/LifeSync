import { z } from 'zod'
import { formatarNoFuso } from '../../lib/dates.js'
import { requisicaoInvalida } from '../../lib/errors.js'
import { validar, zData, zTexto, zUrlHttp, zValor } from '../../lib/validate.js'
import { zEvento } from '../../routes/eventos.js'
import { zMeta } from '../../routes/transacoes.js'
import { CATEGORIAS_PADRAO } from './prompt.js'

const zTipo = z.enum(['expense', 'income', 'saving'])
const zUuid = z.string().uuid()

export const TOOLS_ESCRITA = new Set([
  'criar_transacao',
  'atualizar_transacao',
  'criar_categoria',
  'salvar_meta',
  'criar_compra_cartao',
  'registrar_pagamento_fatura',
  'criar_evento',
  'atualizar_evento',
  'criar_tarefa',
  'atualizar_tarefa',
  'atualizar_status_tarefa',
  'criar_favorito',
  'atualizar_favorito',
  'atualizar_fuso'
])

function hojeDe(usuario, agora) {
  return formatarNoFuso(agora, usuario.timezone || 'America/Sao_Paulo').data
}

function dinheiro(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return String(n ?? '')
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function labelTipoTx(t) {
  if (t === 'income') return 'Receita'
  if (t === 'saving') return 'Guardado'
  return 'Despesa'
}

function rotuloData(iso, usuario, agora) {
  const hoje = hojeDe(usuario, agora)
  if (!iso) return 'Hoje'
  if (iso === hoje) return 'Hoje'
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  return String(iso)
}

export function normalizarDataEdit(valor, ctx) {
  const s = String(valor ?? '').trim()
  if (!s) return s
  if (/^hoje$/i.test(s)) return hojeDe(ctx.usuario, ctx.agora || new Date())
  if (/^amanh[aã]$/i.test(s)) {
    const base = new Date(hojeDe(ctx.usuario, ctx.agora || new Date()) + 'T12:00:00')
    base.setDate(base.getDate() + 1)
    const y = base.getFullYear()
    const m = String(base.getMonth() + 1).padStart(2, '0')
    const d = String(base.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  let m = s.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return s
}

export function normalizarDinheiroEdit(valor) {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor
  let s = String(valor ?? '').trim().replace(/[R$\s]/gi, '')
  if (!s) return valor
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.')
  else if (s.includes(',')) s = s.replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : valor
}

function normalizarParcelasEdit(valor) {
  const raw = String(valor ?? '').trim().toLowerCase()
  if (!raw) return valor
  if (/[aà]\s*vista|avista|^1x?$/.test(raw)) return 1
  const n = parseInt(raw.replace(/[^\d]/g, ''), 10)
  return Number.isFinite(n) && n > 0 ? n : valor
}

function padHora(h) {
  const m = String(h).match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return h
  return `${m[1].padStart(2, '0')}:${m[2]}`
}

export function normalizarHoraEdit(valor) {
  const s = String(valor ?? '').trim()
  if (!s || /^dia\s*inteiro$/i.test(s) || /^[—–−\-]$/.test(s)) {
    return { diaInteiro: true, inicio: '', fim: '' }
  }

  let norm = s
    .replace(/[—–−]/g, '-')
    .replace(/\s*às\s*/gi, '-')
    .replace(/\s+as\s+/gi, '-')
    .replace(/\s+a\s+/gi, '-')
    .replace(/\s*~\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim()

  let m = norm.match(/^(\d{1,2})h(\d{2})?(?:-(\d{1,2})h(\d{2})?)?$/i)
  if (m) {
    return {
      diaInteiro: false,
      inicio: padHora(`${m[1]}:${m[2] || '00'}`),
      fim: m[3] != null ? padHora(`${m[3]}:${m[4] || '00'}`) : ''
    }
  }

  m = norm.match(/^(\d{1,2}):(\d{2})(?:\s*-\s*(\d{1,2}):(\d{2}))?$/)
  if (m) {
    return {
      diaInteiro: false,
      inicio: padHora(`${m[1]}:${m[2]}`),
      fim: m[3] != null ? padHora(`${m[3]}:${m[4]}`) : ''
    }
  }

  m = norm.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/)
  if (m) {
    return {
      diaInteiro: false,
      inicio: padHora(`${m[1]}:00`),
      fim: padHora(`${m[2]}:00`)
    }
  }

  return null
}

function normalizarCategoriaEvento(valor) {
  const s = String(valor ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
  const mapa = {
    pessoal: 'pessoal',
    trabalho: 'trabalho',
    estudos: 'estudos',
    estudo: 'estudos',
    saude: 'saude',
    lazer: 'lazer'
  }
  return mapa[s] || s
}

function normalizarPrioridade(valor) {
  const s = String(valor ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
  const mapa = { baixa: 'baixa', media: 'media', alta: 'alta', low: 'baixa', high: 'alta' }
  return mapa[s] || s
}

function card({ modulo, destaque, campos, pergunta, titulo }) {
  return {
    titulo: titulo || 'Confirmar lançamento',
    modulo,
    destaque: destaque || null,
    campos: campos.filter((c) => c.valor != null && String(c.valor).trim() !== ''),
    pergunta: pergunta ?? null,
    status: 'Pendente'
  }
}

export async function montarPreviaEscrita(nome, argsBrutos, ctx) {
  const { repos, usuario, agora = new Date() } = ctx
  const args = argsBrutos && typeof argsBrutos === 'object' ? argsBrutos : {}

  switch (nome) {
    case 'criar_transacao': {
      const t = validar(
        z.object({
          type: zTipo,
          description: zTexto(1, 200),
          category: zTexto(1, 60),
          amount: zValor,
          date: zData.optional(),
          pagamento: z.enum(['pix', 'dinheiro']).optional()
        }),
        args
      )
      if (t.type === 'expense' && !t.pagamento) {
        throw requisicaoInvalida('Qual a forma de pagamento: Pix ou dinheiro? (Cartão usa outra tool.)')
      }
      const data = t.date ?? hojeDe(usuario, agora)
      const labelPag =
        t.pagamento === 'pix' ? 'Pix' : t.pagamento === 'dinheiro' ? 'Dinheiro' : null
      // pagamento só entra na prévia; o repo de transações não tem esse campo
      const { pagamento, ...paraRepo } = t
      const normalizado = { ...paraRepo, date: data }
      const preview = card({
        titulo: t.type === 'income' ? 'Confirmar receita' : t.type === 'saving' ? 'Confirmar valor guardado' : 'Confirmar despesa',
        modulo: 'Finanças',
        destaque: dinheiro(t.amount),
        campos: [
          { label: 'Valor', valor: dinheiro(t.amount), key: 'amount' },
          { label: 'Descrição', valor: t.description, key: 'description' },
          { label: 'Tipo', valor: labelTipoTx(t.type), key: 'type' },
          { label: 'Categoria', valor: t.category, key: 'category' },
          labelPag ? { label: 'Pagamento', valor: labelPag, key: 'pagamento' } : null,
          { label: 'Data', valor: rotuloData(data, usuario, agora), key: 'date' }
        ].filter(Boolean)
      })
      return {
        args: pagamento ? { ...normalizado, pagamento } : normalizado,
        preview,
        resumo: `Prévia: ${labelTipoTx(t.type).toLowerCase()} ${dinheiro(t.amount)} — ${t.description}`
      }
    }
    case 'atualizar_transacao': {
      const c = validar(
        z
          .object({
            id: zUuid,
            type: zTipo,
            description: zTexto(1, 200),
            category: zTexto(1, 60),
            amount: zValor,
            date: zData
          })
          .partial()
          .required({ id: true }),
        args
      )
      const preview = card({
        titulo: 'Confirmar edição',
        modulo: 'Finanças',
        destaque: c.amount != null ? dinheiro(c.amount) : null,
        campos: [
          { label: 'ID', valor: c.id.slice(0, 8) + '…', key: 'id' },
          c.description ? { label: 'Descrição', valor: c.description, key: 'description' } : null,
          c.type ? { label: 'Tipo', valor: labelTipoTx(c.type), key: 'type' } : null,
          c.category ? { label: 'Categoria', valor: c.category, key: 'category' } : null,
          c.amount != null ? { label: 'Valor', valor: dinheiro(c.amount), key: 'amount' } : null,
          c.date ? { label: 'Data', valor: c.date, key: 'date' } : null
        ].filter(Boolean)
      })
      return { args: c, preview, resumo: 'Prévia de edição financeira.' }
    }
    case 'criar_categoria': {
      const c = validar(z.object({ tipo: zTipo, nome: zTexto(1, 40) }), args)
      const preview = card({
        titulo: 'Criar categoria',
        modulo: 'Finanças',
        campos: [
          { label: 'Nome', valor: c.nome, key: 'nome' },
          { label: 'Tipo', valor: labelTipoTx(c.tipo), key: 'tipo' }
        ]
      })
      return { args: c, preview, resumo: `Prévia: categoria “${c.nome}”` }
    }
    case 'salvar_meta': {
      const meta = validar(zMeta, args)
      const preview = card({
        titulo: 'Confirmar meta',
        modulo: 'Finanças',
        destaque: dinheiro(meta.valor),
        campos: [
          { label: 'Nome', valor: meta.nome || '—', key: 'nome' },
          { label: 'Prazo', valor: meta.prazo, key: 'prazo' }
        ]
      })
      return { args: meta, preview, resumo: `Prévia: meta ${dinheiro(meta.valor)}` }
    }
    case 'criar_compra_cartao': {
      if (args.parcelas == null) {
        throw requisicaoInvalida('Foi à vista ou parcelado? Se parcelado, em quantas vezes?')
      }
      const schema = z.object({
        cartaoId: zUuid.optional(),
        nomeCartao: z.string().trim().min(1).max(60).optional(),
        tipo: z.enum(['compra', 'estorno', 'ajuste']).default('compra'),
        sentido: z.enum(['cobranca', 'credito']).default('cobranca'),
        descricao: zTexto(1, 200),
        categoria: zTexto(1, 60),
        valor: zValor,
        parcelas: z.number().int().min(1).max(48),
        data: zData.optional()
      })
      const dados = validar(schema, args)
      if (!dados.cartaoId && !dados.nomeCartao) {
        throw requisicaoInvalida('Qual cartão foi usado?')
      }
      const lista = await repos.cartoes.listarCartoes(usuario.id)
      let cartao = dados.cartaoId ? lista.find((c) => c.id === dados.cartaoId) : null
      if (!cartao && dados.nomeCartao) {
        const q = dados.nomeCartao.toLowerCase()
        cartao = lista.find((c) => c.nome.toLowerCase().includes(q) || (c.instituicao || '').toLowerCase().includes(q))
      }
      if (!cartao && lista.filter((c) => c.ativo).length === 1) cartao = lista.find((c) => c.ativo)
      if (!cartao) throw requisicaoInvalida('Qual cartão? Informe o nome (use listar_cartoes_painel se precisar).')
      const normalizado = {
        ...dados,
        cartaoId: cartao.id,
        data: dados.data ?? hojeDe(usuario, agora),
        parcelas: dados.parcelas
      }
      const rotuloParcelas =
        normalizado.parcelas <= 1 ? 'À vista' : `${normalizado.parcelas}x`
      const preview = card({
        titulo: 'Confirmar compra no cartão',
        modulo: 'Cartão',
        destaque: dinheiro(dados.valor),
        campos: [
          { label: 'Valor', valor: dinheiro(dados.valor), key: 'valor' },
          { label: 'Descrição', valor: dados.descricao, key: 'descricao' },
          { label: 'Cartão', valor: cartao.nome, key: 'nomeCartao' },
          { label: 'Pagamento', valor: 'Cartão', editavel: false },
          { label: 'Categoria', valor: dados.categoria, key: 'categoria' },
          { label: 'Parcelas', valor: rotuloParcelas, key: 'parcelas' },
          { label: 'Data', valor: rotuloData(normalizado.data, usuario, agora), key: 'data' }
        ]
      })
      return { args: normalizado, preview, resumo: `Prévia: compra ${dinheiro(dados.valor)} no ${cartao.nome} (${rotuloParcelas})` }
    }
    case 'registrar_pagamento_fatura': {
      const dados = validar(z.object({ faturaId: zUuid, valor: zValor, data: zData.optional() }), args)
      const normalizado = { ...dados, data: dados.data ?? hojeDe(usuario, agora) }
      const preview = card({
        titulo: 'Confirmar pagamento',
        modulo: 'Cartão',
        destaque: dinheiro(dados.valor),
        campos: [
          { label: 'Fatura', valor: dados.faturaId.slice(0, 8) + '…', key: 'faturaId' },
          { label: 'Data', valor: normalizado.data, key: 'data' }
        ]
      })
      return { args: normalizado, preview, resumo: `Prévia: pagamento ${dinheiro(dados.valor)}` }
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
      const preview = card({
        titulo: 'Confirmar evento',
        modulo: 'Agenda',
        destaque: dados.titulo,
        campos: [
          { label: 'Título', valor: dados.titulo, key: 'titulo' },
          { label: 'Data', valor: rotuloData(dados.data, usuario, agora), key: 'data' },
          {
            label: 'Horário',
            valor: dados.diaInteiro ? 'Dia inteiro' : `${dados.inicio || ''}${dados.fim ? `-${dados.fim}` : ''}`,
            key: 'horario'
          },
          { label: 'Categoria', valor: dados.categoria, key: 'categoria' }
        ]
      })
      return {
        args: {
          titulo: dados.titulo,
          data: dados.data,
          diaInteiro: dados.diaInteiro,
          inicio: dados.inicio,
          fim: dados.fim,
          categoria: dados.categoria,
          notas: dados.notas
        },
        preview,
        resumo: `Prévia: evento “${dados.titulo}”`
      }
    }
    case 'atualizar_evento': {
      const id = validar(zUuid, args.id)
      const preview = card({
        titulo: 'Confirmar edição',
        modulo: 'Agenda',
        destaque: args.titulo || null,
        campos: [
          { label: 'ID', valor: id.slice(0, 8) + '…', key: 'id', editavel: false },
          args.titulo ? { label: 'Título', valor: args.titulo, key: 'titulo' } : null,
          args.data ? { label: 'Data', valor: rotuloData(args.data, usuario, agora), key: 'data' } : null,
          args.inicio || args.diaInteiro
            ? {
                label: 'Horário',
                valor: args.diaInteiro ? 'Dia inteiro' : `${args.inicio || ''}${args.fim ? `-${args.fim}` : ''}`,
                key: 'horario'
              }
            : null
        ].filter(Boolean)
      })
      return { args: { ...args, id }, preview, resumo: 'Prévia de edição de evento.' }
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
      const preview = card({
        titulo: 'Confirmar tarefa',
        modulo: 'Tarefas',
        destaque: c.texto,
        campos: [
          { label: 'Prioridade', valor: c.prioridade, key: 'prioridade' },
          c.dueOn ? { label: 'Prazo', valor: c.dueOn, key: 'dueOn' } : null
        ].filter(Boolean)
      })
      return { args: c, preview, resumo: `Prévia: tarefa “${c.texto}”` }
    }
    case 'atualizar_tarefa':
    case 'atualizar_status_tarefa': {
      const id = validar(zUuid, args.id)
      const preview = card({
        titulo: 'Confirmar alteração',
        modulo: 'Tarefas',
        campos: [
          { label: 'ID', valor: id.slice(0, 8) + '…', key: 'id' },
          args.texto ? { label: 'Texto', valor: args.texto, key: 'texto' } : null,
          args.status ? { label: 'Status', valor: args.status, key: 'status' } : null,
          args.prioridade ? { label: 'Prioridade', valor: args.prioridade, key: 'prioridade' } : null
        ].filter(Boolean)
      })
      return { args: { ...args, id }, preview, resumo: 'Prévia de alteração de tarefa.' }
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
      const preview = card({
        titulo: 'Confirmar favorito',
        modulo: 'Favoritos',
        destaque: c.nome,
        campos: [
          { label: 'URL', valor: c.url, key: 'url' },
          { label: 'Categoria', valor: c.categoria, key: 'categoria' }
        ]
      })
      return { args: c, preview, resumo: `Prévia: favorito “${c.nome}”` }
    }
    case 'atualizar_favorito': {
      const id = validar(zUuid, args.id)
      const preview = card({
        titulo: 'Confirmar edição',
        modulo: 'Favoritos',
        campos: [{ label: 'ID', valor: id.slice(0, 8) + '…', key: 'id' }]
      })
      return { args: { ...args, id }, preview, resumo: 'Prévia de edição de favorito.' }
    }
    case 'atualizar_fuso': {
      const { fusoValido } = await import('../../lib/dates.js')
      const { fuso } = validar(z.object({ fuso: z.string().refine(fusoValido, 'Fuso horário inválido.') }), args)
      const preview = card({
        titulo: 'Atualizar fuso',
        modulo: 'Preferências',
        destaque: fuso,
        campos: [{ label: 'Fuso', valor: fuso, key: 'fuso' }]
      })
      return { args: { fuso }, preview, resumo: `Prévia: fuso ${fuso}` }
    }
    default:
      throw requisicaoInvalida(`Prévia não suportada para ${nome}`)
  }
}

export async function mesclarEdicaoPrevia(tool, argsAtuais, edicao, ctx) {
  const patch = edicao && typeof edicao === 'object' ? { ...edicao } : {}

  if (tool === 'criar_compra_cartao') delete patch.pagamento
  else if (/^cart[aã]o$/i.test(String(patch.pagamento || '').trim())) delete patch.pagamento
  delete patch.id

  if (patch.date != null) patch.date = normalizarDataEdit(patch.date, ctx)
  if (patch.data != null) patch.data = normalizarDataEdit(patch.data, ctx)
  if (patch.dueOn != null) patch.dueOn = normalizarDataEdit(patch.dueOn, ctx)
  if (patch.amount != null) patch.amount = normalizarDinheiroEdit(patch.amount)
  if (patch.valor != null) patch.valor = normalizarDinheiroEdit(patch.valor)

  if (tool === 'criar_transacao' || tool === 'atualizar_transacao') {
    if (patch.description != null) patch.description = String(patch.description).trim()
    if (patch.category != null) patch.category = String(patch.category).trim()
    if (patch.type != null) {
      const mapa = {
        despesa: 'expense',
        receita: 'income',
        guardado: 'saving',
        expense: 'expense',
        income: 'income',
        saving: 'saving'
      }
      const t = String(patch.type).trim().toLowerCase()
      patch.type = mapa[t] || patch.type
    }
    if (patch.pagamento != null) {
      const mapaPag = {
        pix: 'pix',
        dinheiro: 'dinheiro',
        espécie: 'dinheiro',
        especie: 'dinheiro',
        cash: 'dinheiro'
      }
      const p = String(patch.pagamento).trim().toLowerCase()
      if (mapaPag[p]) patch.pagamento = mapaPag[p]
      else delete patch.pagamento
    }
  }

  if (tool === 'criar_compra_cartao' || tool === 'registrar_pagamento_fatura') {
    if (patch.parcelas != null) patch.parcelas = normalizarParcelasEdit(patch.parcelas)
    if (patch.descricao != null) patch.descricao = String(patch.descricao).trim()
    if (patch.categoria != null) patch.categoria = String(patch.categoria).trim()
    if (patch.nomeCartao != null) patch.nomeCartao = String(patch.nomeCartao).trim()
  }

  if (tool === 'criar_evento' || tool === 'atualizar_evento') {
    if (patch.titulo != null) patch.titulo = String(patch.titulo).trim()
    if (patch.categoria != null) patch.categoria = normalizarCategoriaEvento(patch.categoria)

    // Card novo: `horario`. Card antigo: `inicio` pode vir como "09:00-10:00" ou "Dia inteiro".
    const brutoHora =
      patch.horario != null
        ? String(patch.horario)
        : patch.inicio != null
          ? patch.fim && /^\d{1,2}:\d{2}$/.test(String(patch.inicio).trim())
            ? `${patch.inicio}-${patch.fim}`
            : String(patch.inicio)
          : null

    if (brutoHora != null) {
      const parsed = normalizarHoraEdit(brutoHora)
      if (!parsed) {
        throw requisicaoInvalida('Horário inválido. Use Dia inteiro, 14:00 ou 14:00-15:00.')
      }
      patch.diaInteiro = parsed.diaInteiro
      patch.inicio = parsed.inicio
      patch.fim = parsed.fim || ''
    }
    delete patch.horario
  }

  if (tool === 'criar_tarefa' || tool === 'atualizar_tarefa' || tool === 'atualizar_status_tarefa') {
    if (patch.texto != null) patch.texto = String(patch.texto).trim()
    if (patch.prioridade != null) patch.prioridade = normalizarPrioridade(patch.prioridade)
    if (patch.status != null) {
      const st = String(patch.status)
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
      const mapa = {
        pendente: 'pendente',
        andamento: 'andamento',
        'em andamento': 'andamento',
        concluida: 'concluida',
        concluido: 'concluida'
      }
      patch.status = mapa[st] || st
    }
  }

  if (tool === 'criar_favorito' || tool === 'atualizar_favorito') {
    if (patch.nome != null) patch.nome = String(patch.nome).trim()
    if (patch.url != null) patch.url = String(patch.url).trim()
    if (patch.categoria != null) patch.categoria = String(patch.categoria).trim()
  }

  const mesclado = { ...argsAtuais, ...patch }
  return montarPreviaEscrita(tool, mesclado, ctx)
}

export { CATEGORIAS_PADRAO }
