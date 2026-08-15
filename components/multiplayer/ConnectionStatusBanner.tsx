'use client'

interface ConnectionStatusBannerProps {
  isPeerConnected: boolean
  message: string
}

export function ConnectionStatusBanner({ isPeerConnected, message }: ConnectionStatusBannerProps) {
  if (isPeerConnected) {
    return null
  }

  return (
    <div className="rounded-full border border-military-gold/40 bg-black/40 px-4 py-2 text-xs uppercase tracking-[0.2em] text-military-gold">
      {message}
    </div>
  )
}
