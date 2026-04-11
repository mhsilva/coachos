import { useEffect, useState } from 'react'
import { AppLayout } from '../../components/AppLayout'
import { useAuth } from '../../hooks/useAuth'
import { createApi } from '../../lib/api'
import { supabase } from '../../lib/supabase'

interface Coach {
  id: string
  user_id: string
  approved_at: string | null
  created_at: string
  profiles: {
    full_name: string | null
    avatar_url: string | null
    is_active: boolean
  } | null
}

export default function AdminCoaches() {
  const { session } = useAuth()
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [loading, setLoading] = useState(true)
  const [approvingId, setApprovingId] = useState<string | null>(null)

  async function fetchCoaches() {
    if (!session?.access_token) return
    // Direct Supabase query — admin has read-all access via RLS
    const { data, error } = await supabase
      .from('coaches')
      .select('id, user_id, approved_at, created_at, profiles(full_name, avatar_url, is_active)')
      .order('created_at', { ascending: false })

    if (!error && data) setCoaches(data as unknown as Coach[])
    setLoading(false)
  }

  useEffect(() => { fetchCoaches() }, [session])

  async function handleApprove(coach: Coach) {
    if (!session?.access_token) return
    setApprovingId(coach.user_id)
    try {
      await createApi(session.access_token).post('/auth/approve-coach', {
        user_id: coach.user_id,
      })
      await fetchCoaches()
    } catch (err) {
      console.error(err)
    } finally {
      setApprovingId(null)
    }
  }

  const initial = (c: Coach) =>
    (c.profiles?.full_name ?? c.user_id).charAt(0).toUpperCase()

  return (
    <AppLayout>
      <div className="px-4 py-6 md:px-8 max-w-2xl">
        <h1 className="page-title mb-6">Coaches</h1>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 border-4 border-copper border-t-transparent rounded-full animate-spin" />
          </div>
        ) : coaches.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-3xl mb-3">🏆</p>
            <p className="font-medium text-teal">Nenhum coach cadastrado</p>
          </div>
        ) : (
          <div className="space-y-2">
            {coaches.map(c => {
              const isPending = !c.approved_at
              const isApproving = approvingId === c.user_id
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-4 bg-white rounded-card border border-teal/[0.09] shadow-card p-4"
                >
                  {/* Avatar */}
                  {c.profiles?.avatar_url ? (
                    <img
                      src={c.profiles.avatar_url}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-teal/10 flex items-center justify-center text-sm font-bold text-teal shrink-0">
                      {initial(c)}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-teal truncate">
                      {c.profiles?.full_name ?? 'Coach'}
                    </p>
                    <p className="text-xs text-teal/40 mt-0.5">
                      {isPending ? 'Aguardando aprovação' : 'Ativo'}
                    </p>
                  </div>

                  {/* Status badge */}
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${
                      isPending
                        ? 'bg-copper/10 text-copper'
                        : 'bg-teal/10 text-teal'
                    }`}
                  >
                    {isPending ? 'Pendente' : 'Ativo'}
                  </span>

                  {/* Approve button */}
                  {isPending && (
                    <button
                      type="button"
                      onClick={() => handleApprove(c)}
                      disabled={isApproving}
                      className="
                        bg-copper text-white rounded-btn px-3 py-1.5
                        text-xs font-medium shadow-btn shrink-0
                        hover:opacity-90 active:scale-95
                        transition-all disabled:opacity-40
                      "
                    >
                      {isApproving ? '...' : 'Aprovar'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
