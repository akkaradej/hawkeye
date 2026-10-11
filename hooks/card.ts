import { CARD_ACCENT, CARD_DOT } from './look'

// The moving art behind the band while Reborn works: phoenixes. Small hawks fly across from left to right, wings
// beating, each with a short fiery tail, over a warm glow that breathes along the bottom. All the motion is CSS
// inside the SVG, so nothing redraws. The numbers are fixed, not random, so every draw is the same picture. The
// art is laid from the card's left edge; the card clips what is wider than it.
// A flock: many small hawks, spread over the band's height. The numbers come from a fixed seed, not Math.random, so
// every draw is the same picture. [y, size, crossing seconds, delay seconds, flap seconds]
const BIRDS: [number, number, number, number, number][] = (() => {
  let seed = 7
  const next = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
  return Array.from({ length: 28 }, () => {
    const dur = 3.6 + next() * 3
    return [38 + next() * 52, 0.26 + next() * 0.22, dur, -next() * dur, 0.35 + next() * 0.2] as [number, number, number, number, number]
  })
})()
// A hawk seen from above, hard-edged like a logo, flying right: tail with three notches, a head with a hooked
// beak, and wings swept back as separate blades. Drawn in a 1366-wide space, wings above the body line (y 931) and
// mirrored below. The wings are their own group, so the beat squeezes only them.
const WING = ['668,805 668,492 822,365 762,620', '858,338 1085,160 880,630 836,836 700,805 790,640', '1140,125 1092,172 895,622']
const wings = (fill: string) => `<g class="w">${WING.map(pts => `<polygon points="${pts}" fill="${fill}"/>`).join('')}<g transform="translate(0 1862) scale(1 -1)">${WING.map(pts => `<polygon points="${pts}" fill="${fill}"/>`).join('')}</g></g>`
const BODY = ['437,931 412,858 335,862 335,775 567,855 665,805 836,836 757,932 836,1026 665,1057 567,1007 335,1087 335,1000 412,1004', '757,932 800,885 930,868 1040,880 1130,912 1225,952 1150,968 1040,990 900,1000 820,992']

const W = 1600
const H = 128
const UNIT = 0.032

// `nowMs` is the clock at the time of the draw. Each bird starts part-way through its crossing, at the place the clock
// puts it, so when the host redraws the band (and the animation starts over) the flock carries on from where it was
// instead of jumping back to the left edge.
export function handoffArt(nowMs = 0): string {
  const phase = (dur: number, delay: number) => (-((nowMs / 1000 - delay) % dur)).toFixed(2)
  const birds = BIRDS.map(([y, k, dur, delay, flap]) => {
    const bird = `<g transform="scale(${(UNIT * k).toFixed(4)}) translate(-700 -931)"><rect x="-1000" y="905" width="1340" height="52" fill="url(#tail)"/>${BODY.map(pts => `<polygon points="${pts}" fill="${CARD_DOT}"/>`).join('')}${wings(CARD_DOT)}</g>`
    return `<g transform="translate(0 ${y})"><g class="f" style="animation-duration:${dur}s;animation-delay:${phase(dur, delay)}s;--flap:${flap}s">${bird}</g></g>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMid slice"><style>:root{color-scheme:light dark}html,body{margin:0}svg{background:transparent;display:block}.f{opacity:0;animation-name:fly;animation-timing-function:linear;animation-iteration-count:infinite}@keyframes fly{0%{opacity:0;transform:translate(-80px,6px)}8%{opacity:.95}50%{transform:translate(800px,-6px)}92%{opacity:.85}100%{opacity:0;transform:translate(1700px,6px)}}.w{transform-box:fill-box;transform-origin:50% 50%;animation:flap var(--flap) ease-in-out infinite}@keyframes flap{0%,100%{transform:scaleY(1)}50%{transform:scaleY(.3)}}.g{animation:g 2.2s ease-in-out infinite}@keyframes g{0%,100%{opacity:.7}50%{opacity:1}}</style><defs><linearGradient id="glow" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${CARD_ACCENT}" stop-opacity=".45"/><stop offset=".5" stop-color="${CARD_ACCENT}" stop-opacity=".12"/><stop offset="1" stop-color="${CARD_ACCENT}" stop-opacity="0"/></linearGradient><linearGradient id="tail" x1="0" x2="1"><stop offset="0" stop-color="${CARD_ACCENT}" stop-opacity="0"/><stop offset="1" stop-color="${CARD_ACCENT}" stop-opacity=".85"/></linearGradient></defs><rect class="g" width="${W}" height="${H}" fill="url(#glow)"/>${birds}</svg>`
}

// The same hawk as a still icon for the Reborn button.
export function hawkSvg(color: string, size = 16): string {
  const mirror = `<g transform="translate(0 1862) scale(1 -1)">${WING.map(pts => `<polygon points="${pts}"/>`).join('')}</g>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-120 31 1800 1800"><g fill="${color}">${BODY.map(pts => `<polygon points="${pts}"/>`).join('')}${WING.map(pts => `<polygon points="${pts}"/>`).join('')}${mirror}</g></svg>`
}
