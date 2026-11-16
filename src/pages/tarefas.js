import { iniciarShell, mostrarAviso } from '../modules/shell.js'
import { icon } from '../modules/icons.js'
import { criarSeletorCategoria } from '../modules/seletor-categoria.js'
import { statusDoDia, tarefasApi, vencimentoDe } from '../services/tarefasApi.js'

iniciarShell({ pagina: 'tarefas' })

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const PRIO = { alta: 'Alta', media: 'Média', baixa: 'Baixa' }
const PROXIMO = { pendente: 'andamento', andamento: 'concluida', concluida: 'pendente' }
const ROTULO_STATUS = { pendente: 'Pendente', andamento: 'Em andamento', concluida: 'Concluída' }

const board = document.querySelector('#tasks-board')
const dialogo = document.querySelector('#tasks-dialog')
const form = document.querySelector('#tasks-form')
const campoTitulo = document.querySelector('#tasks-input')
const campoData = document.querySelector('#tasks-date')
const campoDue = document.querySelector('#tasks-due')
const campoNotes = document.querySelector('#tasks-notes')
const campoPrioridade = document.querySelector('#tasks-priority')
const blocoData = document.querySelector('#tasks-date-field')
const blocoDias = document.querySelector('#tasks-days-field')
const diasEl = document.querySelector('#tasks-weekdays')
const tagPicker = document.querySelector('#tasks-tag-picker')
const checklistEl = document.querySelector('#tasks-checklist')
const erroEl = document.querySelector('#tasks-error')
const botaoExcluir = document.querySelector('#tasks-delete')
const refDay = document.querySelector('#tasks-ref-day')
const filtroPrio = document.querySelector('#tasks-filter-priority')
const filtroTag = document.querySelector('#tasks-filter-tag')
const filtrosEl = document.querySelector('#tasks-filters')

const menuFiltroPrio = criarSeletorCategoria({
  select: filtroPrio,
  placeholder: 'Prioridade'
})
const menuFiltroTag = criarSeletorCategoria({
  select: filtroTag,
  placeholder: 'Etiqueta'
})
const menuPrioridade = criarSeletorCategoria({
  select: campoPrioridade,
  placeholder: 'Prioridade'
})

let tarefas = []
let tags = []
let vista = 'lista'
let filtro = 'todas'
let editando = null
let tipoAtual = 'unica'
let checklistDraft = []
let tagsSelecionadas = new Set()
const checklistAberto = new Set()

