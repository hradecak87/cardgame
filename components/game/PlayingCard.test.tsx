import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

jest.mock('framer-motion', () => {
  const React = require('react') as typeof import('react')

  return {
    motion: {
      button: React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
        function MotionButton(props, ref) {
          const { animate: _animate, initial: _initial, transition: _transition, ...domProps } =
            props as React.ButtonHTMLAttributes<HTMLButtonElement> & {
              animate?: unknown
              initial?: unknown
              transition?: unknown
            }

          return React.createElement('button', { ...domProps, ref }, props.children)
        },
      ),
    },
  }
})

import { CARD_SIZE_STYLES, PlayingCard } from './PlayingCard'
import type { Card } from '@/lib/game/types'

function createCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'ace-spades',
    rank: 'A',
    suit: 'spades',
    power: 8,
    ...overrides,
  }
}

describe('PlayingCard', () => {
  test('keeps typography scaled down for every supported size', () => {
    expect(CARD_SIZE_STYLES.sm.corner).toContain('text-[0.6rem]')
    expect(CARD_SIZE_STYLES.sm.power).toContain('text-[1.35rem]')
    expect(CARD_SIZE_STYLES.md.corner).toContain('text-[0.72rem]')
    expect(CARD_SIZE_STYLES.md.power).toContain('text-[1.85rem]')
    expect(CARD_SIZE_STYLES.lg.corner).toContain('text-[0.82rem]')
    expect(CARD_SIZE_STYLES.lg.power).toContain('text-[2.2rem]')
  })

  test('renders mirrored corner indices with a compact power-focused layout', () => {
    const html = renderToStaticMarkup(
      React.createElement(PlayingCard, {
        card: createCard(),
        size: 'sm',
      }),
    )

    expect((html.match(/data-card-corner=/g) ?? []).length).toBe(2)
    expect(html).toContain('Power')
    expect(html).not.toContain('Regiment')
    expect(html).not.toContain('Strength')
  })
})
