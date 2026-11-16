import { assistenteApi, emitirAcaoAssistente } from '../services/assistenteApi.js'

export const HIST_KEY = 'lifesync-assistente-hist' // legado (migração)
export const STORE_KEY = 'lifesync-assistente-conversas'
export const PENSAR_KEY = 'lifesync-assistente-pensar'
export const MAX_HIST = 20
export const MAX_CONVERSAS = 40
export const EVENTO_CONVERSAS = 'lifesync:assistente-conversas'
/** Evita bolha “Pensando…” infinita se a IA travar */
export const CHAT_TIMEOUT_MS = 90_000

function idNovo() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID()
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function tituloDe(mensagens) {
  const u = (mensagens ?? []).find((m) => m.role === 'user' && m.content?.trim())
  if (!u) return 'Nova conversa'
  const t = String(u.content).trim().replace(/\s+/g, ' ')
  return t.length > 42 ? `${t.slice(0, 42)}…` : t
}

function storeVazio() {
  const id = idNovo()
  return {
    atualId: id,
    conversas: [{ id, titulo: 'Nova conversa', atualizadoEm: Date.now(), mensagens: [] }]
  }
}

function lerStoreBruto() {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) {
      const dados = JSON.parse(raw)
      if (dados && Array.isArray(dados.conversas)) return dados
    }
  } catch {
    /* ignore */
  }

  // Migra histórico único antigo (sessionStorage) para a 1ª conversa.
  try {
    const legado = sessionStorage.getItem(HIST_KEY)
    const msgs = legado ? JSON.parse(legado) : []
    if (Array.isArray(msgs) && msgs.length) {
      const id = idNovo()
      const store = {
        atualId: id,
        conversas: [{ id, titulo: tituloDe(msgs), atualizadoEm: Date.now(), mensagens: msgs.slice(-MAX_HIST) }]
      }
      salvarStore(store)
      sessionStorage.removeItem(HIST_KEY)
      return store
    }
  } catch {
    /* ignore */
  }

  const vazio = storeVazio()
  salvarStore(vazio)
  return vazio
}

let avisoStorageFalhou = false

function salvarStore(store) {
  try {
    const conversas = (store.conversas ?? [])
      .slice()
      .sort((a, b) => (b.atualizadoEm ?? 0) - (a.atualizadoEm ?? 0))
      .slice(0, MAX_CONVERSAS)
    const atualId = conversas.some((c) => c.id === store.atualId) ? store.atualId : conversas[0]?.id
    localStorage.setItem(STORE_KEY, JSON.stringify({ atualId, conversas }))
    avisoStorageFalhou = false
    window.dispatchEvent(new CustomEvent(EVENTO_CONVERSAS))
  } catch (erro) {
    if (!avisoStorageFalhou) {
      avisoStorageFalhou = true
      window.dispatchEvent(
        new CustomEvent('lifesync:assistente-storage-erro', {
          detail: { mensagem: erro?.name === 'QuotaExceededError' ? 'Histórico cheio no navegador.' : 'Não foi possível salvar o histórico.' }
        })
      )
    }
  }
}

function garantirStore() {
  let store = lerStoreBruto()
  let gravar = false
  if (!store.conversas?.length) {
    store = storeVazio()
    gravar = true
  }
  if (!store.conversas.some((c) => c.id === store.atualId)) {
    store.atualId = store.conversas[0].id
    gravar = true
  }
  if (gravar) salvarStore(store)
  return store
}

export function listarConversas() {
  return garantirStore()
    .conversas.slice()
    .sort((a, b) => (b.atualizadoEm ?? 0) - (a.atualizadoEm ?? 0))
}

export function idConversaAtual() {
  return garantirStore().atualId
}

export function obterConversa(id) {
  const store = garantirStore()
  return store.conversas.find((c) => c.id === (id ?? store.atualId)) ?? null
}

export function lerHistorico() {
  return [...(obterConversa()?.mensagens ?? [])].slice(-MAX_HIST)
}

export function salvarHistorico(msgs, conversaId) {
  const store = garantirStore()
  const id = conversaId ?? store.atualId
  let idx = store.conversas.findIndex((c) => c.id === id)
  if (idx < 0) {
    store.conversas.unshift({ id, titulo: 'Nova conversa', atualizadoEm: Date.now(), mensagens: [] })
    store.atualId = id
    idx = 0
  }
  const mensagens = (msgs ?? []).slice(-MAX_HIST)
  const atual = store.conversas[idx]
  store.conversas[idx] = {
    ...atual,
    mensagens,
    titulo: mensagens.length ? tituloDe(mensagens) : atual.titulo || 'Nova conversa',
    atualizadoEm: Date.now()
  }
  salvarStore(store)
}