function hojeChave(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function diaRef() {
  return refDay.value || hojeChave()
}

function msg(erro) {
  return erro?.message || 'Não foi possível concluir. Tente de novo.'
}

function montarDias() {
  diasEl.replaceChildren(
    ...DIAS.map((nome, i) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.dataset.dia = String(i)
      b.textContent = nome
      b.setAttribute('aria-pressed', 'false')
      b.addEventListener('click', () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'))
      return b
    })
  )
}

function definirTipo(tipo) {
  tipoAtual = tipo
  document.querySelectorAll('[data-kind]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === tipo)))
  blocoData.hidden = tipo !== 'unica'
  blocoDias.hidden = tipo !== 'recorrente'
}

function renderTagsFiltro() {
  const atual = filtroTag.value
  filtroTag.replaceChildren(new Option('Etiqueta', ''))
  for (const t of tags) filtroTag.append(new Option(t.nome, t.id))
  filtroTag.value = tags.some((t) => t.id === atual) ? atual : ''
  menuFiltroTag.atualizar()
}

function renderTagPicker() {
  tagPicker.replaceChildren(
    ...tags.map((t) => {
      const label = document.createElement('label')
      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.value = t.id
      cb.checked = tagsSelecionadas.has(t.id)
      cb.addEventListener('change', () => {
        if (cb.checked) tagsSelecionadas.add(t.id)
        else tagsSelecionadas.delete(t.id)
      })
      label.append(cb, document.createTextNode(` ${t.nome}`))
      return label
    })
  )
}

function renderChecklistEditor() {
  checklistEl.replaceChildren(
    ...checklistDraft.map((item, idx) => {
      const li = document.createElement('li')
      li.classList.toggle('is-done', !!item.feito)
      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.checked = item.feito
      cb.setAttribute('aria-label', item.texto)
      cb.addEventListener('change', () => {
        checklistDraft[idx].feito = cb.checked
        li.classList.toggle('is-done', cb.checked)
      })
      const span = document.createElement('span')
      span.textContent = item.texto
      const rm = document.createElement('button')
      rm.type = 'button'
      rm.className = 'icon-btn'
      rm.setAttribute('aria-label', `Remover ${item.texto}`)
      rm.innerHTML = icon('x')
      rm.addEventListener('click', () => {
        checklistDraft.splice(idx, 1)
        renderChecklistEditor()
      })
      li.append(cb, span, rm)
      return li
    })
  )
}

async function carregar() {
  const prioridade = filtroPrio.value || undefined
  const tag = filtroTag.value || undefined
  try {
    const [lista, listaTags] = await Promise.all([
      tarefasApi.listar({ filtro, prioridade, tag }),
      tarefasApi.listarTags().catch(() => tags)
    ])
    tarefas = lista
    tags = listaTags
    renderTagsFiltro()
    render()
  } catch (erro) {
    board.innerHTML = `<p class="empty-tasks">${msg(erro)}</p>`
    mostrarAviso(msg(erro))
  }
}

function atualizarLocal(tarefa) {
  const i = tarefas.findIndex((x) => x.id === tarefa.id)
  if (i >= 0) tarefas[i] = tarefa
  return tarefa
}

async function mudarStatus(tarefa, status) {
  const atualizada = await tarefasApi.definirStatus(tarefa.id, diaRef(), status)
  atualizarLocal(atualizada)
  render()
  return atualizada
}

async function salvarChecklistTarefa(tarefa, checklist) {
  const atualizada = await tarefasApi.salvarChecklist(tarefa.id, checklist)
  atualizarLocal(atualizada)
  return atualizada
}

function cardMeta(t) {
  const meta = document.createElement('div')
  meta.className = 'task-card-meta'
  const p = document.createElement('span')
  p.className = `prio prio-${t.prioridade}`
  p.textContent = PRIO[t.prioridade] || t.prioridade
  meta.append(p)
  if (t.tipo === 'recorrente') {
    const rec = document.createElement('span')
    rec.className = 'meta-chip'
    rec.innerHTML = `${icon('repeat')}Recorrente`
    meta.append(rec)
  }
  const venc = vencimentoDe(t)
  if (venc) {
    const v = document.createElement('span')
    v.className = 'meta-chip'
    v.innerHTML = `${icon('clock')}vence ${venc}`
    meta.append(v)
  }
  for (const tag of t.tags ?? []) {
    const chip = document.createElement('span')
    chip.className = `tag-chip cor-${tag.cor || 'ciano'}`
    chip.textContent = tag.nome
    meta.append(chip)
  }
  return meta
}

function atualizarContadorChecklist(card, checklist) {
  const toggle = card?.querySelector('.task-check-toggle .task-check-count')
  if (!toggle) return
  const feitos = checklist.filter((i) => i.feito).length
  toggle.textContent = `${feitos}/${checklist.length}`
}

function painelChecklist(t) {
  const lista = t.checklist ?? []
  const painel = document.createElement('div')
  painel.className = 'task-checklist'
  painel.hidden = !checklistAberto.has(t.id)
  painel.addEventListener('click', (e) => e.stopPropagation())

  if (!lista.length) {
    const vazio = document.createElement('p')
    vazio.className = 'task-checklist-empty'
    vazio.textContent = 'Sem itens. Edite a tarefa para adicionar.'
    painel.append(vazio)
    return painel
  }

  const ul = document.createElement('ul')
  ul.className = 'task-checklist-list'
  lista.forEach((item, idx) => {
    const li = document.createElement('li')
    li.classList.toggle('is-done', !!item.feito)
    li.tabIndex = 0
    li.setAttribute('role', 'checkbox')
    li.setAttribute('aria-checked', String(!!item.feito))

    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.checked = !!item.feito
    cb.tabIndex = -1
    cb.setAttribute('aria-hidden', 'true')

    const span = document.createElement('span')
    span.textContent = item.texto

    const alternar = async () => {
      if (li.dataset.busy === '1') return
      const feito = !cb.checked
      const fonte = t.checklist ?? lista
      const proximo = fonte.map((x, i) => ({
        texto: x.texto,
        feito: i === idx ? feito : !!x.feito
      }))
      cb.checked = feito
      li.classList.toggle('is-done', feito)
      li.setAttribute('aria-checked', String(feito))
      li.dataset.busy = '1'
      try {
        const atualizada = await salvarChecklistTarefa(t, proximo)
        Object.assign(t, atualizada)
        atualizarContadorChecklist(painel.closest('.task-card'), atualizada.checklist ?? proximo)
      } catch (erro) {
        cb.checked = !feito
        li.classList.toggle('is-done', !feito)
        li.setAttribute('aria-checked', String(!feito))
        mostrarAviso(msg(erro))
      } finally {
        li.dataset.busy = '0'
      }
    }

    li.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      alternar()
    })
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        e.stopPropagation()
        alternar()
      }
    })

    li.append(cb, span)
    ul.append(li)
  })
  painel.append(ul)
  return painel
}

