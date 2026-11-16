import '../styles/main.css'
import '../styles/landing.css'
import { iniciarMotion } from '../modules/motion.js'
import { iniciarLandingFx } from '../modules/landing-fx.js'

document.documentElement.dataset.accent = 'ciano'
document.documentElement.dataset.aurora = 'animada'
iniciarMotion(document)
iniciarLandingFx(document)
