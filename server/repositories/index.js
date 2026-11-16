import { criarRepoUsuarios } from './users.js'
import { criarRepoSessoes } from './sessions.js'
import { criarRepoPreferencias } from './preferences.js'
import { criarRepoTarefas } from './tasks.js'
import { criarRepoTransacoes } from './transactions.js'
import { criarRepoCartoes } from './cards.js'
import { criarRepoFavoritos } from './favorites.js'
import { criarRepoEventos } from './events.js'
import { criarRepoCalendario } from './calendar.js'
import { criarRepoAssistentePendentes } from './assistentePendentes.js'

export function criarRepositorios(db) {
  return {
    usuarios: criarRepoUsuarios(db),
    sessoes: criarRepoSessoes(db),
    preferencias: criarRepoPreferencias(db),
    tarefas: criarRepoTarefas(db),
    transacoes: criarRepoTransacoes(db),
    cartoes: criarRepoCartoes(db),
    favoritos: criarRepoFavoritos(db),
    eventos: criarRepoEventos(db),
    calendario: criarRepoCalendario(db),
    assistentePendentes: criarRepoAssistentePendentes(db)
  }
}
