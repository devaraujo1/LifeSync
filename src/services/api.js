export class ApiError extends Error {
  constructor(status, codigo, mensagem, detalhes) {
    super(mensagem)
    this.name = 'ApiError'
    this.status = status
    this.codigo = codigo
    this.detalhes = detalhes
  }
}

export const EVENTO_SESSAO_EXPIRADA = 'lifesync:sessao-expirada'

let csrfToken = null
let usuarioAtual = null

async function requisitar(metodo, caminho, corpo, { cabecalhos = {}, bruto = false, aoExpirar = true, signal } = {}) {
  const opcoes = { method: metodo, credentials: 'same-origin', headers: { Accept: 'application/json', ...cabecalhos }, signal }
  if (metodo !== 'GET' && csrfToken) opcoes.headers['X-CSRF-Token'] = csrfToken
  if (corpo !== undefined) {
    if (bruto) opcoes.body = corpo
    else {
      opcoes.headers['Content-Type'] = 'application/json'
      opcoes.body = JSON.stringify(corpo)
    }
  }

  let resp
  try {
    resp = await fetch(`/api${caminho}`, opcoes)
  } catch (erro) {
    if (erro?.name === 'AbortError' || signal?.aborted) {
      throw new ApiError(0, 'abortado', 'Requisição cancelada.')
    }
    throw new ApiError(0, 'sem_conexao', 'Sem conexão com o servidor.')
  }

  if (resp.status === 204) return null
  let dados = null
  if (resp.headers.get('content-type')?.includes('application/json')) {
    try {
      dados = await resp.json()
    } catch {
      throw new ApiError(resp.status, 'json_invalido', 'Resposta inválida do servidor.')
    }
  }
  if (!resp.ok) {
    const e = dados?.erro ?? {}
    if (resp.status === 401 && aoExpirar) window.dispatchEvent(new CustomEvent(EVENTO_SESSAO_EXPIRADA))
    const detalhe = e.detalhes?.[0]
    const complemento = detalhe ? ` (${detalhe.campo ? `${detalhe.campo}: ` : ''}${detalhe.mensagem})` : ''
    throw new ApiError(resp.status, e.codigo ?? 'erro', `${e.mensagem ?? 'Erro inesperado.'}${complemento}`, e.detalhes)
  }
  return dados
}

// Pré-carga: a porta de entrada (guarda.js) dispara os GETs da página assim que a sessão é confirmada,
// em paralelo com o download dos módulos. Cada resposta é consumida uma única vez e só vale por alguns
// segundos; se a pré-carga falhar ou vencer, o módulo faz a requisição normal.
const VALIDADE_PRECARGA_MS = 15000
const precarga = new Map()

export function precarregar(caminhos) {
  for (const caminho of caminhos) {
    if (precarga.has(caminho)) continue
    const promessa = requisitar('GET', caminho, undefined, { aoExpirar: false })
    promessa.catch(() => {}) // a falha aparece para quem consumir; aqui só evita aviso de rejeição ignorada
    precarga.set(caminho, { promessa, quando: Date.now() })
  }
}

function consumirPrecarga(caminho) {
  const item = precarga.get(caminho)
  if (!item) return null
  precarga.delete(caminho)
  if (Date.now() - item.quando > VALIDADE_PRECARGA_MS) return null
  return item.promessa.catch(() => requisitar('GET', caminho))
}

export const api = {
  get: (c, opts) => {
    // Com signal (abort), não usa pré-carga — senão o AbortController do caller seria ignorado.
    if (opts?.signal) return requisitar('GET', c, undefined, opts)
    return consumirPrecarga(c) ?? requisitar('GET', c, undefined, opts)
  },
  // Sempre vai ao servidor (descarta a pré-carga): use depois de uma escrita que a tornaria desatualizada.
  getAtual: (c, opts) => {
    precarga.delete(c)
    return requisitar('GET', c, undefined, opts)
  },
  post: (c, corpo = {}, opts) => requisitar('POST', c, corpo, opts),
  patch: (c, corpo, opts) => requisitar('PATCH', c, corpo, opts),
  put: (c, corpo = {}, opts) => requisitar('PUT', c, corpo, opts),
  delete: (c, opts) => requisitar('DELETE', c, undefined, opts),
  enviarImagem: (c, blob, { largura, altura }) =>
    requisitar('PUT', c, blob, { bruto: true, cabecalhos: { 'Content-Type': blob.type, 'X-Largura': String(largura), 'X-Altura': String(altura) } })
}

// Retorna o usuário logado ou null (sem disparar o aviso de sessão expirada).
export async function carregarSessao() {
  try {
    const { usuario, csrfToken: token } = await requisitar('GET', '/auth/me', undefined, { aoExpirar: false })
    csrfToken = token
    usuarioAtual = usuario
    return usuario
  } catch (erro) {
    if (erro.status === 401) {
      csrfToken = null
      usuarioAtual = null
      return null
    }
    throw erro
  }
}

export function obterUsuario() {
  return usuarioAtual
}

export function usuarioLogado() {
  return usuarioAtual
}

export function obterCsrf() {
  return csrfToken
}

export function entrarComGoogle(returnTo = '/') {
  const destino = encodeURIComponent(returnTo || '/')
  window.location.href = `/api/auth/google/start?returnTo=${destino}`
}

export async function sair() {
  try {
    await requisitar('POST', '/auth/logout', {})
  } catch {
    /* sessão já inválida — segue o fluxo de saída local */
  } finally {
    csrfToken = null
    usuarioAtual = null
  }
}
