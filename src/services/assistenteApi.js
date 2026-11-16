import { api } from './api.js'

export const EVENTO_ASSISTENTE = 'lifesync:assistente-acao'

export function emitirAcaoAssistente(detalhe) {
  window.dispatchEvent(new CustomEvent(EVENTO_ASSISTENTE, { detail: detalhe ?? {} }))
}

export const assistenteApi = {
  status: () => api.get('/assistente/status'),
  chat: (corpo, opts) => api.post('/assistente/chat', corpo, opts),
  confirmar: (confirmId) => api.post('/assistente/confirmar', { confirmId }),
  cancelar: (confirmId) => api.post('/assistente/cancelar', { confirmId }),
  editarPrevia: (confirmId, campos) => api.post('/assistente/editar-previa', { confirmId, campos })
}
