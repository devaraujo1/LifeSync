// Adapter Chat Completions + tools (OpenAI, Groq, OpenRouter, HF router, etc.).

function paraToolsOpenAI(tools) {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }
  }))
}

function paraMensagensOpenAI(system, messages) {
  const out = [{ role: 'system', content: system }]
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.content ?? '' })
    else if (m.role === 'assistant') {
      if (m.tool_calls?.length) {
        out.push({
          role: 'assistant',
          content: m.content ?? null,
          tool_calls: m.tool_calls.map((c) => ({
            id: c.id,
            type: 'function',
            function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) }
          }))
        })
      } else out.push({ role: 'assistant', content: m.content ?? '' })
    } else if (m.role === 'tool') {
      out.push({ role: 'tool', tool_call_id: m.tool_call_id, content: String(m.content ?? '') })
    }
  }
  return out
}

const TIMEOUT_MS = 45_000
const MAX_TOKENS = 8192

export function criarProvedorOpenAICompat({ apiKey, baseUrl, fetchImpl = fetch }) {
  const base = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')

  return {
    nome: 'openai_compat',
    async chat({ system, messages, tools, model }) {
      const resp = await fetchImpl(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: paraMensagensOpenAI(system, messages),
          tools: tools?.length ? paraToolsOpenAI(tools) : undefined,
          tool_choice: tools?.length ? 'auto' : undefined,
          temperature: 0.3,
          max_tokens: MAX_TOKENS
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      })
      const texto = await resp.text()
      let dados
      try {
        dados = JSON.parse(texto)
      } catch {
        throw new Error(`Resposta inválida do provedor IA (${resp.status}).`)
      }
      if (!resp.ok) {
        const msg = dados?.error?.message ?? dados?.erro?.mensagem ?? texto.slice(0, 200)
        throw new Error(`Provedor IA: ${msg}`)
      }
      const msg = dados.choices?.[0]?.message
      if (!msg) throw new Error('Provedor IA não retornou mensagem.')
      const calls = (msg.tool_calls ?? [])
        .filter((c) => c?.function?.name)
        .map((c) => {
          let args = {}
          try {
            args = JSON.parse(c.function.arguments || '{}')
          } catch {
            args = {}
          }
          return { id: c.id || `call_${c.function.name}`, name: c.function.name, args }
        })
      if (calls.length) return { type: 'tool_calls', calls, text: msg.content ?? '' }
      return { type: 'text', text: String(msg.content ?? '').trim() }
    }
  }
}
