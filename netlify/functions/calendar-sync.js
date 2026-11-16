import { timingSafeEqual } from 'node:crypto'
import { obterServidor } from '../../server/index.js'

function header(req, nome) {
  const lower = nome.toLowerCase()
  if (typeof req?.headers?.get === 'function') return req.headers.get(nome) || req.headers.get(lower) || ''
  const h = req?.headers || {}
  return h[nome] || h[lower] || ''
}

function secretoIgual(a, b) {
  const x = Buffer.from(String(a))
  const y = Buffer.from(String(b))
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y)
}

function autorizado(req, esperado) {
  // Invocação do scheduler Netlify (não manda Bearer).
  const evento = String(header(req, 'x-netlify-event') || '').toLowerCase()
  if (evento === 'schedule') return true

  const auth = header(req, 'authorization')
  const cron = header(req, 'x-cron-secret')
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  return secretoIgual(bearer, esperado) || secretoIgual(cron, esperado)
}

// Em produção exige CRON_SECRET (fail-closed). Aceita Bearer/x-cron-secret OU x-netlify-event: schedule.
export default async (req) => {
  const esperado = (process.env.CRON_SECRET || '').trim()
  const producao = process.env.NODE_ENV === 'production'

  if (producao && !esperado) {
    console.error('[calendar-sync] CRON_SECRET ausente em produção')
    return new Response(JSON.stringify({ erro: 'cron_nao_configurado' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  if (esperado && !autorizado(req, esperado)) {
    return new Response(JSON.stringify({ erro: 'nao_autorizado' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const { calendario } = obterServidor()
  const resultados = await calendario.sincronizarTodos({ limite: 25, tempoMaxMs: 20000 })
  console.log(`[calendar-sync] contas processadas: ${resultados.length}`)
  return new Response(null, { status: 204 })
}

export const config = { schedule: '*/15 * * * *' }
