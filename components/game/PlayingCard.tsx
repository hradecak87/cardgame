'use client'

import { motion } from 'framer-motion'
import type { Card } from '@/lib/game/types'
import { useLanguage } from '@/lib/i18n/LanguageContext'

interface PlayingCardProps {
  card: Card
  faceDown?: boolean
  size?: 'sm' | 'md' | 'lg'
  selected?: boolean
  onClick?: () => void
}

export const CARD_SIZE_STYLES = {
  sm: {
    container: 'h-24 w-16 rounded-[1rem]',
    padding: 'p-1.5',
    corner: 'text-[0.6rem]',
    cornerTop: 'left-1.5 top-1.5',
    cornerBottom: 'bottom-1.5 right-1.5',
    power: 'text-[1.35rem]',
    powerPlate: 'min-h-[2.2rem] min-w-[2.3rem] px-2',
    label: 'text-[0.42rem] tracking-[0.28em]',
    centerSuit: 'text-base',
    watermark: 'text-4xl',
    backLabel: 'text-[0.42rem] tracking-[0.3em]',
    backMark: 'text-xl',
    backOrnaments: 'gap-0.5 text-[0.6rem]',
  },
  md: {
    container: 'h-32 w-20 rounded-[1.15rem]',
    padding: 'p-2',
    corner: 'text-[0.72rem]',
    cornerTop: 'left-2 top-2',
    cornerBottom: 'bottom-2 right-2',
    power: 'text-[1.85rem]',
    powerPlate: 'min-h-[2.8rem] min-w-[2.9rem] px-2.5',
    label: 'text-[0.52rem] tracking-[0.3em]',
    centerSuit: 'text-xl',
    watermark: 'text-5xl',
    backLabel: 'text-[0.55rem] tracking-[0.34em]',
    backMark: 'text-3xl',
    backOrnaments: 'gap-1 text-[0.7rem]',
  },
  lg: {
    container: 'h-36 w-24 rounded-[1.35rem] sm:h-40 sm:w-28',
    padding: 'p-2.5',
    corner: 'text-[0.82rem]',
    cornerTop: 'left-2.5 top-2.5',
    cornerBottom: 'bottom-2.5 right-2.5',
    power: 'text-[2.2rem] sm:text-[2.45rem]',
    powerPlate: 'min-h-[3.2rem] min-w-[3.25rem] px-3',
    label: 'text-[0.58rem] tracking-[0.34em]',
    centerSuit: 'text-2xl',
    watermark: 'text-6xl',
    backLabel: 'text-[0.62rem] tracking-[0.36em]',
    backMark: 'text-4xl',
    backOrnaments: 'gap-1.5 text-sm',
  },
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
  const { t } = useLanguage()
  const interactive = typeof onClick === 'function'
  const styles = CARD_SIZE_STYLES[size]
  const suitSymbol = suitSymbols[card.suit]
  const suitAccentClass = suitAccentClasses[card.suit]

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
            ? t((messages) => messages.cards.faceDownAriaLabel)
            : t((messages) => messages.cards.cardAriaLabel(card.rank, card.suit, card.power))
        }
        aria-pressed={interactive ? selected : undefined}
        data-card-size={size}
        className={[
          'relative overflow-hidden text-left shadow-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-military-gold focus-visible:ring-offset-2 focus-visible:ring-offset-[#162117]',
          styles.container,
          interactive ? 'cursor-pointer' : 'cursor-default',
          interactive ? 'duration-150 hover:-translate-y-0.5 hover:shadow-xl' : '',
          selected ? 'shadow-[0_0_0_2px_rgba(184,146,58,0.9),0_16px_32px_rgba(0,0,0,0.28)]' : '',
        ].join(' ')}
        style={{ transformStyle: 'preserve-3d' }}
      >
        <div className="absolute inset-0 [backface-visibility:hidden]">
          <div
            className={[
              'relative h-full border border-[#af8a44] bg-[linear-gradient(180deg,#f5ecd6_0%,#e8dcc1_55%,#dfcfad_100%)] text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.65),inset_0_-10px_20px_rgba(124,95,39,0.16)]',
              styles.container.split(' ').find((token) => token.startsWith('rounded-')) ?? 'rounded-[1rem]',
              styles.padding,
            ].join(' ')}
          >
            <div className="absolute inset-[5%] rounded-[inherit] border border-[#c7ae72]/60" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(148,111,42,0.08),_transparent_62%)]" />
            <div className="absolute inset-0 flex items-center justify-center opacity-10">
              <span className={`leading-none ${styles.watermark} ${suitAccentClass}`}>{suitSymbol}</span>
            </div>

            <div
              data-card-corner="top-left"
              className={`absolute flex flex-col items-center leading-none ${styles.cornerTop} ${styles.corner} ${suitAccentClass}`}
            >
              <span className="font-black">{card.rank}</span>
              <span className="mt-0.5 font-semibold">{suitSymbol}</span>
            </div>

            <div className="relative flex h-full flex-col items-center justify-center text-center">
              <span className={`font-semibold uppercase text-[#7b5e2a] ${styles.label}`}>{t((messages) => messages.cards.power)}</span>
              <div
                className={[
                  'mt-1 flex items-center justify-center rounded-full border border-[#b08a42] bg-[linear-gradient(180deg,#fdf6e4_0%,#e9d7ae_100%)] shadow-[0_8px_18px_rgba(80,59,23,0.14)]',
                  styles.powerPlate,
                ].join(' ')}
              >
                <span className={`font-black leading-none text-[#2d2314] ${styles.power}`}>
                  {card.power}
                </span>
              </div>
              <span className={`mt-1.5 font-semibold leading-none ${styles.centerSuit} ${suitAccentClass}`}>
                {suitSymbol}
              </span>
            </div>

            <div
              data-card-corner="bottom-right"
              className={`absolute flex rotate-180 flex-col items-center leading-none ${styles.cornerBottom} ${styles.corner} ${suitAccentClass}`}
            >
              <span className="font-black">{card.rank}</span>
              <span className="mt-0.5 font-semibold">{suitSymbol}</span>
            </div>
          </div>
        </div>

        <div
          className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]"
          aria-hidden={!faceDown}
        >
          <div
            className={[
              'relative flex h-full items-center justify-center overflow-hidden border border-[#c4a05a] bg-[linear-gradient(135deg,#13243b_0%,#24442d_48%,#102233_100%)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05),inset_0_-14px_24px_rgba(0,0,0,0.26)]',
              styles.container.split(' ').find((token) => token.startsWith('rounded-')) ?? 'rounded-[1rem]',
              styles.padding,
            ].join(' ')}
          >
            <div className="absolute inset-[7%] rounded-[inherit] border border-[#d9bb76]/60" />
            <div className="absolute inset-[16%] rounded-[0.85rem] border border-dashed border-[#d9bb76]/45" />
            <div className="relative flex h-full w-full flex-col items-center justify-center rounded-[inherit] bg-[radial-gradient(circle_at_center,_rgba(239,230,207,0.09),_transparent_62%)] text-[#ead6a4]">
              <span className={`uppercase text-[#f4e3bb] ${styles.backLabel}`}>{t((messages) => messages.cards.backLabelTop)}</span>
              <span className={`my-1.5 leading-none ${styles.backMark}`}>🦅</span>
              <span className={`uppercase text-[#d6b673] ${styles.backLabel}`}>{t((messages) => messages.cards.backLabelBottom)}</span>
              <div className={`mt-1.5 flex items-center text-[#c9a95e] ${styles.backOrnaments}`}>
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