function definirChecklistAberto(id, aberto) {
  if (aberto) checklistAberto.add(id)
  else checklistAberto.delete(id)
}

function fazerCard(t, { kanban = false } = {}) {
  const card = document.createElement('article')
  const status = statusDoDia(t, diaRef())
  const checklist = t.checklist ?? []
  const temChecklist = checklist.length > 0
  const feitos = checklist.filter((i) => i.feito).length

  card.className = 'task-card'
  card.dataset.id = t.id
  card.dataset.status = status
  card.tabIndex = 0
  card.setAttribute('role', 'button')
  card.setAttribute(
    'aria-label',
    temChecklist
      ? `${t.texto}. ${ROTULO_STATUS[status]}. Clique para abrir ou fechar o checklist`
      : `${t.texto}. ${ROTULO_STATUS[status]}. Abrir para editar`
  )

  const top = document.createElement('div')
  top.className = 'task-card-top'
  const titulo = document.createElement('p')
  titulo.className = 'task-card-title'
  titulo.textContent = t.texto
  top.append(titulo)

  if (kanban) {
    const grip = document.createElement('span')
    grip.className = 'task-drag-hint'
    grip.title = 'Arraste para outra coluna'
    grip.innerHTML = icon('dots')
    top.prepend(grip)
  }

  const foot = document.createElement('div')
  foot.className = 'task-card-foot'
  foot.append(cardMeta(t))

  const actions = document.createElement('div')
  actions.className = 'task-card-actions'

  if (temChecklist || checklistAberto.has(t.id)) {
    const toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = 'task-check-toggle'
    toggle.setAttribute('aria-expanded', String(checklistAberto.has(t.id)))
    toggle.setAttribute('aria-label', 'Abrir ou fechar checklist')
    toggle.innerHTML = `${icon('chevron-down')}<span class="task-check-count">${feitos}/${checklist.length || 0}</span>`
    toggle.classList.toggle('is-open', checklistAberto.has(t.id))
    toggle.addEventListener('click', (e) => {
      e.stopPropagation()
      const aberto = !checklistAberto.has(t.id)
      definirChecklistAberto(t.id, aberto)
      const painel = card.querySelector('.task-checklist')
      if (painel) painel.hidden = !aberto
      toggle.setAttribute('aria-expanded', String(aberto))
      toggle.classList.toggle('is-open', aberto)
    })
    actions.append(toggle)
  }

  const st = document.createElement('button')
  st.type = 'button'
  st.className = 'status-pill'
  st.dataset.status = status
  st.setAttribute('aria-label', `Status: ${ROTULO_STATUS[status]}. Clique para alterar`)
  st.textContent = ROTULO_STATUS[status]
  st.addEventListener('click', async (e) => {
    e.stopPropagation()
    try {
      await mudarStatus(t, PROXIMO[status])
    } catch (erro) {
      mostrarAviso(msg(erro))
    }
  })

  const edit = document.createElement('button')
  edit.type = 'button'
  edit.className = 'task-edit-btn'
  edit.setAttribute('aria-label', `Editar ${t.texto}`)
  edit.innerHTML = icon('pencil')
  edit.addEventListener('click', (e) => {
    e.stopPropagation()
    abrirDialogo(t)
  })

  actions.append(st, edit)
  foot.append(actions)

  const painel = painelChecklist(t)
  card.append(top, foot, painel)

  const abrirOuChecklist = () => {
    if (temChecklist) {
      const aberto = !checklistAberto.has(t.id)
      definirChecklistAberto(t.id, aberto)
      painel.hidden = !aberto
      const toggle = card.querySelector('.task-check-toggle')
      if (toggle) {
        toggle.setAttribute('aria-expanded', String(aberto))
        toggle.classList.toggle('is-open', aberto)
      }
      return
    }
    abrirDialogo(t)
  }

  card.addEventListener('click', (e) => {
    if (card.classList.contains('is-dragging')) return
    if (e.target.closest('button, input, label, a, .task-checklist')) return
    abrirOuChecklist()
  })
  card.addEventListener('keydown', (e) => {
    if (e.target !== card) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      abrirOuChecklist()
    }
  })

  if (kanban) ativarArrasteKanban(card, t)

  return card
}

