'use client'

import { useState } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageContext'

interface CreateRoomScreenProps {
  onCreateRoom: (nickname: string) => Promise<void>
  roomCode: string | null
  roomStatus: string | null
}

export function CreateRoomScreen({ onCreateRoom, roomCode, roomStatus }: CreateRoomScreenProps) {
  const { t } = useLanguage()
  const [nickname, setNickname] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCreate = async () => {
    if (!nickname.trim()) {
      return
    }
    setLoading(true)
    try {
      await onCreateRoom(nickname)
    } catch (error) {
      console.error('Error creating room:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCopyCode = () => {
    if (roomCode) {
      navigator.clipboard.writeText(roomCode).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    }
  }

  if (roomCode && roomStatus === 'waiting') {
    return (
      <section className="max-w-full overflow-hidden rounded-[2rem] border border-[#9b7b3d] bg-[linear-gradient(180deg,rgba(36,49,39,0.98),rgba(20,30,23,0.98))] p-6 text-military-paper shadow-2xl">
        <p className="text-xs uppercase tracking-[0.35em] text-military-gold">{t((msg) => msg.multiplayer.createRoom.heading)}</p>
        <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{t((msg) => msg.multiplayer.createRoom.roomCode)}</h1>

        <div className="mt-6 flex items-center gap-4">
          <div className="flex-1 rounded-lg border border-military-paper/20 bg-black/25 p-4 text-center font-mono text-2xl font-bold tracking-widest">
            {roomCode}
          </div>
          <button
            type="button"
            onClick={handleCopyCode}
            className="min-h-11 rounded-full border border-military-paper/20 bg-black/25 px-5 py-3 text-xs font-bold uppercase tracking-[0.24em] text-military-paper transition hover:bg-black/35"
          >
            {copied ? t((msg) => msg.multiplayer.createRoom.copiedToClipboard) : t((msg) => msg.multiplayer.createRoom.copyCode)}
          </button>
        </div>

        <p className="mt-6 text-center text-sm text-military-paper/78">{t((msg) => msg.multiplayer.createRoom.waitingMessage)}</p>
      </section>
    )
  }

  return (
    <section className="max-w-full overflow-hidden rounded-[2rem] border border-[#9b7b3d] bg-[linear-gradient(180deg,rgba(36,49,39,0.98),rgba(20,30,23,0.98))] p-6 text-military-paper shadow-2xl">
      <p className="text-xs uppercase tracking-[0.35em] text-military-gold">{t((msg) => msg.multiplayer.createRoom.heading)}</p>
      <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{t((msg) => msg.multiplayer.createRoom.heading)}</h1>

      <div className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-semibold text-military-paper">{t((msg) => msg.multiplayer.createRoom.nicknameLabel)}</label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder={t((msg) => msg.multiplayer.createRoom.nicknameInputPlaceholder)}
            className="mt-2 w-full rounded-lg border border-military-paper/20 bg-black/25 px-4 py-2 text-military-paper placeholder-military-paper/40 focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-4">
        <button
          type="button"
          onClick={handleCreate}
          disabled={loading || !nickname.trim()}
          className="min-h-11 rounded-full border border-[#9b7b3d] bg-[#9b7b3d]/20 px-5 py-3 text-xs font-bold uppercase tracking-[0.24em] text-military-gold transition hover:bg-[#9b7b3d]/30 disabled:opacity-50"
        >
          {loading ? 'Creating...' : t((msg) => msg.multiplayer.createRoom.createButton)}
        </button>
      </div>
    </section>
  )
}
