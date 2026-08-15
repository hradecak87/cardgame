import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { LanguageProvider } from '@/lib/i18n/LanguageContext'
import './globals.css'

export const metadata: Metadata = {
  title: 'Battle Card Game',
  description: 'Battle Card Game',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  themeColor: '#233127',
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
