/**
 * @jest-environment jsdom
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LanguageProvider } from '@/lib/i18n/LanguageContext'
import { MainMenu } from './MainMenu'

describe('MainMenu', () => {
  it('renders both game mode buttons', () => {
    const onSelectSinglePlayer = jest.fn()
    const onSelectMultiplayer = jest.fn()

    render(
      <LanguageProvider>
        <MainMenu onSelectSinglePlayer={onSelectSinglePlayer} onSelectMultiplayer={onSelectMultiplayer} />
      </LanguageProvider>,
    )

    expect(screen.getByRole('button', { name: /play vs computer/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /play online/i })).toBeInTheDocument()
  })

  it('calls onSelectSinglePlayer when single player button is clicked', async () => {
    const onSelectSinglePlayer = jest.fn()
    const onSelectMultiplayer = jest.fn()
    const user = userEvent.setup()

    render(
      <LanguageProvider>
        <MainMenu onSelectSinglePlayer={onSelectSinglePlayer} onSelectMultiplayer={onSelectMultiplayer} />
      </LanguageProvider>,
    )

    await user.click(screen.getByRole('button', { name: /play vs computer/i }))
    expect(onSelectSinglePlayer).toHaveBeenCalled()
  })

  it('calls onSelectMultiplayer when multiplayer button is clicked', async () => {
    const onSelectSinglePlayer = jest.fn()
    const onSelectMultiplayer = jest.fn()
    const user = userEvent.setup()

    render(
      <LanguageProvider>
        <MainMenu onSelectSinglePlayer={onSelectSinglePlayer} onSelectMultiplayer={onSelectMultiplayer} />
      </LanguageProvider>,
    )

    await user.click(screen.getByRole('button', { name: /play online/i }))
    expect(onSelectMultiplayer).toHaveBeenCalled()
  })
})
