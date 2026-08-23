/** Login-screen art from `public/pic/`. */
export const LOGIN_ILLUSTRATIONS = [
  '/pic/01.webp',
  '/pic/02.webp',
  '/pic/03.webp',
  '/pic/04.webp',
  '/pic/05.webp',
  '/pic/06.webp',
] as const

export function pickLoginIllustration(): (typeof LOGIN_ILLUSTRATIONS)[number] {
  return LOGIN_ILLUSTRATIONS[Math.floor(Math.random() * LOGIN_ILLUSTRATIONS.length)]
}