/* ---------- Kanban drag & drop (pointer: mouse + touch) ---------- */

let dragState = null

function ativarArrasteKanban(card, tarefa) {
  card.classList.add('is-draggable')
  card.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button !== 0) return
    if (e.target.closest('button, input, label, a, .task-checklist')) return

    const origemX = e.clientX
    const origemY = e.clientY
    let iniciou = false
    const pointerId = e.pointerId

    const onMove = (ev) => {
      if (ev.pointerId !== pointerId) return
      const dx = ev.clientX - origemX
      const dy = ev.clientY - origemY
      if (!iniciou) {
        if (Math.hypot(dx, dy) < 8) return
        iniciou = true
        iniciarDrag(card, tarefa, ev)
      }
      if (dragState) moverDrag(ev)
    }

    const onUp = (ev) => {
      if (ev.pointerId !== pointerId) return
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      if (iniciou) finalizarDrag(ev)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  })
}

function iniciarDrag(card, tarefa, ev) {
  const rect = card.getBoundingClientRect()
  const ghost = card.cloneNode(true)
  ghost.classList.add('task-card-ghost')
  ghost.style.width = `${rect.width}px`
  ghost.style.left = `${rect.left}px`
  ghost.style.top = `${rect.top}px`
  ghost.setAttribute('aria-hidden', 'true')
  document.body.append(ghost)

  card.classList.add('is-dragging')
  document.body.classList.add('is-kanban-dragging')
  dragState = {
    card,
    tarefa,
    ghost,
    offsetX: ev.clientX - rect.left,
    offsetY: ev.clientY - rect.top,
    statusOrigem: statusDoDia(tarefa, diaRef())
  }
  destacarColuna(ev.clientX, ev.clientY)
}

function moverDrag(ev) {
  if (!dragState) return
  const { ghost, offsetX, offsetY } = dragState
  ghost.style.left = `${ev.clientX - offsetX}px`
  ghost.style.top = `${ev.clientY - offsetY}px`
  destacarColuna(ev.clientX, ev.clientY)
}

function colunaSob(x, y) {
  const el = document.elementFromPoint(x, y)
  return el?.closest?.('.kanban-col') || null
}

function destacarColuna(x, y) {
  document.querySelectorAll('.kanban-col.is-drop-target').forEach((c) => c.classList.remove('is-drop-target'))
  const ghost = dragState?.ghost
  if (ghost) ghost.style.visibility = 'hidden'
  const col = colunaSob(x, y)
  if (ghost) ghost.style.visibility = ''
  if (col) col.classList.add('is-drop-target')
}

