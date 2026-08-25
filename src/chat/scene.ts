import type { GameState } from '@/game/types'
import type { Lang } from '@/i18n'

/**
 * What every prompt has to say before it says anything else: what this game is,
 * what its name means, and how the score stands.
 *
 * It lived twice — once in the prompt a single piece answers from, once in the
 * one a whole quarrel is written from — in two wordings that had already begun
 * to drift. One board, one description of it.
 */

/**
 * What the dark side calls a maeth: the word two gangs use for a meeting
 * arranged behind the garages, in whatever language the reply is written in.
 * Handed over ready-made because a model asked for "the crudest street word"
 * in a language it is only visiting tends to reach for something stilted.
 */
export const GANG_WORD: Record<Lang, string> = {
  ru: 'стрелка, замес, разборка',
  en: 'a rumble, a turf meet, a scrap behind the garages',
  fr: 'une baston, un règlement de comptes',
  de: 'eine Abreibung, eine Abrechnung hinterm Hof',
  pt: 'um acerto de contas, um rolo',
  es: 'un ajuste de cuentas, una bronca',
  it: 'un regolamento di conti, una rissa',
}

/**
 * And what the free peoples call it: a skirmish — the short, proper word for a
 * fight between a handful, which is what the Sindarin means in the first place.
 */
export const FAIR_WORD: Record<Lang, string> = {
  ru: 'короткая стычка, схватка',
  en: 'a skirmish, a brief passage of arms',
  fr: 'une escarmouche',
  de: 'ein Scharmützel',
  pt: 'uma escaramuça',
  es: 'una escaramuza',
  it: 'una scaramuccia',
}

export const LANG_NAME: Record<Lang, string> = {
  ru: 'Russian',
  en: 'English',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  es: 'Spanish',
  it: 'Italian',
}

/** The game itself, in one breath. */
export const WHAT_MAETH_IS =
  'This is "Maeth", a 4x4 game in the spirit of chess played out in Middle-earth. Sixteen pieces were drawn blindly out of one deck, four a side. Each piece moves only ONCE in the whole battle, and whoever captures more wins.'

/** The name, and who calls it what. */
export function whatMaethMeans(lang: Lang): string {
  return `WHAT MAETH MEANS: in the Grey-elven tongue maeth is a fight — not dagor, a great battle of hosts, but a short sharp scrap between a handful of warriors. That is exactly what this is. Say so if you are asked — but in YOUR OWN register, never in a scholar's: everything that came out of the dark — orcs, the wraith, the demon, the spider — calls it what two gangs call a meeting arranged behind the garages — in this language that is: ${GANG_WORD[lang]} — and never a polite word; the free peoples — elves, men, dwarves, hobbits, ents, the wizard — translate it properly, as a short skirmish: ${FAIR_WORD[lang]}. An elf that hears the gutter word used for it corrects the speaker coldly: that is a word for orcs. A hobbit still thinks of it as a dreadful business, and only the wizard would bother with the etymology.`
}

/** How the score stands, and the rule that keeps the model honest about it. */
export function capturesLine(state: GameState): string {
  return `Pieces captured so far — white took ${state.captures.white}, black took ${state.captures.black}. Never invent a piece or a square that is not in the lists above: everyone missing from them has fallen, and the log says to whom.`
}
