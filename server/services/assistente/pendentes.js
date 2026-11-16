import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

const TTL_MS = 10 * 60 * 1000
/** Evita payload gigante (ex.: anotação grande) na tabela de pendências. */
const MAX_JSON_CHARS = 12_000

function limitarJson(valor) {
  if (valor == null) return null
  const s = JSON.stringify(valor)
  if (s.length <= MAX_JSON_CHARS) return valor
  if (typeof valor === 'string') return valor.slice(0, MAX_JSON_CHARS)
  if (typeof valor === 'object') {
    const copia = { ...valor }
    for (const k of ['corpo', 'notas', 'conteudo', 'texto', 'descricao']) {
      if (typeof copia[k] === 'string' && copia[k].length > 4000) {
        copia[k] = `${copia[k].slice(0, 4000)}…`
      }
    }
    const s2 = JSON.stringify(copia)
    if (s2.length <= MAX_JSON_CHARS) return copia
    return { _truncado: true, resumo: String(copia.resumo || copia.titulo || '').slice(0, 200) }
  }
  return valor
}

/** JSON estável (chaves ordenadas) — sobrevive a round-trip jsonb. */
function estavel(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(estavel).join(',')}]`
  const keys = Object.keys(v).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${estavel(v[k])}`).join(',')}}`
}

function assinar(payload, secret) {
  return createHmac('sha256', secret).update(estavel(payload)).digest('hex')
}

function verificarAssinatura(payload, assinatura, secret) {
  const esperada = assinar(payload, secret)
  const a = Buffer.from(String(assinatura || ''))
  const b = Buffer.from(esperada)
  return a.length === b.length && timingSafeEqual(a, b)
}

function linhaParaItem(r) {
  if (!r) return null
  return {
    userId: r.user_id,
    kind: r.kind,
    tipo: r.tipo ?? null,
    idAlvo: r.id_alvo ?? null,
    tool: r.tool ?? null,
    args: r.args ?? null,
    preview: r.preview ?? null,
    resumo: r.resumo,
    expiraEm: Number(r.expira_em_ms),
    assinatura: r.assinatura
  }
}

/** Campos assinados — sem expiraEm (precisão de timestamptz quebra o HMAC). */
function payloadAssinado(item) {
  return {
    userId: item.userId,
    kind: item.kind,
    tipo: item.tipo ?? null,
    idAlvo: item.idAlvo ?? null,
    tool: item.tool ?? null,
    args: item.args ?? null,
    preview: item.preview ?? null,
    resumo: item.resumo
  }
}

/**
 * @param {{ userId, kind: 'exclusao'|'escrita', resumo, secret, tipo?, idAlvo?, tool?, args?, preview?, repos }} p
 */
export async function guardarPendencia(p) {
  const repo = p.repos?.assistentePendentes
  if (!repo) throw new Error('Repositório de pendências ausente.')
  await repo.limparExpirados().catch(() => {})

  const id = randomUUID()
  const expiraEm = Date.now() + TTL_MS
  const dados = {
    userId: p.userId,
    kind: p.kind || 'exclusao',
    tipo: p.tipo ?? null,
    idAlvo: p.idAlvo ?? null,
    tool: p.tool ?? null,
    args: limitarJson(p.args ?? null),
    preview: limitarJson(p.preview ?? null),
    resumo: String(p.resumo ?? '').slice(0, 500)
  }
  const assinatura = assinar(payloadAssinado(dados), p.secret)
  await repo.inserir({ id, ...dados, assinatura, expiraEm })
  return {
    id,
    kind: dados.kind,
    resumo: dados.resumo,
    preview: dados.preview,
    expiraEm
  }
}

export async function lerPendencia({ confirmId, userId, secret, repos }) {
  const repo = repos?.assistentePendentes
  if (!repo) return null
  const r = await repo.buscar(confirmId, userId)
  const item = linhaParaItem(r)
  if (!item) return null
  if (!verificarAssinatura(payloadAssinado(item), item.assinatura, secret)) return null
  return item
}

export async function consumirPendencia({ confirmId, userId, secret, repos }) {
  const repo = repos?.assistentePendentes
  if (!repo) return null
  // Valida antes de consumir (evita apagar se a assinatura estiver inválida).
  const atual = await lerPendencia({ confirmId, userId, secret, repos })
  if (!atual) return null
  const r = await repo.consumir(confirmId, userId)
  if (!r) return null
  return {
    kind: atual.kind || 'exclusao',
    tipo: atual.tipo,
    id: atual.idAlvo,
    tool: atual.tool,
    args: atual.args,
    preview: atual.preview,
    resumo: atual.resumo
  }
}

export async function atualizarPendencia({ confirmId, userId, secret, args, preview, resumo, repos }) {
  const repo = repos?.assistentePendentes
  if (!repo) return null
  const atual = await lerPendencia({ confirmId, userId, secret, repos })
  if (!atual || atual.kind !== 'escrita') return null

  const argsLim = limitarJson(args)
  const previewLim = limitarJson(preview)
  const resumoLim = String(resumo ?? '').slice(0, 500)
  const dados = {
    userId: atual.userId,
    kind: atual.kind,
    tipo: atual.tipo,
    idAlvo: atual.idAlvo,
    tool: atual.tool,
    args: argsLim,
    preview: previewLim,
    resumo: resumoLim
  }
  const assinatura = assinar(payloadAssinado(dados), secret)
  const r = await repo.atualizar(confirmId, userId, {
    args: argsLim,
    preview: previewLim,
    resumo: resumoLim,
    assinatura
  })
  if (!r) return null
  return {
    id: confirmId,
    kind: r.kind,
    resumo: r.resumo,
    preview: r.preview,
    expiraEm: Number(r.expira_em_ms)
  }
}

export async function descartarPendencia({ confirmId, userId, secret, repos }) {
  const atual = await lerPendencia({ confirmId, userId, secret, repos })
  if (!atual) return false
  return repos.assistentePendentes.descartar(confirmId, userId)
}
