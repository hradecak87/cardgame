'use client'

import { useLanguage } from '@/lib/i18n/LanguageContext'

interface MainMenuProps {
  onSelectSinglePlayer: () => void
  onSelectMultiplayer: () => void
}

export function MainMenu({ onSelectSinglePlayer, onSelectMultiplayer }: MainMenuProps) {
  const { t } = useLanguage()

  return (
    <section className="max-w-full overflow-hidden rounded-[2rem] border border-[#9b7b3d] bg-[linear-gradient(180deg,rgba(36,49,39,0.98),rgba(20,30,23,0.98))] p-6 text-military-paper shadow-2xl">
      <p className="text-xs uppercase tracking-[0.35em] text-military-gold">Game mode / Režim hry</p>
      <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Choose how to play / Zvolte způsob hry</h1>

      <div className="mt-6 grid gap-4">
        <button
          type="button"
          onClick={onSelectSinglePlayer}
          className="rounded-[1.5rem] border border-military-paper/15 bg-black/15 p-5 text-left transition hover:bg-black/25"
        >
          <div className="text-lg font-semibold">{t((msg) => msg.multiplayer.mainMenu.singlePlayer)}</div>
        </button>
        <button
          type="button"
          onClick={onSelectMultiplayer}
          className="rounded-[1.5rem] border border-military-paper/15 bg-black/15 p-5 text-left transition hover:bg-black/25"
        >
          <div className="text-lg font-semibold">{t((msg) => msg.multiplayer.mainMenu.multiplayerOnline)}</div>
        </button>
      </div>
    </section>
  )
}
