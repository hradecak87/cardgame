'use client'

import { motion } from 'framer-motion'
import type { RestingCard } from '@/lib/game/types'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { PlayingCard } from './PlayingCard'

interface RestAreaStripProps {
  restingCards: RestingCard[]
  label: string
}

export function RestAreaStrip({ restingCards, label }: RestAreaStripProps) {
  const { t } = useLanguage()
  return (
    <section className="max-w-full overflow-hidden rounded-3xl border border-[#927238]/50 bg-black/10 p-3 sm:p-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-military-paper/90">
          {label}
        </h3>
        <span className="text-xs uppercase tracking-[0.18em] text-military-gold">
          {t((messages) => messages.restArea.restingCount(restingCards.length))}
        </span>
      </div>

      {restingCards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-military-paper/20 px-4 py-5 text-sm text-military-paper/65">
          {t((messages) => messages.restArea.empty)}
        </div>
      ) : (
        <div className="flex max-w-full flex-wrap gap-3">
          {restingCards.map((restingCard) => (
            <motion.div
              key={restingCard.card.id}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative pt-3"
            >
              <PlayingCard card={restingCard.card} size="sm" />
              <div className="absolute left-1/2 top-0 max-w-full -translate-x-1/2 rounded-full border border-[#c9aa67] bg-[#f7ecd1] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#594418] shadow">
                {t((messages) => messages.restArea.roundsRemaining(restingCard.roundsRemaining))}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </section>
  )
}
