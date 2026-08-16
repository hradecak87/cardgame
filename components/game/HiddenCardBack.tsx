'use client'

import { useLanguage } from '@/lib/i18n/LanguageContext'
import { CARD_SIZE_STYLES } from './PlayingCard'

interface HiddenCardBackProps {
  size?: 'sm' | 'md' | 'lg'
}

/**
 * A static, non-interactive card back for placeholders whose real identity
 * is intentionally unknown to the viewer (e.g. an opponent's not-yet-
 * revealed defender pool in multiplayer/PvP). Unlike PlayingCard's
 * faceDown flip, this never renders the front face at all and involves no
 * 3D transform, so it can't suffer the "front face renders mirrored
 * instead of hidden" cross-browser 3D-transform bug that a `rotateY` flip
 * animation is prone to on some mobile browsers/WebViews.
 */
export function HiddenCardBack({ size = 'md' }: HiddenCardBackProps) {
  const { t } = useLanguage()
  const styles = CARD_SIZE_STYLES[size]

  return (
    <div
      role="img"
      aria-label={t((messages) => messages.cards.faceDownAriaLabel)}
      className={[
        'relative flex items-center justify-center overflow-hidden border border-[#c4a05a] bg-[linear-gradient(135deg,#13243b_0%,#24442d_48%,#102233_100%)] text-[#ead6a4] shadow-lg shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05),inset_0_-14px_24px_rgba(0,0,0,0.26)]',
        styles.container,
        styles.padding,
      ].join(' ')}
    >
      <div className="absolute inset-[7%] rounded-[inherit] border border-[#d9bb76]/60" />
      <div className="absolute inset-[16%] rounded-[0.85rem] border border-dashed border-[#d9bb76]/45" />
      <div className="relative flex h-full w-full flex-col items-center justify-center rounded-[inherit] bg-[radial-gradient(circle_at_center,_rgba(239,230,207,0.09),_transparent_62%)]">
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
  )
}
