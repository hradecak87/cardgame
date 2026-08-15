'use client'

import { motion } from 'framer-motion'
import type { RestingCard } from '@/lib/game/types'
import { PlayingCard } from './PlayingCard'

interface RestAreaStripProps {
  restingCards: RestingCard[]
  label: string
}

export function RestAreaStrip({ restingCards, label }: RestAreaStripProps) {
  return (
    <section className="rounded-3xl border border-[#927238]/50 bg-black/10 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-military-paper/90">
          {label}
        </h3>
        <span className="text-xs uppercase tracking-[0.18em] text-military-gold">
          {restingCards.length} resting
        </span>
      </div>

      {restingCards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-military-paper/20 px-4 py-5 text-sm text-military-paper/65">
          No cards are resting in this regiment.
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {restingCards.map((restingCard) => (
            <motion.div
              key={restingCard.card.id}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative shrink-0 pt-2"
            >
              <PlayingCard card={restingCard.card} size="sm" />
              <div className="absolute right-1 top-0 rounded-full border border-[#c9aa67] bg-[#f7ecd1] px-2 py-1 text-[10px] font-bold text-[#594418] shadow">
                {restingCard.roundsRemaining} round
                {restingCard.roundsRemaining === 1 ? '' : 's'}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </section>
  )
}
