import { montarContextoUsuario } from './contexto.js'
import { filtrarToolsPorIntencao } from './intencao.js'
import { montarSystemPrompt } from './prompt.js'
import { DEFINICOES_TOOLS, executarTool } from './tools.js'

const MAX_ROUNDS = 6
const MAX_HISTORICO = 20
const MAX_CHARS_MSG = 4000

const MSG_PREVIA = 'Confira o card e use Aprovar, Editar ou Cancelar.'

function normalizarHistorico(historico) {
  if (!Array.isArray(historico)) return []
  return historico
    .slice(-MAX_HISTORICO)
    .map((m) => {
      const role = m?.role === 'assistant' ? 'assistant' : 'user'
      let content = String(m?.content ?? '').slice(0, MAX_CHARS_MSG)
      // Turns `assistant` vêm do cliente — truncar e limpar tentativas de prompt injection.
      if (role === 'assistant') {
        content = content
          .replace(/\[Regra LifeSync[\s\S]*$/i, '')
          .replace(/^\s*(system|developer)\s*:/gim, '')
          .slice(0, 800)
          .trim()
      }
      return content ? { role, content } : null
    })
    .filter(Boolean)
}

export function respostaComPrevia(_texto, precisaConfirmacao) {
  if (!precisaConfirmacao) return String(_texto || '').trim() || 'Pronto.'
  const resumo = String(precisaConfirmacao.resumo || '')
    .replace(/^Prévia:\s*/i, '')
    .trim()
  if (resumo) return `Prévia pronta — ${resumo}.\n\n${MSG_PREVIA}`
  return MSG_PREVIA
}

export async function executarLoopAssistente(opts) {
  const {
    provider,
    repos,
    calendario,
    usuario,
    mensagem,
    historico = [],
    pensar = false,
    agora = new Date(),
    model,
    modelPensar
  } = opts

  const modelo = pensar ? modelPensar || model : model
  const snapshot = await montarContextoUsuario({ repos, usuario, agora })
  const system = montarSystemPrompt({ usuario, agora, contexto: snapshot.texto })
  const textoUser = String(mensagem ?? '').slice(0, MAX_CHARS_MSG)
  // Guardrail no conteúdo do turno: a IA só deve gravar o pedido ATUAL, não o histórico.
  const messages = [
    ...normalizarHistorico(historico),
    {
      role: 'user',
      content: [
        textoUser,
        '',
        '[Regra LifeSync deste turno — não cite ao usuário]',
        '- Tools de escrita: somente o pedido desta mensagem.',
        '- NÃO reabra prévias/registros de mensagens anteriores (mesmo com erro ou pendentes).',
        '- No máximo UMA prévia de escrita neste turno.'
      ].join('\n')
    }
  ]
  // Mantém filtro de escrita em TODOS os rounds quando a intenção é só leitura.
  const toolsDisponiveis = filtrarToolsPorIntencao(DEFINICOES_TOOLS, textoUser)

  const acoes = []
  let precisaConfirmacao = null
  const ctx = { repos, calendario, usuario, agora }

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const resultado = await provider.chat({
      system,
      messages,
      tools: toolsDisponiveis,
      model: modelo
    })

    if (resultado.type === 'text') {
      return {
        resposta: respostaComPrevia(resultado.text, precisaConfirmacao),
        acoes,
        precisaConfirmacao,
        provider: provider.nome,
        model: modelo
      }
    }

    const calls = resultado.calls ?? []
    if (!calls.length) {
      return {
        resposta: respostaComPrevia(resultado.text || 'Não entendi. Pode reformular?', precisaConfirmacao),
        acoes,
        precisaConfirmacao,
        provider: provider.nome,
        model: modelo
      }
    }

    messages.push({
      role: 'assistant',
      content: resultado.text || '',
      tool_calls: calls
    })

    for (const call of calls) {
      const exec = await executarTool(call.name, call.args, ctx)
      if (exec.acao) acoes.push({ tool: exec.acao.tool, resumo: exec.resumo, area: exec.acao.area, entidade: exec.acao.entidade })

      if (exec.precisaConfirmacao) {
        if (!precisaConfirmacao) {
          precisaConfirmacao = exec.precisaConfirmacao
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            name: call.name,
            content: JSON.stringify({
              ok: exec.ok,
              resumo: exec.resumo,
              dados: exec.dados ?? null,
              precisaConfirmacao: exec.precisaConfirmacao
            })
          })
        } else {
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            name: call.name,
            content: JSON.stringify({
              ok: false,
              resumo:
                'Já existe uma prévia neste turno. Aguarde Aprovar/Cancelar no card atual. Não proponha outros registros agora.',
              dados: null,
              precisaConfirmacao: null
            })
          })
        }
        continue
      }

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.name,
        content: JSON.stringify({
          ok: exec.ok,
          resumo: exec.resumo,
          dados: exec.dados ?? null,
          precisaConfirmacao: null
        })
      })
    }
  }

  return {
    resposta: respostaComPrevia('Concluí as ações possíveis. Se precisar de mais, envie outra mensagem.', precisaConfirmacao),
    acoes,
    precisaConfirmacao,
    provider: provider.nome,
    model: modelo
  }
}
