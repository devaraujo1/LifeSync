import { neon } from '@neondatabase/serverless'

// Sem transações interativas no driver HTTP: operações compostas usam CTE numa instrução ou são idempotentes.
export function criarBancoNeon(connectionString) {
  if (!connectionString) throw new Error('DATABASE_URL não configurada.')
  const sql = neon(connectionString)
  return {
    async query(text, params = []) {
      const resultado = await sql.query(text, params)
      return Array.isArray(resultado) ? resultado : (resultado?.rows ?? [])
    }
  }
}
