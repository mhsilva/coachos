import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppLayout } from '../components/AppLayout'
import { useAuth } from '../hooks/useAuth'
import { useNotifications } from '../contexts/NotificationContext'
import { createApi } from '../lib/api'

interface Notification {
  id: string
  type: string
  title: string
  body: string
  payload: Record<string, string>
  is_read: boolean
  created_at: string
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

export default function Notifications() {
  const { session } = useAuth()
  const { refreshCount } = useNotifications()
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [respondingId, setRespondingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function markRead(notificationId: string) {
    if (!session?.access_token) return
    await createApi(session.access_token).patch('/notifications/read', {
      notification_ids: [notificationId],
    })
    setNotifications(prev =>
      prev.map(n => (n.id === notificationId ? { ...n, is_read: true } : n)),
    )
    await refreshCount()
  }

  async function handleOpenAnamnese(n: Notification) {
    const chatId = n.payload?.chat_id
    if (!chatId) return
    await markRead(n.id)
    if (n.type === 'anamnese_request') {
      navigate(`/student/chat/${chatId}`)
    } else if (n.type === 'anamnese_completed') {
      const studentId = n.payload?.student_id
      if (studentId) navigate(`/coach/students/${studentId}/chats/${chatId}`)
    }
  }

  async function handleOpenAssessment(n: Notification) {
    const assessmentId = n.payload?.assessment_id
    if (!assessmentId) return
    await markRead(n.id)
    if (n.type === 'assessment_requested') {
      navigate(`/student/assessments/${assessmentId}/fill`)
    } else if (n.type === 'assessment_submitted') {
      // Coach jumps to the student's detail page (the assessments tab is inside).
      // We look up the student via the assessment to keep the notification payload lean.
      // Simpler path: if the coach included student_id in the payload, use it.
      const studentId = n.payload?.student_id
      if (studentId) navigate(`/coach/students/${studentId}`)
    }
  }

  async function fetchNotifications() {
    if (!session?.access_token) return
    try {
      const data = await createApi(session.access_token).get<Notification[]>('/notifications')
      setNotifications(data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchNotifications() }, [session])

  async function handleMarkAllRead() {
    if (!session?.access_token) return
    await createApi(session.access_token).patch('/notifications/read', { all: true })
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    await refreshCount()
  }

  async function handleRespond(inviteId: string, action: 'accept' | 'reject', notificationId: string) {
    if (!session?.access_token) return
    setRespondingId(notificationId)
    setError('')
    try {
      await createApi(session.access_token).post('/auth/respond-invite', {
        invite_id: inviteId,
        action,
      })
      // Mark notification as read
      await createApi(session.access_token).patch('/notifications/read', {
        notification_ids: [notificationId],
      })
      // Update local state
      setNotifications(prev =>
        prev.map(n =>
          n.id === notificationId
            ? {
                ...n,
                is_read: true,
                type: action === 'accept' ? 'invite_accepted_by_me' : 'invite_rejected_by_me',
              }
            : n,
        ),
      )
      await refreshCount()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao responder convite')
    } finally {
      setRespondingId(null)
    }
  }

  const hasUnread = notifications.some(n => !n.is_read)

  return (
    <AppLayout>
      <div className="px-4 py-6 md:px-8 max-w-lg">
        <div className="flex items-center justify-between mb-6">
          <h1 className="page-title">Notificações</h1>
          {hasUnread && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="text-xs text-copper font-medium hover:underline"
            >
              Marcar todas como lidas
            </button>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-500 bg-red-50 rounded-btn px-4 py-2.5 mb-4">{error}</p>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 border-4 border-copper border-t-transparent rounded-full animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-3xl mb-3">🔔</p>
            <p className="font-medium text-teal">Nenhuma notificação</p>
            <p className="text-sm text-teal/50 mt-1">Você está em dia!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map(n => (
              <div
                key={n.id}
                className={`bg-white rounded-card border p-4 transition-all ${
                  n.is_read
                    ? 'border-teal/[0.06] opacity-70'
                    : 'border-copper/30 shadow-card'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {!n.is_read && (
                        <span className="w-2 h-2 rounded-full bg-copper shrink-0" />
                      )}
                      <p className="font-syne font-bold text-sm text-teal truncate">
                        {n.title}
                      </p>
                    </div>
                    <p className="text-sm text-teal/60 mt-0.5">{n.body}</p>
                  </div>
                  <span className="text-xs text-teal/30 shrink-0">{timeAgo(n.created_at)}</span>
                </div>

                {/* Invite actions */}
                {n.type === 'invite_received' && !n.is_read && (
                  <div className="flex gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => handleRespond(n.payload.invite_id, 'accept', n.id)}
                      disabled={respondingId === n.id}
                      className="flex-1 bg-copper text-white rounded-btn py-2 text-sm font-medium shadow-btn hover:opacity-90 disabled:opacity-40 transition-all"
                    >
                      {respondingId === n.id ? '...' : 'Aceitar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRespond(n.payload.invite_id, 'reject', n.id)}
                      disabled={respondingId === n.id}
                      className="flex-1 border border-teal/[0.15] text-teal/60 rounded-btn py-2 text-sm font-medium hover:bg-surface disabled:opacity-40 transition-colors"
                    >
                      Recusar
                    </button>
                  </div>
                )}

                {/* Anamnese actions */}
                {n.type === 'anamnese_request' && (
                  <button
                    type="button"
                    onClick={() => handleOpenAnamnese(n)}
                    className="mt-3 w-full bg-copper text-white rounded-btn py-2 text-sm font-medium shadow-btn hover:opacity-90 transition-all"
                  >
                    Responder
                  </button>
                )}
                {n.type === 'anamnese_completed' && (
                  <button
                    type="button"
                    onClick={() => handleOpenAnamnese(n)}
                    className="mt-3 w-full border border-teal/[0.15] text-teal rounded-btn py-2 text-sm font-medium hover:bg-surface transition-colors"
                  >
                    Ver transcript
                  </button>
                )}

                {/* Assessment actions */}
                {n.type === 'assessment_requested' && (
                  <button
                    type="button"
                    onClick={() => handleOpenAssessment(n)}
                    className="mt-3 w-full bg-copper text-white rounded-btn py-2 text-sm font-medium shadow-btn hover:opacity-90 transition-all"
                  >
                    Preencher avaliação
                  </button>
                )}
                {n.type === 'assessment_submitted' && n.payload?.student_id && (
                  <button
                    type="button"
                    onClick={() => handleOpenAssessment(n)}
                    className="mt-3 w-full border border-teal/[0.15] text-teal rounded-btn py-2 text-sm font-medium hover:bg-surface transition-colors"
                  >
                    Ver avaliação
                  </button>
                )}

                {/* Response confirmation */}
                {n.type === 'invite_accepted_by_me' && (
                  <p className="text-xs text-teal font-medium mt-2 bg-teal/10 rounded-btn px-3 py-1.5 inline-block">
                    Convite aceito
                  </p>
                )}
                {n.type === 'invite_rejected_by_me' && (
                  <p className="text-xs text-teal/50 font-medium mt-2 bg-gray rounded-btn px-3 py-1.5 inline-block">
                    Convite recusado
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
