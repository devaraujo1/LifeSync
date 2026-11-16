import { Router } from 'express'
import { z } from 'zod'
import { assincrono, HttpError, requisicaoInvalida } from '../lib/errors.js'
import { validar, zTexto } from '../lib/validate.js'
import { criarProvedorIa, statusIa } from '../services/assistente/providers/index.js'
import { executarLoopAssistente } from '../services/assistente/loop.js'
import {
  executarEscritaConfirmada,
  executarExclusaoConfirmada
} from '../services/assistente/tools.js'
import { mesclarEdicaoPrevia } from '../services/assistente/previa.js'
import {
  atualizarPendencia,
  consumirPendencia,
  descartarPendencia,
  guardarPendencia,
  lerPendencia,
  restaurarPendencia
} from '../services/assistente/pendentes.js'

const zChat = z.object({
  mensagem: zTexto(1, 4000),
  historico: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(4000)
      })
    )
    .max(20)
    .optional()
    .default([]),
  pensar: z.boolean().optional().default(false)
})

const zConfirmId = z.object({
  confirmId: z.string().uuid()
})

const zEditar = z.object({
  confirmId: z.string().uuid(),
  campos: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).default({})
})

export function criarRotasAssistente({ config, repos, calendario, limites, llm }) {
  const router = Router()
  const provedorFixo = llm ?? null

  function obterProvedor() {
    if (provedorFixo) return provedorFixo
    try {
      return criarProvedorIa(config)
    } catch (erro) {
      throw new HttpError(503, 'ia_indisponivel', String(erro.message || erro))
    }
  }

  function ctxReq(req) {
    return { repos, calendario, usuario: req.usuario, agora: new Date() }
  }

  router.get(
    '/status',
    assincrono(async (_req, res) => {
      res.json(statusIa(config))
    })
  )

  router.post(
    '/chat',
    limites.assistente,
    assincrono(async (req, res) => {
      const corpo = validar(zChat, req.body)
      const st = statusIa(config)
      if (!st.configurado && !provedorFixo) {
        throw new HttpError(503, 'ia_nao_configurada', 'Assistente IA não configurado. Defina AI_API_KEY no servidor.')
      }
      const provider = obterProvedor()
      if (!provider) {
        throw new HttpError(503, 'ia_nao_configurada', 'Assistente IA não configurado. Defina AI_API_KEY no servidor.')
      }

      let resultado
      try {
        resultado = await executarLoopAssistente({
          provider,
          repos,
          calendario,
          usuario: req.usuario,
          mensagem: corpo.mensagem,
          historico: corpo.historico,
          pensar: corpo.pensar,
          model: config.ia.model,
          modelPensar: config.ia.modelPensar
        })
      } catch (erro) {
        const msg = String(erro?.message || erro)
        if (erro?.name === 'TimeoutError' || erro?.name === 'AbortError' || /aborted|timeout/i.test(msg)) {
          throw new HttpError(504, 'ia_timeout', 'A IA demorou demais para responder.')
        }
        if (/quota|rate.?limit|RESOURCE_EXHAUSTED|Too Many Requests|429/i.test(msg)) {
          throw new HttpError(429, 'ia_limite', 'Limite de uso da IA atingido. Tente mais tarde.')
        }
        if (/Gemini:|Provedor IA:|Resposta inválida/i.test(msg)) {
          throw new HttpError(502, 'ia_falhou', 'A IA falhou ao processar. Tente de novo.')
        }
        throw erro
      }

      let precisaConfirmacao = null
      if (resultado.precisaConfirmacao) {
        const pc = resultado.precisaConfirmacao
        const kind = pc.kind === 'escrita' ? 'escrita' : 'exclusao'
        const guardado = await guardarPendencia({
          userId: req.usuario.id,
          kind,
          tipo: pc.tipo,
          idAlvo: pc.id,
          tool: pc.tool,
          args: pc.args,
          preview: pc.preview,
          resumo: pc.resumo,
          secret: config.sessionSecret,
          repos
        })
        precisaConfirmacao = {
          id: guardado.id,
          kind: guardado.kind,
          resumo: guardado.resumo,
          preview: guardado.preview
        }
      }

      res.json({
        resposta: resultado.resposta,
        acoes: resultado.acoes,
        precisaConfirmacao,
        provider: resultado.provider,
        model: resultado.model
      })
    })
  )

  router.post(
    '/confirmar',
    limites.assistente,
    assincrono(async (req, res) => {
      const { confirmId } = validar(zConfirmId, req.body)
      const pendente = await consumirPendencia({
        confirmId,
        userId: req.usuario.id,
        secret: config.sessionSecret,
        repos
      })
      if (!pendente) throw requisicaoInvalida('Confirmação expirada ou inválida.')

      const ctx = ctxReq(req)
      try {
        if (pendente.kind === 'escrita') {
          const r = await executarEscritaConfirmada({ tool: pendente.tool, args: pendente.args }, ctx)
          res.json({
            ok: true,
            kind: 'escrita',
            resumo: r.resumo,
            area: r.acao?.area ?? null,
            acao: r.acao ?? null
          })
          return
        }

        const r = await executarExclusaoConfirmada({ tipo: pendente.tipo, id: pendente.id }, ctx)
        res.json({ ok: true, kind: 'exclusao', resumo: r.resumo, area: r.area })
      } catch (erro) {
        await restaurarPendencia({
          confirmId: pendente.confirmId || confirmId,
          userId: req.usuario.id,
          kind: pendente.kind,
          tipo: pendente.tipo,
          id: pendente.id,
          tool: pendente.tool,
          args: pendente.args,
          preview: pendente.preview,
          resumo: pendente.resumo,
          secret: config.sessionSecret,
          repos,
          expiraEm: pendente.expiraEm
        }).catch(() => {})
        throw erro
      }
    })
  )

  router.post(
    '/cancelar',
    limites.assistente,
    assincrono(async (req, res) => {
      const { confirmId } = validar(zConfirmId, req.body)
      const ok = await descartarPendencia({
        confirmId,
        userId: req.usuario.id,
        secret: config.sessionSecret,
        repos
      })
      if (!ok) throw requisicaoInvalida('Prévia expirada ou inválida.')
      res.json({ ok: true, resumo: 'Operação cancelada.' })
    })
  )

  router.post(
    '/editar-previa',
    limites.assistente,
    assincrono(async (req, res) => {
      const corpo = validar(zEditar, req.body)
      const atual = await lerPendencia({
        confirmId: corpo.confirmId,
        userId: req.usuario.id,
        secret: config.sessionSecret,
        repos
      })
      if (!atual || atual.kind !== 'escrita') throw requisicaoInvalida('Prévia inválida para edição.')

      const nova = await mesclarEdicaoPrevia(atual.tool, atual.args, corpo.campos, ctxReq(req))
      const guardado = await atualizarPendencia({
        confirmId: corpo.confirmId,
        userId: req.usuario.id,
        secret: config.sessionSecret,
        args: nova.args,
        preview: nova.preview,
        resumo: nova.resumo,
        repos
      })
      if (!guardado) throw requisicaoInvalida('Não foi possível atualizar a prévia.')
      res.json({
        ok: true,
        precisaConfirmacao: {
          id: guardado.id,
          kind: guardado.kind,
          resumo: guardado.resumo,
          preview: guardado.preview
        }
      })
    })
  )

  return router
}
