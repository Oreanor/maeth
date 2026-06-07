/** Login-screen art from `public/pic/`. */
export const LOGIN_ILLUSTRATIONS = [
  '/pic/01.png',
  '/pic/02.png',
  '/pic/03.png',
  '/pic/04.png',
  '/pic/05.png',
  '/pic/06.png',
] as const

export function pickLoginIllustration(): (typeof LOGIN_ILLUSTRATIONS)[number] {
  return LOGIN_ILLUSTRATIONS[Math.floor(Math.random() * LOGIN_ILLUSTRATIONS.length)]
}