async function finalizarDrag(ev) {
  const state = dragState
  dragState = null
  if (!state) return

  state.ghost.style.visibility = 'hidden'
  const col = colunaSob(ev.clientX, ev.clientY)
  const novoStatus = col?.dataset?.status
  state.ghost.remove()
  state.card.classList.remove('is-dragging')
  document.body.classList.remove('is-kanban-dragging')
  document.querySelectorAll('.kanban-col.is-drop-target').forEach((c) => c.classList.remove('is-drop-target'))

  if (!novoStatus || novoStatus === state.statusOrigem) return
  try {
    await mudarStatus(state.tarefa, novoStatus)
    mostrarAviso(`Status: ${ROTULO_STATUS[novoStatus]}`)
  } catch (erro) {
    mostrarAviso(msg(erro))
    render()
  }
}

function renderVazio(mensagem) {
  const wrap = document.createElement('div')
  wrap.className = 'empty-tasks'
  const p = document.createElement('p')
  p.textContent = mensagem
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'btn btn-primary'
  btn.innerHTML = `${icon('plus')} Nova tarefa`
  btn.addEventListener('click', () => abrirDialogo())
  wrap.append(p, btn)
  board.replaceChildren(wrap)
}

function renderLista(lista) {
  if (!lista.length) {
    renderVazio('Nenhuma tarefa neste filtro.')
    return
  }
  const wrap = document.createElement('div')
  wrap.className = 'tasks-list'
  wrap.append(...lista.map((t) => fazerCard(t)))
  board.replaceChildren(wrap)
}

function renderKanban(lista) {
  const buckets = { pendente: [], andamento: [], concluida: [] }
  for (const t of lista) {
    const st = statusDoDia(t, diaRef())
    if (buckets[st]) buckets[st].push(t)
  }

  const grid = document.createElement('div')
  grid.className = 'kanban'

  for (const k of ['pendente', 'andamento', 'concluida']) {
    const el = document.createElement('div')
    el.className = 'kanban-col'
    el.dataset.status = k
    const h = document.createElement('h3')
    const count = document.createElement('span')
    count.className = 'kanban-count'
    count.textContent = String(buckets[k].length)
    h.append(document.createTextNode(ROTULO_STATUS[k]), count)
    el.append(h)
    if (!buckets[k].length) {
      const vazio = document.createElement('p')
      vazio.className = 'kanban-empty'
      vazio.textContent = 'Solte aqui'
      el.append(vazio)
    } else {
      el.append(...buckets[k].map((t) => fazerCard(t, { kanban: true })))
    }
    grid.append(el)
  }

  board.replaceChildren(grid)
}

function render() {
  if (vista === 'kanban') renderKanban(tarefas)
  else renderLista(tarefas)
}

function abrirDialogo(tarefa = null) {
  editando = tarefa
  erroEl.textContent = ''
  botaoExcluir.hidden = !tarefa
  document.querySelector('#tasks-dialog-kicker').textContent = tarefa ? 'EDITAR TAREFA' : 'NOVA TAREFA'
  document.querySelector('#tasks-dialog-title').textContent = tarefa ? 'Editar tarefa' : 'Adicionar tarefa'
  campoTitulo.value = tarefa?.texto ?? ''
  campoNotes.value = tarefa?.notes ?? ''
  campoPrioridade.value = tarefa?.prioridade ?? 'media'
  menuPrioridade.atualizar()
  campoDue.value = tarefa?.dueOn ?? ''
  definirTipo(tarefa?.tipo ?? 'unica')
  campoData.value = tarefa?.data ?? hojeChave()
  diasEl.querySelectorAll('[data-dia]').forEach((b) => {
    b.setAttribute('aria-pressed', String((tarefa?.dias ?? []).includes(Number(b.dataset.dia))))
  })
  tagsSelecionadas = new Set((tarefa?.tags ?? []).map((t) => t.id))
  checklistDraft = (tarefa?.checklist ?? []).map((i) => ({ texto: i.texto, feito: Boolean(i.feito) }))
  renderTagPicker()
  renderChecklistEditor()
  dialogo.showModal()
  campoTitulo.focus()
}

function fecharDialogo() {
  dialogo.close()
  editando = null
}

