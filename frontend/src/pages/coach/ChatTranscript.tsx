import { useParams, Link } from 'react-router-dom'
import { AppLayout } from '../../components/AppLayout'
import { ChatWindow } from '../../components/chat/ChatWindow'
import { StudentScopedLayout } from '../../components/StudentScopedLayout'

export default function CoachChatTranscript() {
  const { id: studentId, chatId } = useParams<{ id: string; chatId: string }>()

  return (
    <AppLayout>
      <StudentScopedLayout studentId={studentId ?? ''}>
        <div className="flex flex-col h-[calc(100dvh-5rem)] md:h-dvh px-0 md:px-8 pt-4 pb-2 max-w-2xl mx-auto">
          <div className="px-4 md:px-0 mb-3 shrink-0 flex items-center justify-between">
            <Link
              to={`/coach/students/${studentId}`}
              className="inline-flex items-center gap-1 text-sm text-teal/50 hover:text-teal transition-colors"
            >
              ← Aluno
            </Link>
            <h1 className="font-syne font-extrabold text-xl text-teal tracking-[-0.02em]">
              Anamnese
            </h1>
            <span className="w-16" />
          </div>

          {chatId ? (
            <ChatWindow chatId={chatId} readOnly />
          ) : (
            <p className="text-teal/50 px-4">Chat inválido.</p>
          )}
        </div>
      </StudentScopedLayout>
    </AppLayout>
  )
}
