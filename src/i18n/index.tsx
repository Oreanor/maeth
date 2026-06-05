import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import ru from './locales/ru.json'
import en from './locales/en.json'
import fr from './locales/fr.json'
import de from './locales/de.json'
import pt from './locales/pt.json'
import es from './locales/es.json'
import it from './locales/it.json'

export type Lang = 'ru' | 'en' | 'fr' | 'de' | 'pt' | 'es' | 'it'

export const LANGS: Lang[] = ['ru', 'en', 'fr', 'de', 'pt', 'es', 'it']

// All dictionaries share ru's shape; ru is the source of truth / fallback.
type Dict = typeof ru
const DICTS: Record<Lang, Dict> = { ru, en, fr, de, pt, es, it } as Record<Lang, Dict>

const STORAGE_KEY = 'maeth.lang'

function detectLang(): Lang {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored && (LANGS as string[]).includes(stored)) return stored as Lang
  const nav = navigator.language.slice(0, 2).toLowerCase()
  return (LANGS as string[]).includes(nav) ? (nav as Lang) : 'ru'
}

/** Resolve a dotted key like "lobby.create" against a dictionary. */
function resolve(dict: Dict, key: string): string | undefined {
  let node: unknown = dict
  for (const part of key.split('.')) {
    if (node && typeof node === 'object' && part in node) {
      node = (node as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }
  return typeof node === 'string' ? node : undefined
}

export type TFunction = (key: string, params?: Record<string, string | number>) => string

interface I18nContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
  t: TFunction
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang)

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    localStorage.setItem(STORAGE_KEY, next)
  }, [])

  const t = useCallback<TFunction>(
    (key, params) => {
      const raw = resolve(DICTS[lang], key) ?? resolve(DICTS.ru, key) ?? key
      if (!params) return raw
      return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
        name in params ? String(params[name]) : `{${name}}`,
      )
    },
    [lang],
  )

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
