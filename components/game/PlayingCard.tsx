'use client'

import { motion } from 'framer-motion'
import type { Card } from '@/lib/game/types'

interface PlayingCardProps {
  card: Card
  faceDown?: boolean
  size?: 'sm' | 'md' | 'lg'
  selected?: boolean
  onClick?: () => void
}

const sizeClasses = {
  sm: 'h-24 w-16',
  md: 'h-32 w-24',
  lg: 'h-40 w-28',
} as const

const rankClasses = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
} as const

const powerClasses = {
  sm: 'text-2xl',
  md: 'text-3xl',
  lg: 'text-4xl',
} as const

const suitSymbols: Record<Card['suit'], string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
}

const suitAccentClasses: Record<Card['suit'], string> = {
  hearts: 'text-red-700',
  diamonds: 'text-amber-700',
  clubs: 'text-slate-800',
  spades: 'text-slate-900',
}

export function PlayingCard({
  card,
  faceDown = false,
  size = 'md',
  selected = false,
  onClick,
}: PlayingCardProps) {
  const interactive = typeof onClick === 'function'

  return (
    <div className="[perspective:1200px]">
      <motion.button
        type="button"
        initial={false}
        animate={{
          rotateY: faceDown ? 180 : 0,
          y: selected ? -6 : 0,
          scale: selected ? 1.03 : 1,
        }}
        transition={{ duration: 0.45, ease: 'easeInOut' }}
        onClick={onClick}
        disabled={!interactive}
        aria-label={
          faceDown
            ? 'Face-down playing card'
            : `${card.rank} of ${card.suit}, power ${card.power}`
        }
        aria-pressed={interactive ? selected : undefined}
        className={[
          'relative rounded-2xl text-left shadow-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-military-gold focus-visible:ring-offset-2 focus-visible:ring-offset-[#162117]',
          sizeClasses[size],
          interactive ? 'cursor-pointer' : 'cursor-default',
          selected ? 'shadow-[0_0_0_2px_rgba(184,146,58,0.9),0_16px_32px_rgba(0,0,0,0.28)]' : '',
        ].join(' ')}
        style={{ transformStyle: 'preserve-3d' }}
      >
        <div className="absolute inset-0 [backface-visibility:hidden]">
          <div className="flex h-full flex-col rounded-2xl border border-[#b08a41] bg-[#efe6cf] p-2 text-slate-900 shadow-inner">
            <div className={`flex items-start justify-between ${rankClasses[size]}`}>
              <div className={`font-bold leading-none ${suitAccentClasses[card.suit]}`}>
                <div>{card.rank}</div>
                <div>{suitSymbols[card.suit]}</div>
              </div>
              <div className="rounded-full border border-[#c6ab6a] bg-[#f7f0de] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6e5525]">
                Power
              </div>
            </div>

            <div className="flex flex-1 flex-col items-center justify-center gap-1">
              <span className="text-xs uppercase tracking-[0.35em] text-[#6e5525]">
                Regiment
              </span>
              <span className={`font-black text-[#2d2414] ${powerClasses[size]}`}>
                {card.power}
              </span>
              <span className="text-lg text-[#8f6f33]">⚔️</span>
            </div>

            <div className={`flex items-end justify-between ${rankClasses[size]}`}>
              <div className="text-xs uppercase tracking-[0.2em] text-[#6e5525]">
                Strength
              </div>
              <div
                className={`rotate-180 font-bold leading-none ${suitAccentClasses[card.suit]}`}
              >
                <div>{card.rank}</div>
                <div>{suitSymbols[card.suit]}</div>
              </div>
            </div>
          </div>
        </div>

        <div
          className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]"
          aria-hidden={!faceDown}
        >
          <div className="relative flex h-full items-center justify-center overflow-hidden rounded-2xl border border-[#c4a05a] bg-gradient-to-br from-[#16263f] via-[#27462e] to-[#0f1c2f] p-2 shadow-inner">
            <div className="absolute inset-2 rounded-xl border border-[#d9bb76]/60" />
            <div className="absolute inset-4 rounded-lg border border-dashed border-[#d9bb76]/50" />
            <div className="relative flex h-full w-full flex-col items-center justify-center rounded-xl bg-[radial-gradient(circle_at_center,_rgba(239,230,207,0.08),_transparent_62%)] text-[#ead6a4]">
              <span className="text-[10px] uppercase tracking-[0.45em] text-[#f4e3bb]">
                Imperial
              </span>
              <span className="my-2 text-3xl">🦅</span>
              <span className="text-xs uppercase tracking-[0.35em] text-[#d6b673]">
                Guard
              </span>
              <div className="mt-2 flex items-center gap-1 text-sm text-[#c9a95e]">
                <span>⚜</span>
                <span>⚔</span>
                <span>⚜</span>
              </div>
            </div>
          </div>
        </div>
      </motion.button>
    </div>
  )
}
