/**
 * @jest-environment jsdom
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { ConnectionStatusBanner } from './ConnectionStatusBanner'

describe('ConnectionStatusBanner', () => {
  it('renders nothing when hidden', () => {
    const { container } = render(
      <ConnectionStatusBanner isVisible={false} message="Test message" />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders message when visible', () => {
    render(<ConnectionStatusBanner message="Opponent disconnected" />)
    expect(screen.getByText('Opponent disconnected')).toBeInTheDocument()
  })
})
