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
  const feitos = (t.checklist ?? []).filter((i) => i.feito).length
  const total = (t.checklist ?? []).length
  if (total) {
    const c = document.createElement('span')
    c.className = 'meta-chip'
    c.innerHTML = `${icon('check')} ${feitos}/${total}`
    meta.append(c)
  }
  return meta
}

function fazerCard(t) {
  const card = document.createElement('article')
  const status = statusDoDia(t, diaRef())
  card.className = 'task-card'
  card.dataset.prio = t.prioridade || 'media'
  card.dataset.status = status
  card.tabIndex = 0
  card.setAttribute('role', 'button')
  card.setAttribute('aria-label', `${t.texto}. ${ROTULO_STATUS[status]}. Abrir para editar`)

  const top = document.createElement('div')
  top.className = 'task-card-top'
  const titulo = document.createElement('p')
  titulo.className = 'task-card-title'
  titulo.textContent = t.texto
  top.append(titulo)

  const foot = document.createElement('div')
  foot.className = 'task-card-foot'
  foot.append(cardMeta(t))

  const actions = document.createElement('div')
  actions.className = 'task-card-actions'

  const st = document.createElement('button')
  st.type = 'button'
  st.className = 'status-pill'
  st.dataset.status = status
  st.setAttribute('aria-label', `Status: ${ROTULO_STATUS[status]}. Clique para alterar`)
  st.textContent = ROTULO_STATUS[status]
  st.addEventListener('click', async (e) => {
    e.stopPropagation()
    try {
      const atualizada = await tarefasApi.definirStatus(t.id, diaRef(), PROXIMO[status])
      const i = tarefas.findIndex((x) => x.id === t.id)
      if (i >= 0) tarefas[i] = atualizada
      render()
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
  card.append(top, foot)
  card.addEventListener('click', () => abrirDialogo(t))
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      abrirDialogo(t)
    }
  })
  return card
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
  wrap.append(...lista.map(fazerCard))
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
    const h = document.createElement('h3')
    const count = document.createElement('span')
    count.className = 'kanban-count'
    count.textContent = String(buckets[k].length)
    h.append(document.createTextNode(ROTULO_STATUS[k]), count)
    el.append(h)
    if (!buckets[k].length) {
      const vazio = document.createElement('p')
      vazio.className = 'kanban-empty'
      vazio.textContent = 'Nenhuma tarefa'
      el.append(vazio)
    } else {
      el.append(...buckets[k].map(fazerCard))
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
refDay.value = hojeChave()
definirTipo('unica')
carregar().catch((erro) => {
  board.innerHTML = `<p class="empty-tasks">${msg(erro)}</p>`
})

window.addEventListener('lifesync:assistente-acao', (ev) => {
  const areas = (ev.detail?.acoes ?? []).map((a) => a.area)
  if (!areas.length || areas.includes('tarefas')) carregar().catch(() => {})
})
