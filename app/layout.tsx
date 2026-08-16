import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { LanguageProvider } from '@/lib/i18n/LanguageContext'
import './globals.css'

export const metadata: Metadata = {
  title: 'Bitevní karty',
  description: 'Napoleonic-themed battle card game.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#17211a',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  )
}
