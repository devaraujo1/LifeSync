// Acesso às tarefas da conta (API). As tarefas são independentes dos eventos do Google Calendar.
import { api } from './api.js'

function normalizar(t) {
  return {
    ...t,
    dias: t.dias ?? [],
    concluidas: t.concluidas ?? {},
    andamento: t.andamento ?? {},
    prioridade: t.prioridade ?? 'media',
    dueOn: t.dueOn ?? null,
    notes: t.notes ?? '',
    tags: t.tags ?? [],
    checklist: t.checklist ?? []
  }
}

export const tarefasApi = {
  async listar(filtros = {}) {
    const q = new URLSearchParams()
    if (filtros.filtro) q.set('filtro', filtros.filtro)
    if (filtros.tag) q.set('tag', filtros.tag)
    if (filtros.prioridade) q.set('prioridade', filtros.prioridade)
    const qs = q.toString()
    const { tarefas } = await api.get(`/tarefas${qs ? `?${qs}` : ''}`)
    return tarefas.map(normalizar)
  },
  async criar(dados) {
    return normalizar((await api.post('/tarefas', dados)).tarefa)
  },
  async atualizar(id, campos) {
    return normalizar((await api.patch(`/tarefas/${encodeURIComponent(id)}`, campos)).tarefa)
  },
  async excluir(id) {
    await api.delete(`/tarefas/${encodeURIComponent(id)}`)
  },
  async concluir(id, dia, concluida) {
    return normalizar((await api.put(`/tarefas/${encodeURIComponent(id)}/concluidas/${dia}`, { concluida })).tarefa)
  },
  async definirStatus(id, dia, status) {
    return normalizar((await api.put(`/tarefas/${encodeURIComponent(id)}/status/${dia}`, { status })).tarefa)
  },
  async listarTags() {
    return (await api.get('/tarefas/tags')).tags
  },
  async criarTag(dados) {
    return (await api.post('/tarefas/tags', dados)).tag
  },
  async excluirTag(id) {
    await api.delete(`/tarefas/tags/${encodeURIComponent(id)}`)
  },
  async salvarChecklist(id, itens) {
    return normalizar((await api.put(`/tarefas/${encodeURIComponent(id)}/checklist`, { itens })).tarefa)
  }
}

// Estado de uma tarefa em um dia: 'pendente' | 'andamento' | 'concluida' (concluída vence andamento).
export function statusDoDia(tarefa, chave) {
  if (tarefa.concluidas?.[chave]) return 'concluida'
  if (tarefa.andamento?.[chave]) return 'andamento'
  return 'pendente'
}

export function vencimentoDe(tarefa) {
  return tarefa.dueOn || (tarefa.tipo === 'unica' ? tarefa.data : null)
}
