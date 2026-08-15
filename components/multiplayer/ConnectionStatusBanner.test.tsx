/**
 * @jest-environment jsdom
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { LanguageProvider } from '@/lib/i18n/LanguageContext'
import { ConnectionStatusBanner } from './ConnectionStatusBanner'

describe('ConnectionStatusBanner', () => {
  it('renders nothing when peer is connected', () => {
    const { container } = render(
      <ConnectionStatusBanner isPeerConnected={true} message="Test message" />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders message when peer is disconnected', () => {
    render(<ConnectionStatusBanner isPeerConnected={false} message="Opponent disconnected" />)
    expect(screen.getByText('Opponent disconnected')).toBeInTheDocument()
  })
})
