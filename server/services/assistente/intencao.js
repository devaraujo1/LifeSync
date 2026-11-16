import { TOOLS_ESCRITA as TOOLS_ESCRITA_BASE } from './previa.js'

const TOOLS_ESCRITA = new Set([...TOOLS_ESCRITA_BASE, 'pedir_confirmacao_exclusao'])

const RE_NAO_REGISTRAR =
  /\b(n[aã]o\s+(quero\s+)?(regist|anot|lan[cç]|grav)|n[aã]o\s+regist|s[oó]\s+conta|s[oó]\s+calcul|faz(er)?\s+a\s+conta|apenas\s+conta|sem\s+regist|deixa\s+pra\s+l[aá]|cancela)\b/i

const RE_PERGUNTA_TOTAL =
  /\b(d[ea]?\s*quanto|quanto\s+(foi|fica|ficou|gastei|gaste|deu|est[aá]|sobra|resta)|qual\s+(o\s+)?(total|saldo|valor)|e\s+o\s+saldo|me\s+fala\s+o\s+total)\b|\?\s*$/i

/** Confirmação verbal não libera escrita — o fluxo correto é o card /confirmar. */
const RE_CONFIRMA_VERBAL =
  /^(sim|pode|ok|okay|isso|confirmo|registra|anota|lan[cç]a|pode\s+registrar|pode\s+anotar|manda\s+ver)[\s!.]*$/i

export function classificarIntencaoEscrita(mensagem) {
  const t = String(mensagem ?? '').trim()
  if (!t) return 'bloquear_escrita'
  if (RE_CONFIRMA_VERBAL.test(t)) return 'bloquear_escrita'
  if (RE_NAO_REGISTRAR.test(t)) return 'bloquear_escrita'
  if (RE_PERGUNTA_TOTAL.test(t)) return 'bloquear_escrita'
  if (t.includes('?')) return 'bloquear_escrita'
  return 'liberar'
}

export function filtrarToolsPorIntencao(tools, mensagem) {
  const modo = classificarIntencaoEscrita(mensagem)
  if (modo === 'liberar') return tools
  return (tools ?? []).filter((t) => !TOOLS_ESCRITA.has(t.name))
}

export { TOOLS_ESCRITA }
