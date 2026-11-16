import '../styles/assistente.css'
import { icon } from './icons.js'
import {
  carregarStatusIa,
  elMensagemHistorico,
  enviarMensagemChat,
  EVENTO_CONVERSAS,
  htmlBolha,
  lerHistorico,
  lerPensar,
  ligarConfirmacoes,
  salvarPensar
} from './assistente-chat.js'
import {
  anexarErroPersistido,
  elErro,
  elPensando,
  limparErroUi,
  lerRetryUi,
  mensagemErroAmigavel,
  salvarErroUi
} from './assistente-estado.js'
import { EVENTO_ASSISTENTE } from '../services/assistenteApi.js'

function templateDock() {
  return `
    <div class="assistente-dock" id="assistente-dock">
      <button type="button" class="assistente-dock-fab" id="assistente-dock-abrir" aria-expanded="false" aria-controls="assistente-dock-panel" title="Assistente">
        ${icon('sparkles')}
        <span class="assistente-dock-fab-label">IA</span>
      </button>
      <div class="assistente-dock-panel" id="assistente-dock-panel" hidden>
        <div class="assistente-dock-head">
          <a class="assistente-dock-full" href="assistente.html" title="Abrir página do assistente">${icon('expand')} Chat completo</a>
          <button type="button" class="assistente-icon-btn" id="assistente-dock-fechar" aria-label="Fechar">${icon('x')}</button>
        </div>
        <div class="assistente-msgs" id="assistente-dock-msgs" role="log" aria-live="polite"></div>
        <form class="assistente-bar assistente-dock-bar" id="assistente-dock-form" autocomplete="off">
          <textarea class="assistente-input" id="assistente-dock-input" rows="1" placeholder="Atalho rápido…" maxlength="4000" enterkeyhint="send"></textarea>
          <div class="assistente-toolbar">
            <button type="button" class="assistente-chip assistente-chip-pensar" id="assistente-dock-pensar" aria-pressed="false" title="Modelo mais forte · ~20/dia">${icon('brain')}<span class="assistente-chip-label">Pensar</span></button>
            <button type="submit" class="assistente-send" id="assistente-dock-enviar" aria-label="Enviar">${icon('send')}</button>
          </div>
        </form>
      </div>
    </div>`
}

function elBolha(role, texto, extra = '') {
  const wrap = document.createElement('div')
  wrap.innerHTML = htmlBolha(role, texto, extra)
  return wrap.firstElementChild
}

