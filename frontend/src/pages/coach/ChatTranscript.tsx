import { useParams, Link } from 'react-router-dom'
import { AppLayout } from '../../components/AppLayout'
import { ChatWindow } from '../../components/chat/ChatWindow'

export default function CoachChatTranscript() {
  const { id: studentId, chatId } = useParams<{ id: string; chatId: string }>()

  return (
    <AppLayout>
      <div className="px-0 md:px-8 py-6 max-w-2xl mx-auto">
        <div className="px-4 md:px-0 mb-5 flex items-center justify-between">
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
    </AppLayout>
  )
}
