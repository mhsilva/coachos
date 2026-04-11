import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    setLoading(false)
    if (authError) {
      setError('Email ou senha inválidos. Verifique seus dados e tente novamente.')
    } else {
      navigate('/')
    }
  }

  async function handleGoogleLogin() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` },
    })
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <h1 className="font-syne font-extrabold text-4xl text-teal tracking-[-0.02em]">
            CoachOS
          </h1>
          <p className="text-sm text-teal/50 mt-2">Sua plataforma de treino</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-card border border-teal/[0.09] shadow-card p-6">
          {/* Google */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            className="
              w-full flex items-center justify-center gap-3
              border border-teal/[0.12] rounded-btn py-3
              text-sm font-medium text-teal
              hover:bg-surface active:scale-[0.98]
              transition-all
            "
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Entrar com Google
          </button>

          {/* Divider */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-teal/[0.08]" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-3 text-xs text-teal/40">ou</span>
            </div>
          </div>

          {/* Email form */}
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label className="block text-sm text-teal/60 mb-1.5">Email</label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="seu@email.com"
                className="
                  w-full border border-teal/[0.15] rounded-btn px-3 py-2.5
                  text-sm text-teal placeholder:text-teal/25
                  focus:outline-none focus:border-copper
                  transition-colors
                "
              />
            </div>

            <div>
              <label className="block text-sm text-teal/60 mb-1.5">Senha</label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="
                  w-full border border-teal/[0.15] rounded-btn px-3 py-2.5
                  text-sm text-teal placeholder:text-teal/25
                  focus:outline-none focus:border-copper
                  transition-colors
                "
              />
            </div>

            {error && (
              <p className="text-sm text-red-500 leading-snug">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="
                w-full bg-copper text-white rounded-btn py-3
                text-sm font-medium shadow-btn
                hover:opacity-90 active:scale-[0.98]
                transition-all disabled:opacity-40
              "
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