export function iniciarAssistenteUI({ avisar = () => {} } = {}) {
  if (document.getElementById('assistente-dock')) return
  if (document.querySelector('.app[data-page="assistente"]')) return

  document.body.insertAdjacentHTML('beforeend', templateDock())
  const root = document.getElementById('assistente-dock')
  const fab = document.getElementById('assistente-dock-abrir')
  const panel = document.getElementById('assistente-dock-panel')
  const fechar = document.getElementById('assistente-dock-fechar')
  const msgs = document.getElementById('assistente-dock-msgs')
  const form = document.getElementById('assistente-dock-form')
  const input = document.getElementById('assistente-dock-input')
  const pensarBtn = document.getElementById('assistente-dock-pensar')
  const enviar = document.getElementById('assistente-dock-enviar')

  let historico = lerHistorico()
  let pensar = lerPensar()
  let ocupado = false
  let configurado = true
  let ultimaFalha = null

  function syncPensar() {
    pensarBtn.setAttribute('aria-pressed', String(pensar))
    pensarBtn.classList.toggle('is-on', pensar)
  }
  syncPensar()

  function renderMsgs() {
    msgs.replaceChildren()
    for (const m of historico) msgs.append(elMensagemHistorico(m))
    anexarErroPersistido(msgs)
    msgs.scrollTop = msgs.scrollHeight
  }

  function abrir() {
    panel.hidden = false
    fab.hidden = true
    fab.setAttribute('aria-expanded', 'true')
    root.classList.add('is-open')
    if (!ocupado) {
      historico = lerHistorico()
      ultimaFalha = lerRetryUi() || null
      renderMsgs()
    }
    input.focus()
  }

  function fecharPainel() {
    panel.hidden = true
    fab.hidden = false
    fab.setAttribute('aria-expanded', 'false')
    root.classList.remove('is-open')
  }

  carregarStatusIa().then((ok) => {
    if (ok === null) {
      setTimeout(() => {
        carregarStatusIa().then((ok2) => {
          if (ok2 === null) return
          configurado = ok2
          if (!ok2) {
            input.placeholder = 'IA não configurada'
            input.title = 'Defina AI_API_KEY no servidor'
          }
        })
      }, 1500)
      return
    }
    configurado = ok
    if (!ok) {
      input.placeholder = 'IA não configurada'
      input.title = 'Defina AI_API_KEY no servidor'
    }
  })

  fab.addEventListener('click', abrir)
  fechar.addEventListener('click', fecharPainel)
  window.addEventListener(EVENTO_CONVERSAS, () => {
    if (!panel.hidden && !ocupado) {
      historico = lerHistorico()
      renderMsgs()
    }
  })

  pensarBtn.addEventListener('click', () => {
    pensar = !pensar
    salvarPensar(pensar)
    syncPensar()
  })

  input.addEventListener('input', () => {
    input.style.height = 'auto'
    input.style.height = `${Math.min(input.scrollHeight, 96)}px`
  })

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      form.requestSubmit()
    }
  })

  ligarConfirmacoes(msgs, {
    avisar,
    aoAtualizarHistorico: (h) => {
      historico = h
    }
  })

  msgs.addEventListener('click', (e) => {
    const retry = e.target.closest('.assistente-retry')
    if (!retry || ocupado || !ultimaFalha) return
    const texto = ultimaFalha
    ultimaFalha = null
    msgs.querySelectorAll('.assistente-msg.is-error').forEach((n) => n.remove())
    enviarTexto(texto, { reenviar: true })
  })

  async function enviarTexto(texto, { reenviar = false } = {}) {
    if (!texto || ocupado) return
    if (!configurado) {
      const msg = 'Assistente não configurado (AI_API_KEY).'
      msgs.append(elErro(msg, { podeTentar: false }))
      msgs.scrollTop = msgs.scrollHeight
      return
    }

    ocupado = true
    enviar.disabled = true
    historico = lerHistorico()
    limparErroUi()
    msgs.querySelectorAll('.assistente-msg.is-error, .assistente-msg.is-thinking').forEach((n) => n.remove())

    if (!reenviar) {
      msgs.append(elBolha('user', texto))
      input.value = ''
      input.style.height = 'auto'
    }

    const pensando = elPensando({ pensar })
    msgs.append(pensando)
    msgs.scrollTop = msgs.scrollHeight

    try {
      const r = await enviarMensagemChat({ mensagem: texto, pensar, historico })
      historico = r.historico
      ultimaFalha = null
      limparErroUi()
      pensando.remove()
      const ultima = historico[historico.length - 1]
      msgs.append(
        elMensagemHistorico(
          ultima?.role === 'assistant' ? ultima : { role: 'assistant', content: r.resposta, confirmacao: r.precisaConfirmacao }
        )
      )
      msgs.scrollTop = msgs.scrollHeight
      if (r.acoes?.length && !r.precisaConfirmacao?.id) {
        const resumo = r.acoes.map((a) => a.resumo).filter(Boolean).join(' · ')
        if (resumo) avisar(resumo)
      }
    } catch (erro) {
      pensando.remove()
      if (erro?.name === 'AbortError' || erro?.codigo === 'abortado' || erro?.codigo === 'timeout') {
        historico = lerHistorico()
        return
      }
      historico = lerHistorico()
      ultimaFalha = texto
      const msg = mensagemErroAmigavel(erro)
      salvarErroUi(msg, texto)
      msgs.querySelectorAll('.assistente-msg.is-error').forEach((n) => n.remove())
      msgs.append(elErro(msg, { podeTentar: true }))
      msgs.scrollTop = msgs.scrollHeight
      avisar(msg)
    } finally {
      ocupado = false
      enviar.disabled = false
      input.focus()
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    enviarTexto(input.value.trim())
  })
}

export { EVENTO_ASSISTENTE }
