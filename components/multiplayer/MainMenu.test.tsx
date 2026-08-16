/**
 * @jest-environment jsdom
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LanguageProvider } from '@/lib/i18n/LanguageContext'
import { MainMenu } from './MainMenu'

function renderMainMenu(overrides?: Partial<React.ComponentProps<typeof MainMenu>>) {
  const onSelectSinglePlayer = jest.fn()
  const onSelectMultiplayer = jest.fn()
  const onSelectJoinRoom = jest.fn()

  render(
    <LanguageProvider>
      <MainMenu
        onSelectSinglePlayer={overrides?.onSelectSinglePlayer ?? onSelectSinglePlayer}
        onSelectMultiplayer={overrides?.onSelectMultiplayer ?? onSelectMultiplayer}
        onSelectJoinRoom={overrides?.onSelectJoinRoom ?? onSelectJoinRoom}
      />
    </LanguageProvider>,
  )

  return { onSelectSinglePlayer, onSelectMultiplayer, onSelectJoinRoom }
}

describe('MainMenu', () => {
  it('renders localized menu headings instead of bilingual hardcoded text', () => {
    renderMainMenu()

    expect(screen.getByText('Game mode')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Choose how to play' })).toBeInTheDocument()
    expect(screen.queryByText(/Game mode \/ Režim hry/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Choose how to play \/ Zvolte způsob hry/i)).not.toBeInTheDocument()
  })

  it('renders all three game mode buttons', () => {
    renderMainMenu()

    expect(screen.getByRole('button', { name: /play vs computer/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create a room online/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /join a room with a code/i })).toBeInTheDocument()
  })

  it('calls onSelectSinglePlayer when single player button is clicked', async () => {
    const user = userEvent.setup()
    const { onSelectSinglePlayer } = renderMainMenu()

    await user.click(screen.getByRole('button', { name: /play vs computer/i }))
    expect(onSelectSinglePlayer).toHaveBeenCalled()
  })

  it('calls onSelectMultiplayer when create-room button is clicked', async () => {
    const user = userEvent.setup()
    const { onSelectMultiplayer } = renderMainMenu()

    await user.click(screen.getByRole('button', { name: /create a room online/i }))
    expect(onSelectMultiplayer).toHaveBeenCalled()
  })

  it('calls onSelectJoinRoom when join-room button is clicked', async () => {
    const user = userEvent.setup()
    const { onSelectJoinRoom } = renderMainMenu()

    await user.click(screen.getByRole('button', { name: /join a room with a code/i }))
    expect(onSelectJoinRoom).toHaveBeenCalled()
  })
})
