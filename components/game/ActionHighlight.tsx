'use client'

import type { ReactNode } from 'react'

interface ActionHighlightProps {
  active?: boolean
  className?: string
  children: ReactNode
}

export function ActionHighlight({
  active = false,
  className = '',
  children,
}: ActionHighlightProps) {
  return (
    <div
      className={[
        className,
        'transition-[box-shadow,border-color,background-color] duration-200',
        active
          ? 'border-emerald-400/80 bg-emerald-400/5 ring-2 ring-emerald-400/80 ring-offset-2 ring-offset-[#162117] shadow-[0_0_0_1px_rgba(74,222,128,0.35),0_0_28px_rgba(16,185,129,0.18)]'
          : '',
      ].join(' ')}
    >
      {children}
    </div>
  )
}
