import { obterServidor } from '../../server/index.js'

// Agendador do Netlify: sincroniza as contas conectadas a cada 15 minutos.
// Não é "tempo real": mudanças feitas no Google aparecem em até ~15 min (ou ao abrir o dashboard).
// Proteção: se CRON_SECRET estiver definido, exige Authorization: Bearer <secret> (ou x-cron-secret).
export default async (req) => {
  const esperado = (process.env.CRON_SECRET || '').trim()
  if (esperado) {
    const auth = req?.headers?.get?.('authorization') || req?.headers?.authorization || ''
    const header = req?.headers?.get?.('x-cron-secret') || req?.headers?.['x-cron-secret'] || ''
    const okBearer = auth === `Bearer ${esperado}`
    const okHeader = header === esperado
    if (!okBearer && !okHeader) {
      return new Response(JSON.stringify({ erro: 'nao_autorizado' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  const { calendario } = obterServidor()
  const resultados = await calendario.sincronizarTodos({ limite: 25, tempoMaxMs: 20000 })
  console.log(`[calendar-sync] contas processadas: ${resultados.length}`)
  return new Response(null, { status: 204 })
}

export const config = { schedule: '*/15 * * * *' }