export function criarConversa() {
  const store = garantirStore()
  const vazia = store.conversas.find((c) => !c.mensagens?.length)
  if (vazia) {
    store.atualId = vazia.id
    salvarStore(store)
    return vazia
  }
  const id = idNovo()
  const nova = { id, titulo: 'Nova conversa', atualizadoEm: Date.now(), mensagens: [] }
  store.conversas.unshift(nova)
  store.atualId = id
  salvarStore(store)
  return nova
}

export function selecionarConversa(id) {
  const store = garantirStore()
  if (!store.conversas.some((c) => c.id === id)) return null
  store.atualId = id
  salvarStore(store)
  return obterConversa(id)
}

export function excluirConversa(id) {
  const store = garantirStore()
  const resto = store.conversas.filter((c) => c.id !== id)
  if (!resto.length) {
    const nova = storeVazio()
    salvarStore(nova)
    return nova.conversas[0]
  }
  store.conversas = resto
  if (store.atualId === id) store.atualId = resto[0].id
  salvarStore(store)
  return obterConversa(store.atualId)
}

export function limparConversaAtual() {
  salvarHistorico([])
  const c = obterConversa()
  if (c) {
    const store = garantirStore()
    const idx = store.conversas.findIndex((x) => x.id === c.id)
    if (idx >= 0) {
      store.conversas[idx] = { ...store.conversas[idx], titulo: 'Nova conversa', atualizadoEm: Date.now() }
      salvarStore(store)
    }
  }
}

export function lerPensar() {
  try {
    return sessionStorage.getItem(PENSAR_KEY) === '1'
  } catch {
    return false
  }
}

