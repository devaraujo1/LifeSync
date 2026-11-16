import { api } from './api.js'

const PAGINA = 2000

export const financeiroApi = {
  async listar() {
    const todas = []
    for (let offset = 0; ; offset += PAGINA) {
      const { transacoes } = await api.get(`/transacoes?limite=${PAGINA}&offset=${offset}`)
      todas.push(...transacoes)
      if (transacoes.length < PAGINA) return todas
    }
  },
  async criar(dados) {
    return (await api.post('/transacoes', dados)).transacao
  },
  async excluir(id) {
    await api.delete(`/transacoes/${encodeURIComponent(id)}`)
  },
  async obterMeta() {
    return (await api.get('/meta')).meta
  },
  async salvarMeta(meta) {
    return (await api.put('/meta', meta)).meta
  },
  async removerMeta() {
    await api.delete('/meta')
  },
  async listarCategorias() {
    return (await api.get('/categorias')).categorias
  },
  async criarCategoria(dados) {
    return (await api.post('/categorias', dados)).categoria
  },
  async removerCategoria(id) {
    await api.delete(`/categorias/${encodeURIComponent(id)}`)
  },
  async resumo(mes) {
    return (await api.get(`/transacoes/resumo?mes=${mes}`)).resumo
  }
}
