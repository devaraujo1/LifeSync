// Gemini 3.x: devolver thoughtSignature nos parts de functionCall do turno atual.

function limparSchema(schema) {
  if (!schema || typeof schema !== 'object') return { type: 'OBJECT', properties: {} }
  const out = { type: 'OBJECT', properties: {} }
  if (schema.description) out.description = schema.description
  const props = schema.properties ?? {}
  for (const [k, v] of Object.entries(props)) {
    out.properties[k] = converterProp(v)
  }
  if (Array.isArray(schema.required) && schema.required.length) out.required = schema.required
  return out
}

function converterProp(v) {
  if (!v || typeof v !== 'object') return { type: 'STRING' }
  const t = String(v.type ?? 'string').toLowerCase()
  const base = {}
  if (v.description) base.description = v.description
  if (t === 'number' || t === 'integer') {
    base.type = t === 'integer' ? 'INTEGER' : 'NUMBER'
  } else if (t === 'boolean') {
    base.type = 'BOOLEAN'
  } else if (t === 'array') {
    base.type = 'ARRAY'
    base.items = converterProp(v.items ?? { type: 'string' })
  } else if (t === 'object') {
    return limparSchema(v)
  } else {
    base.type = 'STRING'
    if (Array.isArray(v.enum)) base.enum = v.enum
  }
  return base
}

function paraToolsGemini(tools) {
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: limparSchema(t.parameters)
      }))
    }
  ]
}

function assinaturaDoPart(p) {
  return p?.thoughtSignature ?? p?.thought_signature ?? null
}

function partFunctionCall(c) {
  const part = {
    functionCall: {
      name: c.name,
      args: c.args ?? {}
    }
  }
  if (c.id) part.functionCall.id = c.id
  // Gemini 3: a assinatura fica no Part (não dentro de functionCall) e deve voltar intacta.
  if (c.thoughtSignature) part.thoughtSignature = c.thoughtSignature
  return part
}

function paraContents(messages) {
  const contents = []
  let i = 0
  while (i < messages.length) {
    const m = messages[i]
    if (m.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: m.content ?? '' }] })
      i += 1
      continue
    }
    if (m.role === 'assistant') {
      if (m.tool_calls?.length) {
        const parts = []
        if (m.content) parts.push({ text: m.content })
        for (const c of m.tool_calls) parts.push(partFunctionCall(c))
        contents.push({ role: 'model', parts })
      } else {
        const part = { text: m.content ?? '' }
        if (m.thoughtSignature) part.thoughtSignature = m.thoughtSignature
        contents.push({ role: 'model', parts: [part] })
      }
      i += 1
      continue
    }
    if (m.role === 'tool') {
      // Paralelismo: agrupa FR consecutivos num único content user (FC1+sig, FC2, FR1, FR2).
      const parts = []
      while (i < messages.length && messages[i].role === 'tool') {
        const t = messages[i]
        let response
        try {
          response = JSON.parse(t.content)
        } catch {
          response = { resultado: String(t.content ?? '') }
        }
        const fr = {
          functionResponse: {
            name: t.name || 'tool',
            response: typeof response === 'object' && response ? response : { resultado: response }
          }
        }
        if (t.tool_call_id) fr.functionResponse.id = t.tool_call_id
        parts.push(fr)
        i += 1
      }
      contents.push({ role: 'user', parts })
      continue
    }
    i += 1
  }
  return contents
}

const TIMEOUT_MS = 45_000
const MAX_OUTPUT_TOKENS = 8192

export function criarProvedorGemini({ apiKey, fetchImpl = fetch }) {
  return {
    nome: 'gemini',
    async chat({ system, messages, tools, model }) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
      const body = {
        systemInstruction: { parts: [{ text: system }] },
        contents: paraContents(messages),
        generationConfig: { temperature: 0.3, maxOutputTokens: MAX_OUTPUT_TOKENS }
      }
      if (tools?.length) {
        body.tools = paraToolsGemini(tools)
        body.toolConfig = { functionCallingConfig: { mode: 'AUTO' } }
      }
      const resp = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      })
      const texto = await resp.text()
      let dados
      try {
        dados = JSON.parse(texto)
      } catch {
        throw new Error(`Resposta inválida do Gemini (${resp.status}).`)
      }
      if (!resp.ok) {
        const msg = dados?.error?.message ?? texto.slice(0, 200)
        throw new Error(`Gemini: ${msg}`)
      }
      const parts = dados.candidates?.[0]?.content?.parts ?? []
      const calls = []
      const textos = []
      let thoughtText = null
      for (const p of parts) {
        if (p.functionCall?.name) {
          const call = {
            id: p.functionCall.id || `call_${p.functionCall.name}_${calls.length}`,
            name: p.functionCall.name,
            args: p.functionCall.args ?? {}
          }
          const sig = assinaturaDoPart(p)
          if (sig) call.thoughtSignature = sig
          calls.push(call)
        } else if (typeof p.text === 'string') {
          textos.push(p.text)
          const sig = assinaturaDoPart(p)
          if (sig) thoughtText = sig
        }
      }
      if (calls.length) {
        return { type: 'tool_calls', calls, text: textos.join('\n').trim() }
      }
      return { type: 'text', text: textos.join('\n').trim(), thoughtSignature: thoughtText }
    }
  }
}

export { paraContents, partFunctionCall }
