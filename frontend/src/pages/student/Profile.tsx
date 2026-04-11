import { useState } from 'react'
import { AppLayout } from '../../components/AppLayout'
import { useAuth } from '../../hooks/useAuth'
import { createApi } from '../../lib/api'

export default function StudentProfile() {
  const { user, session, coachRequested } = useAuth()
  const [requested, setRequested] = useState(coachRequested)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ??
    user?.email?.split('@')[0] ??
    ''
  const initial = displayName.charAt(0).toUpperCase()

  async function handleRequestCoach() {
    if (!session?.access_token) return
    setLoading(true)
    setError('')
    try {
      await createApi(session.access_token).post('/auth/request-coach', {})
      setRequested(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar solicitação')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppLayout>
      <div className="px-4 py-6 md:px-8 max-w-lg">
        <h1 className="page-title mb-6">Perfil</h1>

        {/* User info card */}
        <div className="bg-white rounded-card border border-teal/[0.09] shadow-card p-5 mb-6">
          <div className="flex items-center gap-4">
            {user?.user_metadata?.avatar_url ? (
              <img
                src={user.user_metadata.avatar_url as string}
                alt=""
                className="w-14 h-14 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-teal/10 flex items-center justify-center text-xl font-bold text-teal shrink-0">
                {initial}
              </div>
            )}
            <div className="min-w-0">
              <p className="font-syne font-bold text-lg text-teal truncate">
                {displayName}
              </p>
              <p className="text-sm text-teal/50">{user?.email}</p>
              <span className="inline-block text-xs font-medium bg-gray text-teal/50 px-2 py-0.5 rounded-full mt-1">
                Aluno
              </span>
            </div>
          </div>
        </div>

        {/* Coach request card */}
        <div className="bg-white rounded-card border border-teal/[0.09] shadow-card p-5">
          <h2 className="font-syne font-bold text-teal mb-2">Quer ser Coach?</h2>
          <p className="text-sm text-teal/60 leading-relaxed mb-4">
            Solicite a promoção para coach e crie fichas de treino para seus alunos.
            Um administrador irá analisar sua solicitação.
          </p>

          {requested ? (
            <div className="bg-copper/10 text-copper rounded-btn px-4 py-3 text-sm font-medium text-center">
              Solicitação enviada — aguardando aprovação
            </div>
          ) : (
            <>
              {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
              <button
                type="button"
                onClick={handleRequestCoach}
                disabled={loading}
                className="
                  w-full bg-copper text-white rounded-btn py-3
                  text-sm font-medium shadow-btn
                  hover:opacity-90 active:scale-[0.98]
                  transition-all disabled:opacity-40
                "
              >
                {loading ? 'Enviando...' : 'Solicitar promoção para Coach'}
              </button>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
