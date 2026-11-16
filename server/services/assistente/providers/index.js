import { criarProvedorGemini } from './gemini.js'
import { criarProvedorOpenAICompat } from './openaiCompat.js'

export function criarProvedorIa(config, { fetchImpl = fetch } = {}) {
  const ia = config.ia ?? {}
  const apiKey = ia.apiKey
  if (!apiKey) return null
  const provider = ia.provider || 'gemini'
  if (provider === 'gemini') return criarProvedorGemini({ apiKey, fetchImpl })
  if (provider === 'openai_compat') {
    return criarProvedorOpenAICompat({ apiKey, baseUrl: ia.baseUrl, fetchImpl })
  }
  throw new Error(`Provedor IA desconhecido: ${provider}`)
}

export function statusIa(config) {
  const ia = config.ia ?? {}
  const model = (ia.model || 'gemini-3.5-flash-lite').trim()
  const modelPensar = (ia.modelPensar || 'gemini-3.8-flash').trim()
  // Modelos vazios ou placeholder óbvios → sinaliza no /status (evita 404 silencioso no chat).
  const modeloSuspeito = (m) => !m || /modelo|changeme|todo|example/i.test(m)
  return {
    configurado: Boolean(ia.apiKey),
    provider: ia.provider || 'gemini',
    model,
    modelPensar,
    modelosOk: !modeloSuspeito(model) && !modeloSuspeito(modelPensar)
  }
}
