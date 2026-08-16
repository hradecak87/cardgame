'use client'

import { useLanguage } from '@/lib/i18n/LanguageContext'

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useLanguage()

  return (
    <div className="flex items-center gap-1 rounded-full border border-military-paper/20 bg-black/30 p-1 text-xs font-bold uppercase tracking-[0.18em] text-military-paper shadow-lg">
      <span className="px-2 text-military-paper/70">{t((messages) => messages.languageSwitcher.label)}</span>
      {(['en', 'cs'] as const).map((option) => {
        const label = option === 'en' ? t((messages) => messages.languageSwitcher.english) : t((messages) => messages.languageSwitcher.czech)

        return (
          <button
            key={option}
            type="button"
            onClick={() => setLanguage(option)}
            aria-pressed={language === option}
            className={[
              'min-h-9 rounded-full px-3 py-2 transition',
              language === option ? 'bg-[#d1ac56] text-[#263225]' : 'text-military-paper/85 hover:bg-black/25',
            ].join(' ')}
          >
            {option.toUpperCase()}
            <span className="sr-only">{label}</span>
          </button>
        )
      })}
    </div>
  )
}
