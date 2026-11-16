// Nomes de tabela/coluna só vêm do código (nunca do cliente); valores parametrizados.
export async function atualizarCampos(db, tabela, userId, id, campos) {
  const params = [id, userId]
  const sets = []
  for (const [coluna, [valor, cast]] of Object.entries(campos)) {
    params.push(valor)
    sets.push(`${coluna} = $${params.length}${cast ? `::${cast}` : ''}`)
  }
  if (!sets.length) return true
  const linhas = await db.query(
    `update ${tabela} set ${sets.join(', ')}, updated_at = now() where id = $1 and user_id = $2 returning id`,
    params
  )
  return linhas.length > 0
}

export const diaSQL = (coluna) => `to_char(${coluna}, 'YYYY-MM-DD')`