export function salvarPensar(v) {
  try {
    sessionStorage.setItem(PENSAR_KEY, v ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function escapar(t) {
  return String(t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function htmlBolha(role, texto, extraHtml = '') {
  return `<div class="assistente-msg assistente-msg-${role}"><div class="assistente-bubble">${escapar(texto).replace(/\n/g, '<br>')}${extraHtml}</div></div>`
}

/** Renderiza mensagem do histórico (inclui card de prévia persistido). */
export function elMensagemHistorico(m) {
  const wrap = document.createElement('div')
  const role = m?.role === 'assistant' ? 'assistant' : 'user'
  const extra = m?.confirmacao ? htmlConfirmacao(m.confirmacao) : ''
  wrap.innerHTML = htmlBolha(role, m?.content ?? '', extra)
  return wrap.firstElementChild
}

function htmlCamposPrevia(campos = [], { editavel = true } = {}) {
  return (campos ?? [])
    .map((c) => {
      const podeEditar = Boolean(editavel && c.key && c.editavel !== false)
      return `<div class="ai-previa-row" data-key="${escapar(c.key || c.label || '')}">
      <span class="ai-previa-label">${escapar(c.label)}</span>
      <span class="ai-previa-valor" data-display>${escapar(c.valor)}</span>
      ${
        podeEditar
          ? `<input class="ai-previa-input" type="text" hidden value="${escapar(c.valor)}" data-edit-key="${escapar(c.key)}" />`
          : ''
      }
    </div>`
    })
    .join('')
}

/** Card Aprovar / Editar / Cancelar (prévia de escrita ou exclusão). Persistido no histórico. */
export function htmlConfirmacao(confirmacao) {
  if (!confirmacao?.id) return ''
  const p = confirmacao.preview || {}
  const kind = confirmacao.kind || 'exclusao'
  const status = confirmacao.status || 'pendente'
  const titulo = p.titulo || (kind === 'exclusao' ? 'Confirmar exclusão' : 'Confirmar lançamento')
  const modulo = p.modulo || (kind === 'exclusao' ? 'Exclusão' : 'LifeSync')
  const pergunta =
    p.pergunta ||
    (kind === 'exclusao' ? 'Isso apaga o registro de forma permanente.' : '')
  const perguntaHtml = pergunta ? `<p class="ai-previa-pergunta">${escapar(pergunta)}</p>` : ''
  const destaque = p.destaque
    ? `<div class="ai-previa-destaque">${escapar(p.destaque)}</div>`
    : confirmacao.resumo
      ? `<div class="ai-previa-destaque ai-previa-destaque-sm">${escapar(String(confirmacao.resumo).replace(/^Prévia:\s*/i, ''))}</div>`
      : ''

  if (status === 'aprovado' || status === 'cancelado') {
    const badge = status === 'aprovado' ? 'Salvo' : 'Cancelado'
    const done = confirmacao.resultado || (status === 'aprovado' ? 'Registro salvo.' : 'Operação cancelada.')
    return `<div class="ai-previa is-done is-${status}" data-confirm-id="${escapar(confirmacao.id)}" data-kind="${escapar(kind)}" data-status="${status}">
      <div class="ai-previa-head">
        <div class="ai-previa-head-text">
          <p class="ai-previa-modulo">${escapar(modulo)}</p>
          <p class="ai-previa-titulo">${escapar(titulo)}</p>
        </div>
        <span class="ai-previa-badge">${badge}</span>
      </div>
      ${destaque}
      <div class="ai-previa-campos">${htmlCamposPrevia(p.campos, { editavel: false })}</div>
      <p class="assistente-confirm-done">${escapar(done)}</p>
    </div>`
  }

  return `<div class="ai-previa" data-confirm-id="${escapar(confirmacao.id)}" data-kind="${escapar(kind)}" data-status="pendente">
    <div class="ai-previa-head">
      <div class="ai-previa-head-text">
        <p class="ai-previa-modulo">${escapar(modulo)}</p>
        <p class="ai-previa-titulo">${escapar(titulo)}</p>
      </div>
      <span class="ai-previa-badge">Aguardando</span>
    </div>
    ${destaque}
    <div class="ai-previa-campos">${htmlCamposPrevia(p.campos)}</div>
    ${perguntaHtml}
    <div class="ai-previa-actions">
      <button type="button" class="ai-previa-btn ai-previa-aprovar assistente-confirm-ok">Aprovar</button>
      <button type="button" class="ai-previa-btn ai-previa-editar"${kind === 'exclusao' ? ' hidden' : ''}>Editar</button>
      <button type="button" class="ai-previa-btn ai-previa-cancelar assistente-confirm-no">Cancelar</button>
      <button type="button" class="ai-previa-btn ai-previa-salvar-edicao" hidden>Salvar edição</button>
    </div>
  </div>`
}

function paraApiHistorico(hist) {
  return (hist ?? []).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content ?? '').slice(0, 4000)
  }))
}

/** Atualiza a prévia salva na mensagem do histórico (sobrevive a reload). */
export function atualizarConfirmacaoHistorico(confirmId, patch = {}) {
  const hist = lerHistorico()
  const idx = hist.findIndex((m) => m?.confirmacao?.id === confirmId)
  if (idx < 0) return hist
  const atual = hist[idx]
  const confirmacao = {
    ...atual.confirmacao,
    ...patch,
    preview: patch.preview ?? atual.confirmacao.preview,
    id: confirmId
  }
  const next = [...hist]
  next[idx] = {
    ...atual,
    content: patch.content ?? atual.content,
    confirmacao
  }
  salvarHistorico(next)
  return next
}

/** @returns {Promise<boolean|null>} true/false = status; null = falha de rede (indefinido) */
export async function carregarStatusIa() {
  try {
    const s = await assistenteApi.status()
    return Boolean(s?.configurado)
  } catch (erro) {
    if (erro?.codigo === 'sem_conexao' || erro?.status === 0) return null
    return false
  }
}

/** AbortController do envio em andamento — cancelado ao trocar/criar/excluir conversa. */
let chatAbortAtual = null

export function abortarEnvioChat() {
  try {
    chatAbortAtual?.abort()
  } catch {
    /* ignore */
  }
  chatAbortAtual = null
}

export async function enviarMensagemChat({
  mensagem,
  pensar,
  historico,
  conversaId,
  timeoutMs = CHAT_TIMEOUT_MS,
  signal: signalExterno
} = {}) {
  const alvoId = conversaId ?? idConversaAtual()
  const hist = [...(historico ?? obterConversa(alvoId)?.mensagens ?? [])].slice(-MAX_HIST)
  const texto = String(mensagem ?? '').trim()
  if (!texto) {
    const e = new Error('Mensagem vazia.')
    e.codigo = 'mensagem_vazia'
    throw e
  }

  // Reenvio: se o histórico já termina com esta mensagem do usuário, não duplica.
  const ultimo = hist[hist.length - 1]
  const jaTemUser = ultimo?.role === 'user' && String(ultimo.content).trim() === texto
  const novoHist = jaTemUser ? hist : [...hist, { role: 'user', content: texto }].slice(-MAX_HIST)
  if (!jaTemUser) salvarHistorico(novoHist, alvoId)

  abortarEnvioChat()
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null
  chatAbortAtual = ctrl
  if (signalExterno) {
    if (signalExterno.aborted) ctrl?.abort()
    else signalExterno.addEventListener('abort', () => ctrl?.abort(), { once: true })
  }
  const timer =
    ctrl && timeoutMs > 0
      ? setTimeout(() => {
          try {
            ctrl.abort()
          } catch {
            /* ignore */
          }
        }, timeoutMs)
      : null

  let r
  try {
    r = await assistenteApi.chat(
      {
        mensagem: texto,
        historico: paraApiHistorico(novoHist.slice(0, -1)),
        pensar: Boolean(pensar)
      },
      ctrl ? { signal: ctrl.signal } : undefined
    )
  } finally {
    if (timer) clearTimeout(timer)
    if (chatAbortAtual === ctrl) chatAbortAtual = null
  }

  const respostaBruta = typeof r?.resposta === 'string' ? r.resposta.trim() : ''
  const temConfirm = Boolean(r?.precisaConfirmacao?.id)
  if (!respostaBruta && !temConfirm && !(r?.acoes?.length)) {
    const e = new Error('A IA não retornou nenhuma resposta.')
    e.codigo = 'sem_resposta'
    e.status = 502
    throw e
  }

  const resposta = respostaBruta || (temConfirm ? 'Preciso da sua confirmação.' : 'Pronto.')
  const msgAssistente = { role: 'assistant', content: resposta }
  if (temConfirm) {
    msgAssistente.confirmacao = { ...r.precisaConfirmacao, status: 'pendente' }
  }
  const final = [...novoHist, msgAssistente].slice(-MAX_HIST)
  salvarHistorico(final, alvoId)

  if (r.acoes?.length) emitirAcaoAssistente({ acoes: r.acoes })

  return {
    historico: final,
    resposta,
    acoes: r.acoes ?? [],
    precisaConfirmacao: r.precisaConfirmacao ?? null,
    conversaId: alvoId
  }
}

export async function confirmarPendenciaChat(confirmId) {
  const r = await assistenteApi.confirmar(confirmId)
  const tool = r.kind === 'exclusao' ? 'excluir' : r.acao?.tool || 'escrever'
  emitirAcaoAssistente({ acoes: [{ tool, area: r.area, resumo: r.resumo }] })
  return r
}

export async function cancelarPendenciaChat(confirmId) {
  return assistenteApi.cancelar(confirmId)
}

export async function editarPendenciaChat(confirmId, campos) {
  return assistenteApi.editarPrevia(confirmId, campos)
}

export function ligarConfirmacoes(container, { avisar = () => {}, aoAtualizarHistorico = () => {} } = {}) {
  container.addEventListener('click', async (e) => {
    const box = e.target.closest('.ai-previa, .assistente-confirm')
    if (!box) return
    if (box.dataset.status === 'aprovado' || box.dataset.status === 'cancelado') return
    const id = box.dataset.confirmId
    if (!id) return

    const editar = e.target.closest('.ai-previa-editar')
    const salvarEdicao = e.target.closest('.ai-previa-salvar-edicao')
    const ok = e.target.closest('.assistente-confirm-ok, .ai-previa-aprovar')
    const no = e.target.closest('.assistente-confirm-no, .ai-previa-cancelar')

    if (editar) {
      box.classList.add('is-editing')
      box.querySelectorAll('.ai-previa-row').forEach((row) => {
        const key = row.querySelector('[data-edit-key]')?.dataset.editKey
        if (!key || key === 'id') return
        const display = row.querySelector('[data-display]')
        const input = row.querySelector('.ai-previa-input')
        if (display && input) {
          display.hidden = true
          input.hidden = false
        }
      })
      box.querySelector('.ai-previa-editar')?.setAttribute('hidden', '')
      box.querySelector('.ai-previa-aprovar')?.setAttribute('hidden', '')
      box.querySelector('.ai-previa-salvar-edicao')?.removeAttribute('hidden')
      const cancelarBtn = box.querySelector('.ai-previa-cancelar')
      if (cancelarBtn) {
        cancelarBtn.dataset.modo = 'voltar'
        cancelarBtn.textContent = 'Voltar'
      }
      return
    }

    if (salvarEdicao) {
      salvarEdicao.disabled = true
      const campos = {}
      box.querySelectorAll('.ai-previa-input[data-edit-key]').forEach((input) => {
        const key = input.dataset.editKey
        if (!key || key === 'id') return
        campos[key] = input.value
      })
      try {
        const r = await editarPendenciaChat(id, campos)
        const conf = { ...r.precisaConfirmacao, status: 'pendente' }
        const hist = atualizarConfirmacaoHistorico(id, {
          ...conf,
          preview: conf.preview,
          resumo: conf.resumo,
          status: 'pendente'
        })
        const wrap = document.createElement('div')
        wrap.innerHTML = htmlConfirmacao(conf)
        box.replaceWith(wrap.firstElementChild)
        aoAtualizarHistorico(hist)
        avisar('Prévia atualizada.')
      } catch (erro) {
        salvarEdicao.disabled = false
        const detalhe = Array.isArray(erro?.detalhes) && erro.detalhes[0]?.mensagem
        avisar(detalhe || erro?.message || 'Não foi possível editar a prévia.')
      }
      return
    }

    if (no) {
      // Em modo edição, "Voltar" só sai da edição — não cancela a prévia
      if (box.classList.contains('is-editing') || no.dataset.modo === 'voltar') {
        box.classList.remove('is-editing')
        box.querySelectorAll('.ai-previa-row').forEach((row) => {
          const display = row.querySelector('[data-display]')
          const input = row.querySelector('.ai-previa-input')
          if (display && input) {
            input.value = display.textContent
            input.hidden = true
            display.hidden = false
          }
        })
        box.querySelector('.ai-previa-editar')?.removeAttribute('hidden')
        box.querySelector('.ai-previa-aprovar')?.removeAttribute('hidden')
        box.querySelector('.ai-previa-salvar-edicao')?.setAttribute('hidden', '')
        no.dataset.modo = ''
        no.textContent = 'Cancelar'
        return
      }

      no.disabled = true
      try {
        await cancelarPendenciaChat(id)
      } catch {
        /* expirada: ainda marca cancelado no chat */
      }
      const hist = atualizarConfirmacaoHistorico(id, {
        status: 'cancelado',
        resultado: 'Operação cancelada.',
        content: 'Cancelei essa prévia. Nada foi registrado.'
      })
      const wrap = document.createElement('div')
      wrap.innerHTML = htmlConfirmacao({
        id,
        kind: box.dataset.kind || 'escrita',
        status: 'cancelado',
        preview: hist.find((m) => m.confirmacao?.id === id)?.confirmacao?.preview,
        resultado: 'Operação cancelada.'
      })
      // Substitui a bolha inteira se possível
      const msg = box.closest('.assistente-msg')
      if (msg) {
        const bolha = msg.querySelector('.assistente-bubble')
        if (bolha) {
          bolha.innerHTML = `${escapar('Cancelei essa prévia. Nada foi registrado.').replace(/\n/g, '<br>')}${wrap.innerHTML}`
        } else {
          box.replaceWith(wrap.firstElementChild)
        }
      } else {
        box.replaceWith(wrap.firstElementChild)
      }
      aoAtualizarHistorico(hist)
      avisar('Operação cancelada.')
      return
    }

    if (!ok) return
    ok.disabled = true
    try {
      const r = await confirmarPendenciaChat(id)
      const resultado = r.resumo || 'Registro salvo.'
      const hist = atualizarConfirmacaoHistorico(id, {
        status: 'aprovado',
        resultado,
        content: resultado
      })
      const conf = hist.find((m) => m.confirmacao?.id === id)?.confirmacao
      const wrap = document.createElement('div')
      wrap.innerHTML = htmlConfirmacao(conf || { id, status: 'aprovado', resultado, kind: box.dataset.kind })
      const msg = box.closest('.assistente-msg')
      if (msg) {
        const bolha = msg.querySelector('.assistente-bubble')
        if (bolha) {
          bolha.innerHTML = `${escapar(resultado).replace(/\n/g, '<br>')}${wrap.innerHTML}`
        } else {
          box.replaceWith(wrap.firstElementChild)
        }
      } else {
        box.replaceWith(wrap.firstElementChild)
      }
      aoAtualizarHistorico(hist)
      avisar(resultado)
    } catch (erro) {
      ok.disabled = false
      avisar(erro?.message || 'Não foi possível confirmar.')
    }
  })
}
