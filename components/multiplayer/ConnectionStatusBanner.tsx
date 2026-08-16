'use client'

interface ConnectionStatusBannerProps {
  isVisible?: boolean
  message: string
  tone?: 'warning' | 'critical'
}

export function ConnectionStatusBanner({
  isVisible = true,
  message,
  tone = 'warning',
}: ConnectionStatusBannerProps) {
  if (!isVisible) {
    return null
  }

  const classes =
    tone === 'critical'
      ? 'border-red-400/50 bg-red-950/65 text-red-100'
      : 'border-military-gold/40 bg-black/40 text-military-gold'

  return (
    <div className={`rounded-full border px-4 py-2 text-xs uppercase tracking-[0.2em] ${classes}`}>
      {message}
    </div>
  )
}
