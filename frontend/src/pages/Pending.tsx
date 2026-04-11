import { useAuth } from '../hooks/useAuth'
import { useNavigate } from 'react-router-dom'

export default function Pending() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm text-center">
        <p className="text-5xl mb-5">⏳</p>
        <h1 className="font-syne font-extrabold text-2xl text-teal tracking-[-0.02em] mb-2">
          Conta em análise
        </h1>
        <p className="text-sm text-teal/60 leading-relaxed mb-2">
          Sua conta foi criada com sucesso, mas ainda não foi ativada por um administrador.
        </p>
        <p className="text-sm text-teal/40 mb-8">
          {user?.email}
        </p>
        <button
          type="button"
          onClick={handleSignOut}
          className="text-sm text-copper hover:underline"
        >
          Sair e usar outra conta
        </button>
      </div>
    </div>
  )
}
