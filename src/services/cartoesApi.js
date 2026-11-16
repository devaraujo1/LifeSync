import { api } from './api.js'

const consulta = (filtros = {}) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(filtros)) if (v) p.set(k, v)
  const s = p.toString()
  return s ? `?${s}` : ''
}

// Cartões de crédito. Valores monetários chegam como número com 2 casas; as contas (parcelas, faturas,
// status) são feitas no servidor.
export const cartoesApi = {
  painel: () => api.get('/cartoes/painel'),
  async criarCartao(dados) {
    return (await api.post('/cartoes', dados)).cartao
  },
  async atualizarCartao(id, dados) {
    return (await api.patch(`/cartoes/${encodeURIComponent(id)}`, dados)).cartao
  },
  async faturas(filtros) {
    return (await api.get(`/cartoes/faturas${consulta(filtros)}`)).faturas
  },
  fatura: (id) => api.get(`/cartoes/faturas/${encodeURIComponent(id)}`),
  async lancamentos(filtros) {
    return (await api.get(`/cartoes/lancamentos${consulta(filtros)}`)).lancamentos
  },
  async consumo() {
    return (await api.get('/cartoes/consumo')).consumo
  },
  criarCompra: (dados) => api.post('/cartoes/compras', dados),
  atualizarCompra: (id, dados) => api.patch(`/cartoes/compras/${encodeURIComponent(id)}`, dados),
  excluirCompra: (id) => api.delete(`/cartoes/compras/${encodeURIComponent(id)}`),
  pagar: (dados) => api.post('/cartoes/pagamentos', dados),
  excluirPagamento: (id) => api.delete(`/cartoes/pagamentos/${encodeURIComponent(id)}`)
}
