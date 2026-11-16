import rateLimit from 'express-rate-limit'

// Em ambiente serverless cada instância tem sua própria memória: este limite é uma barreira de
// atrito contra abuso simples, não uma garantia global. Para limite global use o do Netlify/WAF.
// Nunca confiar em headers enviados pelo cliente (ex.: x-nf-client-connection-ip spoofável).
// Em produção com trust proxy, req.ip vem do hop confiável.
function chaveDoCliente(req) {
  const ip = req.ip || req.socket?.remoteAddress || 'desconhecido'
  return String(ip)
}

export function criarLimitadores({ habilitado = true } = {}) {
  const passa = (_req, _res, next) => next()
  if (!habilitado) return { geral: passa, autenticacao: passa, sincronizacao: passa, assistente: passa }

  const fabricar = (windowMs, limit, mensagem) =>
    rateLimit({
      windowMs,
      limit,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      keyGenerator: chaveDoCliente,
      validate: { trustProxy: false, xForwardedForHeader: false },
      handler: (_req, res) =>
        res.status(429).json({ erro: { codigo: 'limite_excedido', mensagem } })
    })

  return {
    geral: fabricar(60_000, 300, 'Muitas requisições. Aguarde um instante.'),
    autenticacao: fabricar(10 * 60_000, 30, 'Muitas tentativas de login. Aguarde alguns minutos.'),
    sincronizacao: fabricar(60_000, 10, 'Sincronizações demais. Aguarde um minuto.'),
    assistente: fabricar(60_000, 30, 'Muitas mensagens ao assistente. Aguarde um minuto.')
  }
}
