import { api } from './api.js'

export const URL_CONECTAR = '/api/calendario/conectar'

export const calendarioApi = {
  status: () => api.get('/calendario/status'),
  sincronizar: (forcar = false) => api.post('/calendario/sincronizar', { forcar }),
  async desconectar() {
    await api.delete('/calendario/conexao')
  }
}

export function mudouAgenda(resposta) {
  const r = resposta?.resumo
  return Boolean(r && resposta.estado === 'ok' && r.criados + r.atualizados + r.removidos + r.excecoes + r.enviados > 0)
}
