import { iniciarShell, mostrarAviso } from '../modules/shell.js'
import { icon } from '../modules/icons.js'
import {
  abortarEnvioChat,
  carregarStatusIa,
  criarConversa,
  elMensagemHistorico,
  enviarMensagemChat,
  EVENTO_CONVERSAS,
  excluirConversa,
  htmlBolha,
  idConversaAtual,
  lerHistorico,
  lerPensar,
  ligarConfirmacoes,
  listarConversas,
  obterConversa,
  salvarPensar,
  selecionarConversa
} from '../modules/assistente-chat.js'
import {
  anexarErroPersistido,
  elErro,
  elPensando,
  limparErroUi,
  lerRetryUi,
  mensagemErroAmigavel,
  salvarErroUi
} from '../modules/assistente-estado.js'

iniciarShell({ pagina: 'assistente' })

const SUGESTOES = [
  'Gastei 16 reais no açaí',
  'Quanto gastei este mês?',
  'Marca dentista sexta às 15h',
  'Cria tarefa: pagar aluguel'
]

const empty = document.querySelector('#ai-empty')
const msgs = document.querySelector('#ai-msgs')
const scroll = document.querySelector('#ai-scroll')
const form = document.querySelector('#ai-form')
const input = document.querySelector('#ai-input')
const enviar = document.querySelector('#ai-enviar')
const statusEl = document.querySelector('#ai-status')
const tools = document.querySelector('#ai-tools')
const suggestions = document.querySelector('#ai-suggestions')
const railList = document.querySelector('#ai-rail-list')
const railToggle = document.querySelector('#ai-rail-toggle')
const railFechar = document.querySelector('#ai-rail-fechar')
const railBackdrop = document.querySelector('#ai-rail-backdrop')
const tituloEl = document.querySelector('#ai-titulo')
const novaBtn = document.querySelector('#ai-nova')

enviar.innerHTML = icon('send')
tools.innerHTML = `
  <button type="button" class="assistente-chip assistente-chip-pensar" id="ai-pensar" aria-pressed="false" title="Modelo mais forte · ~20/dia">${icon('brain')}<span class="assistente-chip-label">Pensar</span></button>
`

const pensarBtn = document.querySelector('#ai-pensar')

let historico = lerHistorico()
let pensar = lerPensar()
let ocupado = false
let configurado = true
let ultimaFalha = null
let statusBase = 'Pronto'

function elBolha(role, texto, extra = '') {
  const wrap = document.createElement('div')
  wrap.innerHTML = htmlBolha(role, texto, extra)
  return wrap.firstElementChild
}

function setStatus(texto, { off = false } = {}) {
  statusEl.textContent = texto
  statusEl.classList.toggle('is-off', off)
  statusEl.classList.toggle('is-busy', texto === 'Pensando…' || texto === 'Pensando a fundo…')
}

function syncEmpty() {
  const tem = historico.length > 0 || msgs.querySelector('.assistente-msg')
  empty.hidden = tem
  msgs.classList.toggle('is-visible', tem)
}

function renderMsgs() {
  msgs.replaceChildren()
  for (const m of historico) msgs.append(elMensagemHistorico(m))
  anexarErroPersistido(msgs)
  syncEmpty()
  scroll.scrollTop = scroll.scrollHeight
  const c = obterConversa()
  tituloEl.textContent = c?.titulo && c.titulo !== 'Nova conversa' ? c.titulo : 'Assistente'
}

function syncPensar() {
  pensarBtn.setAttribute('aria-pressed', String(pensar))
  pensarBtn.classList.toggle('is-on', pensar)
  input.placeholder = pensar ? 'Pensar a fundo…' : 'Digite sua mensagem…'
}

