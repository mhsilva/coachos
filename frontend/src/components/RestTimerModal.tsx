import { useEffect, useRef, useState } from 'react'

interface Props {
  seconds: number
  onClose: () => void
}

function playBeeps(audioCtx: AudioContext) {
  const times = [0, 0.35, 0.7]
  times.forEach(offset => {
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.frequency.value = 880
    osc.type = 'sine'
    const t = audioCtx.currentTime + offset
    gain.gain.setValueAtTime(0.5, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25)
    osc.start(t)
    osc.stop(t + 0.25)
  })
}

export function RestTimerModal({ seconds, onClose }: Props) {
  const [remaining, setRemaining] = useState(seconds)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const beepedRef = useRef(false)

  useEffect(() => {
    if (remaining <= 0) {
      if (!beepedRef.current) {
        beepedRef.current = true
        try {
          if (!audioCtxRef.current) {
            audioCtxRef.current = new AudioContext()
          }
          playBeeps(audioCtxRef.current)
        } catch {
          // Audio not supported — skip
        }
        setTimeout(onClose, 1000)
      }
      return
    }

    const t = setTimeout(() => setRemaining(r => r - 1), 1000)
    return () => clearTimeout(t)
  }, [remaining, onClose])

  const pct = (remaining / seconds) * 100

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="bg-white rounded-card shadow-xl w-full max-w-xs p-6 text-center">
        <p className="text-xs text-teal/50 font-medium uppercase tracking-wider mb-4">Descanso</p>

        {/* Circular timer */}
        <div className="relative mx-auto w-28 h-28 mb-4">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50" cy="50" r="44"
              fill="none"
              stroke="rgba(22,50,63,0.08)"
              strokeWidth="8"
            />
            <circle
              cx="50" cy="50" r="44"
              fill="none"
              stroke="#B76E4D"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 44}`}
              strokeDashoffset={`${2 * Math.PI * 44 * (1 - pct / 100)}`}
              className="transition-all duration-1000"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-jetbrains font-bold text-3xl text-teal">
              {remaining}
            </span>
          </div>
        </div>

        <p className="text-sm text-teal/50 mb-5">
          {remaining > 0 ? 'Próxima série em breve...' : 'Bora!'}
        </p>

        <button
          type="button"
          onClick={onClose}
          className="w-full border border-teal/[0.15] rounded-btn py-2.5 text-sm font-medium text-teal/60 hover:bg-surface transition-colors"
        >
          Pular descanso
        </button>
      </div>
    </div>
  )
}
