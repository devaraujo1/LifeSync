import { sair } from './api.js'
import { limparCache } from './cacheLocal.js'

export async function encerrarSessao() {
  await sair() // invalida a sessão no servidor
  limparCache() // não deixa preferências da conta em um navegador compartilhado
  try {
    sessionStorage.removeItem('lifesync-sessao-uid')
  } catch {
    /* ignore */
  }
  window.location.assign('/')
}
