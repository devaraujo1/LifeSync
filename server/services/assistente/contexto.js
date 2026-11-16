import { formatarNoFuso } from '../../lib/dates.js'

function dinheiro(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return 'R$ —'
  return `R$ ${v.toFixed(2).replace('.', ',')}`
}

function safe(p) {
  return Promise.resolve(p).catch(() => null)
}

export async function montarContextoUsuario({ repos, usuario, agora = new Date() }) {
  if (!repos || !usuario?.id) return { texto: '', dados: null }

  const fuso = usuario.timezone || 'America/Sao_Paulo'
  const hoje = formatarNoFuso(agora, fuso).data
  const mes = hoje.slice(0, 7)

  const [resumo, tarefas, eventos, cartoes, meta] = await Promise.all([
    safe(repos.transacoes?.resumo?.(usuario.id, mes)),
    safe(
      repos.tarefas?.listar?.(usuario.id, {
        filtro: 'ativas',
        refDia: hoje,
        limite: 8
      })
    ),
    safe(repos.eventos?.listar?.(usuario.id, 12)),
    safe(repos.cartoes?.listarCartoes?.(usuario.id)),
    safe(repos.transacoes?.obterMeta?.(usuario.id))
  ])

  const linhas = []
  if (usuario.nome) linhas.push(`Nome: ${String(usuario.nome).slice(0, 80)}`)
  linhas.push(`Fuso: ${fuso}`)

  if (resumo) {
    linhas.push(
      `Mês ${mes}: entradas ${dinheiro(resumo.entradas)}, despesas ${dinheiro(resumo.despesas)}, saldo ${dinheiro(resumo.saldo)}, caixa ${dinheiro(resumo.caixa)}`
    )
    if (resumo.despesasCartao) linhas.push(`Despesas no cartão (mês): ${dinheiro(resumo.despesasCartao)}`)
    if (resumo.faturasPendentes) linhas.push(`Faturas pendentes (total): ${dinheiro(resumo.faturasPendentes)}`)
  }

  if (meta) {
    linhas.push(`Meta: ${meta.nome || 'sem nome'} ${dinheiro(meta.valor)} até ${meta.prazo}`)
  }

  const listaTarefas = Array.isArray(tarefas) ? tarefas : []
  if (listaTarefas.length) {
    const top = listaTarefas.slice(0, 5).map((t) => {
      const pri = t.prioridade ? ` [${t.prioridade}]` : ''
      const due = t.dueOn ? ` até ${t.dueOn}` : ''
      return `- ${String(t.texto || '').slice(0, 80)}${pri}${due}`
    })
    linhas.push(`Tarefas ativas (${listaTarefas.length}${listaTarefas.length >= 8 ? '+' : ''}):`)
    linhas.push(...top)
  } else {
    linhas.push('Tarefas ativas: nenhuma')
  }

  const listaEv = Array.isArray(eventos) ? eventos : []
  const futuros = listaEv
    .filter((e) => e?.data && e.data >= hoje)
    .sort((a, b) => String(a.data).localeCompare(String(b.data)) || String(a.inicio || '').localeCompare(String(b.inicio || '')))
    .slice(0, 5)
  if (futuros.length) {
    linhas.push('Próximos eventos:')
    for (const e of futuros) {
      const hora = e.diaInteiro ? 'dia inteiro' : e.inicio || '?'
      linhas.push(`- ${e.data} ${hora}: ${String(e.titulo || '').slice(0, 80)}`)
    }
  } else {
    linhas.push('Próximos eventos: nenhum nos próximos itens listados')
  }

  const listaCartao = (Array.isArray(cartoes) ? cartoes : []).filter((c) => c?.ativo !== false)
  if (listaCartao.length) {
    linhas.push('Cartões ativos:')
    for (const c of listaCartao.slice(0, 6)) {
      linhas.push(
        `- ${c.nome}${c.instituicao ? ` (${c.instituicao})` : ''}: limite ${dinheiro(c.limite)}, usado ${dinheiro(c.usado)}, disponível ${dinheiro(c.disponivel)}`
      )
    }
  } else {
    linhas.push('Cartões ativos: nenhum')
  }

  return {
    texto: linhas.join('\n'),
    dados: { mes, resumo, tarefas: listaTarefas, eventos: futuros, cartoes: listaCartao, meta }
  }
}
