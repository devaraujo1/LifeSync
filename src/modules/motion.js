/**
 * Motion LifeSync: entrada do hero + reveal no scroll.
 * Respeita prefers-reduced-motion.
 */

const REDUZIDO = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

function marcarPronto(el) {
  el.classList.add('is-in')
}

function staggerEnter(raiz = document) {
  const itens = [...raiz.querySelectorAll('[data-enter]')]
  if (!itens.length) return

  if (REDUZIDO()) {
    itens.forEach(marcarPronto)
    return
  }

  // Duplo rAF garante que o estado inicial (opacity 0) pinta antes do is-in.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      itens.forEach((el, i) => {
        const custom = el.style.getPropertyValue('--enter-delay')
        if (!custom) el.style.setProperty('--enter-delay', `${100 + i * 110}ms`)
        marcarPronto(el)
      })
    })
  })
}

function observarReveals(raiz = document) {
  const itens = [...raiz.querySelectorAll('[data-reveal]')]
  if (!itens.length) return

  if (REDUZIDO() || typeof IntersectionObserver === 'undefined') {
    itens.forEach(marcarPronto)
    return
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const el = entry.target
        const delay = el.getAttribute('data-reveal-delay')
        if (delay) el.style.setProperty('--enter-delay', `${delay}ms`)
        marcarPronto(el)
        io.unobserve(el)
      }
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.1 }
  )

  itens.forEach((el, i) => {
    if (!el.getAttribute('data-reveal-delay')) {
      el.setAttribute('data-reveal-delay', String((i % 5) * 80))
    }
    io.observe(el)
  })
}

export function iniciarMotion(raiz = document) {
  staggerEnter(raiz)
  observarReveals(raiz)
}
