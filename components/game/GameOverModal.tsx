'use client'

import { useLanguage } from '@/lib/i18n/LanguageContext'
import { ActionHighlight } from './ActionHighlight'

interface GameOverModalProps {
  won: boolean
  headline: string
  primaryActionLabel: string
  onPrimaryAction: () => void
  active?: boolean
}

export function GameOverModal({ won, headline, primaryActionLabel, onPrimaryAction, active = false }: GameOverModalProps) {
  const { t } = useLanguage()

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/65 px-3 py-6 backdrop-blur-sm sm:px-5 lg:px-8">
      <ActionHighlight active={active} className="w-full max-w-lg overflow-hidden rounded-[2rem] [border-style:double] border-4 border-[#d1ac56]">
        <section className="bg-[radial-gradient(circle_at_top,rgba(209,172,86,0.25),transparent_60%),linear-gradient(180deg,#233127,#141d16)] px-6 py-10 text-center text-[#f0e2ba] shadow-2xl sm:px-10 sm:py-12">
          <p className="text-xs font-bold uppercase tracking-[0.35em] text-military-gold">
            {t((messages) => messages.gameOverModal.eyebrow)}
          </p>

          <div className="mt-5 text-5xl" aria-hidden="true">
            🏅
          </div>

          <p className="mt-4 text-sm font-semibold uppercase tracking-[0.3em] text-military-gold">
            {won ? t((messages) => messages.gameOverModal.ribbonWin) : t((messages) => messages.gameOverModal.ribbonLoss)}
          </p>

          <h2 className="mt-4 text-2xl font-semibold sm:text-3xl">{headline}</h2>

          <div className="mt-8 flex justify-center">
            <button
              type="button"
              onClick={onPrimaryAction}
              className="min-h-11 rounded-full border border-[#d3b26d] bg-[#d1ac56] px-8 py-3 text-xs font-bold uppercase tracking-[0.24em] text-[#263225] transition hover:bg-[#dfbd6f]"
            >
              {primaryActionLabel}
            </button>
          </div>
        </section>
      </ActionHighlight>
    </div>
  )
}
