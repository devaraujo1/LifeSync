import { escapar } from './assistente-chat.js'

export function elPensando({ pensar = false } = {}) {
  const el = document.createElement('div')
  el.className = 'assistente-msg assistente-msg-assistant is-thinking'
  el.setAttribute('aria-live', 'polite')
  el.innerHTML = `<div class="assistente-bubble assistente-bubble-thinking">
    <span class="assistente-thinking-label">${pensar ? 'Pensando a fundo' : 'Pensando'}</span>
    <span class="assistente-thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span>
  </div>`
  return el
}

export function elErro(mensagem, { podeTentar = true } = {}) {
  const el = document.createElement('div')
  el.className = 'assistente-msg assistente-msg-assistant is-error'
  el.innerHTML = `<div class="assistente-bubble assistente-bubble-error">
    <p class="assistente-error-title">Não consegui responder</p>
    <p class="assistente-error-text">${escapar(mensagem || 'Algo deu errado. Tente novamente.')}</p>
    ${
      podeTentar
        ? `<div class="assistente-error-actions">
            <button type="button" class="btn btn-sm assistente-retry">Tentar de novo</button>
          </div>`
        : ''
    }
  </div>`
  return el
}

function ehLimiteIa(raw, codigo, status) {
  if (codigo === 'ia_limite' || codigo === 'limite_excedido' || status === 429) return true
  return /quota|rate.?limit|RESOURCE_EXHAUSTED|exceeded|Too Many Requests|limite de (taxa|uso)|billing/i.test(String(raw || ''))
}

export function mensagemErroAmigavel(erro) {
  if (!erro) return 'Algo deu errado. Tente novamente.'
  const codigo = erro.codigo || ''
  const status = erro.status
  const raw = String(erro.message || erro).trim()

  if (erro.name === 'AbortError' || codigo === 'abortado') return 'Envio cancelado.'
  if (codigo === 'timeout' || codigo === 'ia_timeout' || status === 504) {
    return 'A IA demorou demais para responder. Tente de novo.'
  }
  if (codigo === 'sem_resposta') return 'A IA não retornou texto. Tente de novo.'
  if (codigo === 'mensagem_vazia') return 'Digite uma mensagem antes de enviar.'
  if (codigo === 'sem_conexao' || status === 0) return 'Sem conexão com o servidor. Verifique a rede e tente de novo.'
  if (ehLimiteIa(raw, codigo, status)) {
    return 'Limite diário da IA atingido (free tier). Espere resetar (cerca de 24h), use um modelo Lite, ou ative faturamento no Google AI Studio.'
  }
  if (codigo === 'ia_nao_configurada' || status === 503) return 'Assistente não configurado no servidor (AI_API_KEY).'
  if (codigo === 'ia_falhou' || status === 502) {
    if (/high demand|UNAVAILABLE|503/i.test(raw)) return 'A IA está sobrecarregada no momento. Tente de novo em instantes.'
    if (/thought_signature/i.test(raw)) return 'Falha de contexto da IA. Envie a mensagem de novo.'
    if (/not found|is not found|404/i.test(raw)) return 'Modelo de IA inválido ou indisponível. Confira AI_MODEL no .env.'
    return raw.replace(/^Gemini:\s*/i, '').replace(/^Provedor IA:\s*/i, '') || 'A IA falhou ao processar. Tente de novo.'
  }
  if (status === 401) return 'Sessão expirada. Entre de novo.'
  if (!raw || raw === 'Erro inesperado.') return 'Não houve resposta. Tente novamente.'
  return raw.length > 280 ? `${raw.slice(0, 280)}…` : raw
}

const ERRO_UI_KEY = 'lifesync-assistente-erro-ui'
const RETRY_UI_KEY = 'lifesync-assistente-retry-ui'

// Mantém o último erro visível mesmo se a lista de mensagens for re-renderizada.
export function salvarErroUi(texto, textoRetry = '') {
  try {
    if (!texto) {
      sessionStorage.removeItem(ERRO_UI_KEY)
      sessionStorage.removeItem(RETRY_UI_KEY)
    } else {
      sessionStorage.setItem(ERRO_UI_KEY, String(texto).slice(0, 500))
      if (textoRetry) sessionStorage.setItem(RETRY_UI_KEY, String(textoRetry).slice(0, 4000))
      else sessionStorage.removeItem(RETRY_UI_KEY)
    }
  } catch {
    /* ignore */
  }
}

export function lerErroUi() {
  try {
    return sessionStorage.getItem(ERRO_UI_KEY) || ''
  } catch {
    return ''
  }
}

export function lerRetryUi() {
  try {
    return sessionStorage.getItem(RETRY_UI_KEY) || ''
  } catch {
    return ''
  }
}

export function limparErroUi() {
  salvarErroUi('')
}

export function anexarErroPersistido(container) {
  if (!container) return null
  container.querySelectorAll('.assistente-msg.is-error').forEach((n) => n.remove())
  const msg = lerErroUi()
  if (!msg) return null
  const el = elErro(msg, { podeTentar: true })
  container.append(el)
  return el
}
