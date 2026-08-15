'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Language, Translations } from './translations'
import { translations } from './translations'

export const LANGUAGE_STORAGE_KEY = 'battle-card-game-language'

interface LanguageContextValue {
  language: Language
  setLanguage: (language: Language) => void
  t: <T>(selector: (translations: Translations) => T) => T
}

const defaultLanguage: Language = 'en'

const LanguageContext = createContext<LanguageContextValue>({
  language: defaultLanguage,
  setLanguage: () => undefined,
  t: (selector) => selector(translations[defaultLanguage]),
})

function isLanguage(value: string | null): value is Language {
  return value === 'en' || value === 'cs'
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(defaultLanguage)

  useEffect(() => {
    const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)

    if (isLanguage(storedLanguage)) {
      setLanguage(storedLanguage)
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
    document.documentElement.lang = language
  }, [language])

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      t: (selector) => selector(translations[language]),
    }),
    [language],
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  return useContext(LanguageContext)
}
