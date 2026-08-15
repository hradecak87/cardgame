'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import type { Card } from '@/lib/game/types'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { PlayingCard } from './PlayingCard'

interface PlayerHandSelectorProps {
  availableCards: Card[]
  requiredCount: number
  onConfirm: (selectedCardIds: string[]) => void
}

export function PlayerHandSelector({
  availableCards,
  requiredCount,
  onConfirm,
}: PlayerHandSelectorProps) {
  const { t } = useLanguage()
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([])

  const availableCardIds = useMemo(
    () => new Set(availableCards.map((card) => card.id)),
    [availableCards],
  )

  useEffect(() => {
    setSelectedCardIds((current) =>
      current.filter((cardId) => availableCardIds.has(cardId)).slice(0, requiredCount),
    )
  }, [availableCardIds, requiredCount])

  const toggleCard = (cardId: string) => {
    setSelectedCardIds((current) => {
      if (current.includes(cardId)) {
        return current.filter((id) => id !== cardId)
      }

      if (current.length >= requiredCount) {
        return current
      }

      return [...current, cardId]
    })
  }

  const canConfirm = selectedCardIds.length === requiredCount && requiredCount > 0

  return (
    <section className="rounded-[2rem] border border-[#9b7b3d] bg-[linear-gradient(180deg,rgba(239,230,207,0.08),rgba(0,0,0,0.12))] p-4 sm:p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-military-gold">
            {t((messages) => messages.selector.title)}
          </p>
          <h2 className="text-xl font-semibold text-military-paper sm:text-2xl">
            {t((messages) => messages.selector.heading)}
          </h2>
        </div>
        <div className="w-fit rounded-full border border-military-gold/60 px-3 py-2 text-xs font-bold uppercase tracking-[0.22em] text-military-gold">
          {t((messages) => messages.selector.selected(selectedCardIds.length, requiredCount))}
        </div>
      </div>

      <p className="mb-4 max-w-2xl text-sm leading-6 text-military-paper/78">
        {t((messages) => messages.selector.instruction(requiredCount))}
      </p>

      <div className="flex flex-wrap justify-center gap-3 sm:justify-start">
        {availableCards.map((card) => (
          <motion.div key={card.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <PlayingCard
              card={card}
              size="md"
              selected={selectedCardIds.includes(card.id)}
              onClick={() => toggleCard(card.id)}
            />
          </motion.div>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-sm leading-6 text-military-paper/68">
          {t((messages) => messages.selector.committedNotice)}
        </p>
        <button
          type="button"
          onClick={() => onConfirm(selectedCardIds)}
          disabled={!canConfirm}
          className="min-h-11 rounded-full border border-[#d3b26d] bg-[#d1ac56] px-5 py-3 text-sm font-bold uppercase tracking-[0.2em] text-[#263225] transition hover:bg-[#dfbd6f] disabled:cursor-not-allowed disabled:border-military-paper/20 disabled:bg-military-paper/15 disabled:text-military-paper/45"
        >
          {t((messages) => messages.selector.confirmDefenders)}
        </button>
      </div>
    </section>
  )
}
