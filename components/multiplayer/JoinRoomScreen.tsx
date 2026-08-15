'use client'

import { useState } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageContext'

interface JoinRoomScreenProps {
  onJoinRoom: (code: string, nickname: string) => Promise<{ ok: boolean; reason?: string }>
}

export function JoinRoomScreen({ onJoinRoom }: JoinRoomScreenProps) {
  const { t } = useLanguage()
  const [nickname, setNickname] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleJoin = async () => {
    if (!nickname.trim() || !code.trim()) {
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await onJoinRoom(code, nickname)
      if (!result.ok) {
        setError(result.reason || 'Failed to join room')
      }
    } catch (err) {
      setError('An error occurred')
      console.error('Error joining room:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="max-w-full overflow-hidden rounded-[2rem] border border-[#9b7b3d] bg-[linear-gradient(180deg,rgba(36,49,39,0.98),rgba(20,30,23,0.98))] p-6 text-military-paper shadow-2xl">
      <p className="text-xs uppercase tracking-[0.35em] text-military-gold">{t((msg) => msg.multiplayer.joinRoom.heading)}</p>
      <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{t((msg) => msg.multiplayer.joinRoom.heading)}</h1>

      <div className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-semibold text-military-paper">{t((msg) => msg.multiplayer.joinRoom.nicknameLabel)}</label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder={t((msg) => msg.multiplayer.joinRoom.nicknameInputPlaceholder)}
            className="mt-2 w-full rounded-lg border border-military-paper/20 bg-black/25 px-4 py-2 text-military-paper placeholder-military-paper/40 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-military-paper">{t((msg) => msg.multiplayer.joinRoom.codeLabel)}</label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={t((msg) => msg.multiplayer.joinRoom.codeInputPlaceholder)}
            maxLength={5}
            className="mt-2 w-full rounded-lg border border-military-paper/20 bg-black/25 px-4 py-2 font-mono text-center text-lg tracking-widest text-military-paper placeholder-military-paper/40 focus:outline-none"
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      <div className="mt-6 flex justify-end gap-4">
        <button
          type="button"
          onClick={handleJoin}
          disabled={loading || !nickname.trim() || !code.trim()}
          className="min-h-11 rounded-full border border-[#9b7b3d] bg-[#9b7b3d]/20 px-5 py-3 text-xs font-bold uppercase tracking-[0.24em] text-military-gold transition hover:bg-[#9b7b3d]/30 disabled:opacity-50"
        >
          {loading ? 'Joining...' : t((msg) => msg.multiplayer.joinRoom.joinButton)}
        </button>
      </div>
    </section>
  )
}