function formatarQuando(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const agora = new Date()
  const mesmoDia = d.toDateString() === agora.toDateString()
  if (mesmoDia) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function renderRail() {
  const atual = idConversaAtual()
  const lista = listarConversas()
  railList.replaceChildren(
    ...lista.map((c) => {
      const item = document.createElement('div')
      item.className = `ai-rail-item${c.id === atual ? ' is-active' : ''}`
      item.setAttribute('role', 'listitem')

      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'ai-rail-item-btn'
      btn.dataset.id = c.id

      const title = document.createElement('span')
      title.className = 'ai-rail-item-title'
      title.textContent = c.titulo || 'Nova conversa'

      const meta = document.createElement('span')
      meta.className = 'ai-rail-item-meta'
      meta.textContent = formatarQuando(c.atualizadoEm)

      btn.append(title, meta)

      const del = document.createElement('button')
      del.type = 'button'
      del.className = 'ai-rail-item-del'
      del.dataset.del = c.id
      del.setAttribute('aria-label', 'Excluir conversa')
      del.title = 'Excluir'
      del.innerHTML = icon('trash')

      item.append(btn, del)
      return item
    })
  )
  if (!lista.length) {
    const vazio = document.createElement('p')
    vazio.className = 'ai-rail-empty'
    vazio.textContent = 'Nenhuma conversa ainda.'
    railList.append(vazio)
  }
}

const mqMobile = window.matchMedia('(max-width: 959.98px)')
const CHAVE_RAIL = 'lifesync-ai-rail-collapsed'

function historicoAberto() {
  if (mqMobile.matches) return document.documentElement.classList.contains('ai-rail-open')
  return !document.documentElement.classList.contains('ai-rail-collapsed')
}

function abrirRail(aberto) {
  if (mqMobile.matches) {
    document.documentElement.classList.toggle('ai-rail-open', aberto)
    document.documentElement.classList.remove('ai-rail-collapsed')
    railBackdrop.hidden = !aberto
  } else {
    document.documentElement.classList.toggle('ai-rail-collapsed', !aberto)
    document.documentElement.classList.remove('ai-rail-open')
    railBackdrop.hidden = true
    try {
      localStorage.setItem(CHAVE_RAIL, String(!aberto))
    } catch {}
  }
  railToggle.setAttribute('aria-expanded', String(aberto))
  railToggle.setAttribute('aria-label', aberto ? 'Recolher histórico' : 'Abrir histórico')
  railToggle.title = aberto ? 'Recolher histórico' : 'Abrir histórico'
}

function restaurarRail() {
  if (mqMobile.matches) {
    abrirRail(false)
    return
  }
  let recolhido = false
  try {
    recolhido = localStorage.getItem(CHAVE_RAIL) === 'true'
  } catch {}
  abrirRail(!recolhido)
}

function carregarConversaAtual() {
  historico = lerHistorico()
  ultimaFalha = lerRetryUi() || null
  renderMsgs()
  renderRail()
}

suggestions.replaceChildren(
  ...SUGESTOES.map((texto) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'ai-suggestion'
    b.setAttribute('role', 'listitem')
    b.textContent = texto
    b.addEventListener('click', () => {
      input.value = texto
      form.requestSubmit()
    })
    return b
  })
)

syncPensar()
carregarConversaAtual()

carregarStatusIa().then((ok) => {
  if (ok === null) {
    setStatus('Verificando IA…')
    setTimeout(() => {
      carregarStatusIa().then((ok2) => {
        if (ok2 === null) return
        configurado = ok2
        statusBase = ok2 ? 'Pronto' : 'IA não configurada'
        setStatus(statusBase, { off: !ok2 })
        if (!ok2) {
          input.placeholder = 'Configure AI_API_KEY no servidor'
          input.title = 'Assistente desligado'
        }
      })
    }, 1500)
    return
  }
  configurado = ok
  statusBase = ok ? 'Pronto' : 'IA não configurada'
  setStatus(statusBase, { off: !ok })
  if (!ok) {
    input.placeholder = 'Configure AI_API_KEY no servidor'
    input.title = 'Assistente desligado'
  }
})

pensarBtn.addEventListener('click', () => {
  pensar = !pensar
  salvarPensar(pensar)
  syncPensar()
})

novaBtn.addEventListener('click', () => {
  if (ocupado) {
    abortarEnvioChat()
    ocupado = false
    enviar.disabled = false
  }
  criarConversa()
  limparErroUi()
  carregarConversaAtual()
  abrirRail(false)
  input.focus()
})

railToggle.addEventListener('click', () => abrirRail(!historicoAberto()))
railFechar.addEventListener('click', () => abrirRail(false))
railBackdrop.addEventListener('click', () => abrirRail(false))
mqMobile.addEventListener('change', () => restaurarRail())
restaurarRail()

railList.addEventListener('click', (e) => {
  const del = e.target.closest('[data-del]')
  if (del) {
    e.preventDefault()
    e.stopPropagation()
    if (ocupado) {
      abortarEnvioChat()
      ocupado = false
      enviar.disabled = false
    }
    excluirConversa(del.dataset.del)
    limparErroUi()
    carregarConversaAtual()
    return
  }
  const btn = e.target.closest('[data-id]')
  if (!btn) return
  if (ocupado) {
    abortarEnvioChat()
    ocupado = false
    enviar.disabled = false
  }
  selecionarConversa(btn.dataset.id)
  limparErroUi()
  carregarConversaAtual()
  abrirRail(false)
  input.focus()
})

