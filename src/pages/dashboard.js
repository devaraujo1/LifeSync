import { iniciarShell } from '../modules/shell.js'
import { iniciarRelogio } from '../modules/clock.js'
import { iniciarClima } from '../modules/weather.js'
import { iniciarTarefas } from '../modules/tarefas.js'
import { iniciarPesquisaGoogle } from '../modules/google-search.js'
import { iniciarAtalhos } from '../modules/favoritos.js'
import { iniciarAgendaInicio } from '../modules/agenda.js'
import { EVENTO, nomeSaudacao } from '../modules/preferencias.js'
import { financeiroApi } from '../services/financeiroApi.js'

iniciarShell({ pagina: 'inicio' })

iniciarRelogio()
iniciarClima()
iniciarTarefas()
iniciarPesquisaGoogle()
iniciarAtalhos()
iniciarAgendaInicio()

function iniciarSaudacao() {
  const titulo = document.querySelector('#welcome-title')
  const nome = document.querySelector('#welcome-name')

  if (!titulo) return

  // Sem nome na conta, a saudação fica só com "Bom dia" (nada de nome fixo para quem não é o dono do código).
  function atualizar() {
    const hora = new Date().getHours()
    const saudacao = hora >= 5 && hora < 12 ? 'Bom dia' : hora >= 12 && hora < 18 ? 'Boa tarde' : 'Boa noite'
    const nomeAtual = nomeSaudacao()

    titulo.textContent = nomeAtual ? `${saudacao},` : saudacao
    if (nome) nome.textContent = nomeAtual
  }

  atualizar()
  setInterval(atualizar, 60000)
  window.addEventListener(EVENTO, atualizar)
}

iniciarSaudacao()

async function iniciarSaldoDoMes() {
  const elemento = document.querySelector('#month-balance')
  if (!elemento) return

  const agora = new Date()
  const mes = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`

  try {
    const resumo = await financeiroApi.resumo(mes)
    if (!resumo.entradas && !resumo.despesas && !resumo.guardado) return // sem movimentações: mantém o valor inicial

    elemento.textContent = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(resumo.saldo)
    elemento.classList.toggle('is-negative', resumo.saldo < 0)
  } catch {
    /* sem resposta do servidor: mantém o valor inicial */
  }
}

iniciarSaldoDoMes()