async function salvar(e) {
  e.preventDefault()
  erroEl.textContent = ''
  const texto = campoTitulo.value.trim()
  if (!texto) {
    erroEl.textContent = 'Informe o título.'
    return
  }
  const dias = [...diasEl.querySelectorAll('[aria-pressed="true"]')].map((b) => Number(b.dataset.dia))
  if (tipoAtual === 'recorrente' && !dias.length) {
    erroEl.textContent = 'Escolha ao menos um dia.'
    return
  }
  const corpo = {
    texto,
    tipo: tipoAtual,
    data: tipoAtual === 'unica' ? campoData.value || hojeChave() : undefined,
    dias: tipoAtual === 'recorrente' ? dias : undefined,
    prioridade: campoPrioridade.value,
    dueOn: campoDue.value || null,
    notes: campoNotes.value.trim(),
    tagIds: [...tagsSelecionadas],
    checklist: checklistDraft
  }
  try {
    if (editando) await tarefasApi.atualizar(editando.id, corpo)
    else await tarefasApi.criar(corpo)
    fecharDialogo()
    await carregar()
    mostrarAviso('Tarefa salva')
  } catch (erro) {
    erroEl.textContent = msg(erro)
  }
}

// Evita o menu de filtro abrir pra cima / ficar cortado
function corrigirMenusFiltro() {
  const observer = new MutationObserver(() => {
    const aberto = filtrosEl.querySelector('.cat-select.is-open')
    filtrosEl.classList.toggle('has-menu-open', Boolean(aberto))
    if (aberto) aberto.classList.remove('opens-up')
  })
  observer.observe(filtrosEl, { subtree: true, attributes: true, attributeFilter: ['class'] })
}

// Eventos UI
document.querySelectorAll('[data-vista]').forEach((b) => {
  b.addEventListener('click', () => {
    vista = b.dataset.vista
    document.querySelectorAll('[data-vista]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)))
    render()
  })
})

document.querySelectorAll('[data-filtro]').forEach((b) => {
  b.addEventListener('click', async () => {
    filtro = b.dataset.filtro
    document.querySelectorAll('[data-filtro]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)))
    await carregar()
  })
})

document.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => definirTipo(b.dataset.kind)))
document.querySelector('#tasks-add').addEventListener('click', () => abrirDialogo())
document.querySelector('#tasks-cancel').addEventListener('click', fecharDialogo)
document.querySelector('#tasks-cancel-x').addEventListener('click', fecharDialogo)
form.addEventListener('submit', salvar)
filtroPrio.addEventListener('change', () => carregar())
filtroTag.addEventListener('change', () => carregar())
refDay.addEventListener('change', () => render())

botaoExcluir.addEventListener('click', async () => {
  if (!editando) return
  try {
    await tarefasApi.excluir(editando.id)
    fecharDialogo()
    await carregar()
    mostrarAviso('Tarefa excluída')
  } catch (erro) {
    erroEl.textContent = msg(erro)
  }
})

document.querySelector('#tasks-add-tag').addEventListener('click', async () => {
  const nome = document.querySelector('#tasks-new-tag').value.trim()
  if (!nome) return
  try {
    const tag = await tarefasApi.criarTag({ nome })
    tags = await tarefasApi.listarTags()
    tagsSelecionadas.add(tag.id)
    document.querySelector('#tasks-new-tag').value = ''
    renderTagPicker()
    renderTagsFiltro()
  } catch (erro) {
    erroEl.textContent = msg(erro)
  }
})

document.querySelector('#tasks-check-add').addEventListener('click', () => {
  const texto = document.querySelector('#tasks-check-input').value.trim()
  if (!texto) return
  checklistDraft.push({ texto, feito: false })
  document.querySelector('#tasks-check-input').value = ''
  renderChecklistEditor()
})

montarDias()
corrigirMenusFiltro()
refDay.value = hojeChave()
definirTipo('unica')
carregar().catch((erro) => {
  board.innerHTML = `<p class="empty-tasks">${msg(erro)}</p>`
})

window.addEventListener('lifesync:assistente-acao', (ev) => {
  const areas = (ev.detail?.acoes ?? []).map((a) => a.area)
  if (!areas.length || areas.includes('tarefas')) carregar().catch(() => {})
})