window.addEventListener('lifesync:assistente-storage-erro', (e) => {
  mostrarAviso(e.detail?.mensagem || 'Não foi possível salvar o histórico.')
})

window.addEventListener(EVENTO_CONVERSAS, () => {
  if (!ocupado) renderRail()
})

input.addEventListener('input', () => {
  input.style.height = 'auto'
  input.style.height = `${Math.min(input.scrollHeight, 160)}px`
})

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    form.requestSubmit()
  }
})

ligarConfirmacoes(msgs, {
  avisar: mostrarAviso,
  aoAtualizarHistorico: (h) => {
    historico = h
    renderRail()
  }
})

msgs.addEventListener('click', (e) => {
  const retry = e.target.closest('.assistente-retry')
  if (!retry || ocupado || !ultimaFalha) return
  const texto = ultimaFalha
  ultimaFalha = null
  limparErroUi()
  msgs.querySelectorAll('.assistente-msg.is-error').forEach((n) => n.remove())
  enviarTexto(texto, { reenviar: true })
})

async function enviarTexto(texto, { reenviar = false } = {}) {
  if (!texto || ocupado) return
  if (!configurado) {
    const msg = 'Assistente não configurado (AI_API_KEY).'
    empty.hidden = true
    msgs.classList.add('is-visible')
    salvarErroUi(msg)
    msgs.append(elErro(msg, { podeTentar: false }))
    scroll.scrollTop = scroll.scrollHeight
    setStatus('IA não configurada', { off: true })
    return
  }

  ocupado = true
  enviar.disabled = true
  const conversaId = idConversaAtual()
  historico = lerHistorico()
  empty.hidden = true
  msgs.classList.add('is-visible')
  limparErroUi()
  msgs.querySelectorAll('.assistente-msg.is-error, .assistente-msg.is-thinking').forEach((n) => n.remove())

  if (!reenviar) {
    msgs.append(elBolha('user', texto))
    input.value = ''
    input.style.height = 'auto'
  }

  const pensando = elPensando({ pensar })
  msgs.append(pensando)
  scroll.scrollTop = scroll.scrollHeight
  setStatus(pensar ? 'Pensando a fundo…' : 'Pensando…')
  let visivel = true

  try {
    const r = await enviarMensagemChat({ mensagem: texto, pensar, historico, conversaId })
    visivel = msgs.contains(pensando)
    pensando.remove()
    if (!visivel) return
    if (idConversaAtual() !== conversaId) selecionarConversa(conversaId)
    historico = r.historico
    ultimaFalha = null
    limparErroUi()
    const ultima = historico[historico.length - 1]
    msgs.append(
      elMensagemHistorico(
        ultima?.role === 'assistant'
          ? ultima
          : { role: 'assistant', content: r.resposta, confirmacao: r.precisaConfirmacao }
      )
    )
    scroll.scrollTop = scroll.scrollHeight
    renderRail()
    const c = obterConversa(conversaId)
    if (c?.titulo) tituloEl.textContent = c.titulo
    setStatus(statusBase, { off: !configurado })
    if (r.acoes?.length && !r.precisaConfirmacao?.id) {
      const resumo = r.acoes.map((a) => a.resumo).filter(Boolean).join(' · ')
      if (resumo) mostrarAviso(resumo)
    }
  } catch (erro) {
    visivel = msgs.contains(pensando)
    pensando.remove()
    if (!visivel) return
    if (erro?.name === 'AbortError' || erro?.codigo === 'abortado' || erro?.codigo === 'timeout') {
      historico = lerHistorico()
      setStatus(statusBase, { off: !configurado })
      return
    }
    historico = lerHistorico()
    ultimaFalha = texto
    const msg = mensagemErroAmigavel(erro)
    salvarErroUi(msg, texto)
    msgs.querySelectorAll('.assistente-msg.is-error').forEach((n) => n.remove())
    msgs.append(elErro(msg, { podeTentar: true }))
    syncEmpty()
    scroll.scrollTop = scroll.scrollHeight
    setStatus('Falha', { off: false })
    mostrarAviso(msg)
  } finally {
    ocupado = false
    enviar.disabled = false
    if (visivel) input.focus()
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault()
  enviarTexto(input.value.trim())
})

input.focus()
