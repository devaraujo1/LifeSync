export function criarRepoAssistentePendentes(db) {
  return {
    async inserir(row) {
      await db.query(
        `insert into assistente_pendentes
           (id, user_id, kind, tipo, id_alvo, tool, args, preview, resumo, assinatura, expira_em)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, to_timestamp($11::double precision / 1000.0))`,
        [
          row.id,
          row.userId,
          row.kind,
          row.tipo,
          row.idAlvo,
          row.tool,
          JSON.stringify(row.args ?? null),
          JSON.stringify(row.preview ?? null),
          row.resumo,
          row.assinatura,
          row.expiraEm
        ]
      )
    },

    async buscar(id, userId) {
      const [r] = await db.query(
        `select id, user_id, kind, tipo, id_alvo, tool, args, preview, resumo, assinatura,
                (extract(epoch from expira_em) * 1000)::bigint as expira_em_ms
           from assistente_pendentes
          where id = $1 and user_id = $2 and expira_em > now()`,
        [id, userId]
      )
      return r ?? null
    },

    /** Consome de forma atômica (uma só vez entre instâncias). */
    async consumir(id, userId) {
      const [r] = await db.query(
        `delete from assistente_pendentes
          where id = $1 and user_id = $2 and expira_em > now()
          returning id, user_id, kind, tipo, id_alvo, tool, args, preview, resumo, assinatura,
                    (extract(epoch from expira_em) * 1000)::bigint as expira_em_ms`,
        [id, userId]
      )
      return r ?? null
    },

    async atualizar(id, userId, { args, preview, resumo, assinatura }) {
      const [r] = await db.query(
        `update assistente_pendentes
            set args = $3::jsonb, preview = $4::jsonb, resumo = $5, assinatura = $6
          where id = $1 and user_id = $2 and kind = 'escrita' and expira_em > now()
          returning id, kind, preview, resumo,
                    (extract(epoch from expira_em) * 1000)::bigint as expira_em_ms`,
        [id, userId, JSON.stringify(args ?? null), JSON.stringify(preview ?? null), resumo, assinatura]
      )
      return r ?? null
    },

    async descartar(id, userId) {
      const [r] = await db.query(
        `delete from assistente_pendentes
          where id = $1 and user_id = $2 and expira_em > now()
          returning id`,
        [id, userId]
      )
      return Boolean(r)
    },

    async limparExpirados() {
      await db.query('delete from assistente_pendentes where expira_em <= now()')
    }
  }
}
