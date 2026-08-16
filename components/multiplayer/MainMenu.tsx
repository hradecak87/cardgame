'use client'

import { useLanguage } from '@/lib/i18n/LanguageContext'
import { LanguageSwitcher } from '@/components/game/LanguageSwitcher'

interface MainMenuProps {
  onSelectSinglePlayer: () => void
  onSelectMultiplayer: () => void
  onSelectJoinRoom: () => void
}

export function MainMenu({ onSelectSinglePlayer, onSelectMultiplayer, onSelectJoinRoom }: MainMenuProps) {
  const { t } = useLanguage()

  return (
    <section className="max-w-full overflow-hidden rounded-[2rem] border border-[#9b7b3d] bg-[linear-gradient(180deg,rgba(36,49,39,0.98),rgba(20,30,23,0.98))] p-6 text-military-paper shadow-2xl">
      <div className="flex justify-end">
        <LanguageSwitcher />
      </div>

      <p className="mt-4 text-xs uppercase tracking-[0.35em] text-military-gold">{t((msg) => msg.multiplayer.mainMenu.eyebrow)}</p>
      <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{t((msg) => msg.multiplayer.mainMenu.title)}</h1>

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
        <button
          type="button"
          onClick={onSelectJoinRoom}
          className="rounded-[1.5rem] border border-military-paper/15 bg-black/15 p-5 text-left transition hover:bg-black/25"
        >
          <div className="text-lg font-semibold">{t((msg) => msg.multiplayer.mainMenu.multiplayerJoin)}</div>
        </button>
      </div>
    </section>
  )
}
