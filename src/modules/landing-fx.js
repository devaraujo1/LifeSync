
const REDUZIDO = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const TEM_MOUSE_FINO = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(hover: hover) and (pointer: fine)').matches

function configurarVideo(raiz) {
  const video = raiz.querySelector('#lp-hero-video')
  const fallback = raiz.querySelector('.lp-hero-fallback')
  const stage = raiz.querySelector('.lp-hero-stage')
  if (!video || !fallback) return

  const mostrarFallback = () => {
    video.hidden = true
    fallback.hidden = false
    stage?.classList.add('is-fallback')
  }

  const mostrarVideo = () => {
    fallback.hidden = true
    video.hidden = false
    stage?.classList.remove('is-fallback')
  }

  video.addEventListener('error', mostrarFallback)
  video.addEventListener('loadeddata', () => {
    mostrarVideo()
    video.play?.().catch(() => {})
  })

  // Sem arquivo em /media/lifesync-hero.mp4 → fallback imediato
  const fonte = video.querySelector('source')
  if (!fonte?.getAttribute('src')) {
    mostrarFallback()
    return
  }

  mostrarFallback()
  video.load()
}

export function iniciarLandingFx(raiz = document) {
  const root = document.documentElement
  root.style.setProperty('--mx', '0')
  root.style.setProperty('--my', '0')
  root.style.setProperty('--scroll-p', '0')

  configurarVideo(raiz)

  if (REDUZIDO()) return

  const heroVisual = raiz.querySelector('.lp-hero-stage')
  let mx = 0
  let my = 0
  let tx = 0
  let ty = 0
  let scrollP = 0
  let alvoScroll = 0
  let frame = 0

  function tick() {
    frame = 0
    mx += (tx - mx) * 0.08
    my += (ty - my) * 0.08
    scrollP += (alvoScroll - scrollP) * 0.08
    root.style.setProperty('--mx', mx.toFixed(4))
    root.style.setProperty('--my', my.toFixed(4))
    root.style.setProperty('--scroll-p', scrollP.toFixed(4))
    if (
      Math.abs(tx - mx) > 0.001 ||
      Math.abs(ty - my) > 0.001 ||
      Math.abs(alvoScroll - scrollP) > 0.001
    ) {
      frame = requestAnimationFrame(tick)
    }
  }

  function pedirFrame() {
    if (!frame) frame = requestAnimationFrame(tick)
  }

  if (TEM_MOUSE_FINO()) {
    window.addEventListener(
      'pointermove',
      (e) => {
        const w = window.innerWidth || 1
        const h = window.innerHeight || 1
        tx = (e.clientX / w) * 2 - 1
        ty = (e.clientY / h) * 2 - 1
        pedirFrame()
      },
      { passive: true }
    )
  }

  function lerScroll() {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
    alvoScroll = Math.min(1, Math.max(0, window.scrollY / max))
    if (heroVisual) {
      const r = heroVisual.getBoundingClientRect()
      const local = 1 - Math.min(1, Math.max(0, r.bottom / (window.innerHeight + r.height)))
      heroVisual.style.setProperty('--hero-scroll', local.toFixed(4))
    }
    pedirFrame()
  }

  window.addEventListener('scroll', lerScroll, { passive: true })
  window.addEventListener('resize', lerScroll, { passive: true })
  lerScroll()
}
