import { useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAuth } from '../hooks/useAuth'
import { createApi, streamPost } from '../lib/api'

interface Message {
  role: 'user' | 'assistant'
  content: string
  at?: string | null
}

interface AssistantChatPayload {
  student_id: string
  student_name: string | null
  messages: Message[]
}

type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

interface Props {
  studentId: string
  /** Optional: pre-populate the header name. If omitted, fetched from the API. */
  studentName?: string
  onClose?: () => void
}

export function CoachAssistantPanel({ studentId, studentName: studentNameProp, onClose }: Props) {
  const { session } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [generatingSummary, setGeneratingSummary] = useState(false)
  const [sending, setSending] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const [fetchedName, setFetchedName] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const studentName = studentNameProp ?? fetchedName ?? 'este aluno'

  const loadChat = useCallback(async () => {
    if (!session?.access_token) return
    setLoading(true)
    try {
      const data = await createApi(session.access_token).get<AssistantChatPayload>(
        `/coach-assistant/${studentId}`,
      )
      setMessages(data.messages ?? [])
      if (!studentNameProp) setFetchedName(data.student_name)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar conversa')
    } finally {
      setLoading(false)
    }
  }, [session, studentId, studentNameProp])

  useEffect(() => {
    loadChat()
  }, [loadChat])

  // Autoscroll on any message change
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const busy = generatingSummary || sending

  async function handleGenerateSummary() {
    if (!session?.access_token || busy) return
    setError('')
    setGeneratingSummary(true)
    // Optimistic empty assistant bubble to stream into
    setMessages([{ role: 'assistant', content: '' }])

    try {
      await streamPost(
        `/coach-assistant/${studentId}/summary`,
        {},
        session.access_token,
        (evt: unknown) => {
          const e = evt as StreamEvent
          if (e.type === 'delta') {
            setMessages(prev => {
              const next = prev.slice()
              const last = next[next.length - 1]
              if (last?.role === 'assistant') {
                next[next.length - 1] = { ...last, content: last.content + e.text }
              }
              return next
            })
          } else if (e.type === 'error') {
            setError(e.message || 'Erro no streaming')
          }
        },
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao gerar resumo')
      // Rollback empty bubble
      setMessages(prev =>
        prev.length === 1 && prev[0].role === 'assistant' && !prev[0].content ? [] : prev,
      )
    } finally {
      setGeneratingSummary(false)
    }
  }

  async function handleSend() {
    if (!session?.access_token || busy) return
    const text = input.trim()
    if (!text) return

    setError('')
    setSending(true)
    setInput('')

    setMessages(prev => [
      ...prev,
      { role: 'user', content: text },
      { role: 'assistant', content: '' },
    ])

    try {
      await streamPost(
        `/coach-assistant/${studentId}/messages`,
        { content: text },
        session.access_token,
        (evt: unknown) => {
          const e = evt as StreamEvent
          if (e.type === 'delta') {
            setMessages(prev => {
              const next = prev.slice()
              const last = next[next.length - 1]
              if (last?.role === 'assistant') {
                next[next.length - 1] = { ...last, content: last.content + e.text }
              }
              return next
            })
          } else if (e.type === 'error') {
            setError(e.message || 'Erro no streaming')
          }
        },
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao enviar')
      setMessages(prev => {
        if (prev.length && prev[prev.length - 1].role === 'assistant' && !prev[prev.length - 1].content) {
          return prev.slice(0, -1)
        }
        return prev
      })
    } finally {
      setSending(false)
      setTimeout(() => textareaRef.current?.focus(), 0)
    }
  }

  async function handleReset() {
    if (!session?.access_token || busy) return
    try {
      await createApi(session.access_token).delete(`/coach-assistant/${studentId}`)
      setMessages([])
      setConfirmReset(false)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao resetar')
    }
  }

  const isEmpty = messages.length === 0 && !loading

  return (
    <div className="flex flex-col h-full bg-white rounded-card border border-teal/[0.09] shadow-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-teal/[0.08] bg-teal/[0.02] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-full bg-copper/10 flex items-center justify-center shrink-0">
            <span className="text-copper text-sm">✨</span>
          </div>
          <div className="min-w-0">
            <p className="font-syne font-bold text-teal text-sm leading-tight">Assistente IA</p>
            <p className="text-[11px] text-teal/50 leading-tight truncate">
              Sobre <span className="font-medium">{studentName}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {messages.length > 0 && !busy && (
            confirmReset ? (
              <div className="flex items-center gap-1 text-xs">
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="text-teal/40 hover:text-teal px-2 py-1 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="font-medium text-red-500 hover:text-red-600 px-2 py-1 transition-colors"
                >
                  Resetar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="text-teal/30 hover:text-teal p-1.5 rounded-btn hover:bg-teal/[0.06] transition-colors"
                aria-label="Resetar conversa"
                title="Resetar conversa"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
                </svg>
              </button>
            )
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-teal/30 hover:text-teal p-1.5 rounded-btn hover:bg-teal/[0.06] transition-colors"
              aria-label="Fechar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex justify-center pt-10">
            <div className="w-5 h-5 border-2 border-copper border-t-transparent rounded-full animate-spin" />
          </div>
        ) : isEmpty ? (
          <EmptyState onGenerate={handleGenerateSummary} busy={generatingSummary} />
        ) : (
          <>
            {messages.map((m, i) => (
              <Bubble key={i} role={m.role} content={m.content} />
            ))}
            {busy && messages[messages.length - 1]?.role === 'assistant' &&
              messages[messages.length - 1].content === '' && (
                <Bubble role="assistant" content="…" />
              )}
          </>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-500 bg-red-50 px-4 py-2 border-t border-red-100">
          {error}
        </p>
      )}

      {/* Composer — only after summary exists */}
      {!isEmpty && !loading && (
        <div className="border-t border-teal/[0.08] p-3 bg-surface shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              rows={2}
              disabled={busy}
              placeholder="Pergunte algo sobre o aluno…"
              className="
                flex-1 border border-teal/[0.15] rounded-btn px-3 py-2
                text-base text-teal font-inter resize-none
                focus:outline-none focus:border-copper bg-white
                disabled:opacity-60
              "
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={busy || !input.trim()}
              className="
                bg-copper text-white rounded-btn px-3.5 py-2 text-sm font-medium shadow-btn
                hover:opacity-90 active:scale-95 transition-all
                disabled:opacity-40 disabled:active:scale-100
              "
            >
              {busy ? '…' : 'Enviar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────

function EmptyState({ onGenerate, busy }: { onGenerate: () => void; busy: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-4">
      <div className="w-14 h-14 rounded-full bg-copper/10 flex items-center justify-center mb-4">
        <span className="text-copper text-2xl">✨</span>
      </div>
      <p className="font-syne font-bold text-teal text-base mb-1">Resumo do aluno</p>
      <p className="text-xs text-teal/55 leading-relaxed max-w-[260px] mb-5">
        Gero um resumo completo com base no perfil, anamnese, avaliações e feedbacks de sessão. Depois você pode me perguntar qualquer coisa.
      </p>
      <button
        type="button"
        onClick={onGenerate}
        disabled={busy}
        className="
          bg-copper text-white rounded-btn px-5 py-2.5
          text-sm font-medium shadow-btn
          hover:opacity-90 active:scale-95 transition-all
          disabled:opacity-40
        "
      >
        {busy ? 'Gerando...' : 'Gerar resumo'}
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────
// Bubble (user = copper; assistant = white card with markdown)
// ─────────────────────────────────────────────

function Bubble({ role, content }: { role: 'user' | 'assistant'; content: string }) {
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-copper text-white rounded-card rounded-br-sm px-3.5 py-2 shadow-btn">
          <p className="text-sm font-inter whitespace-pre-wrap leading-relaxed">{content}</p>
        </div>
      </div>
    )
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] bg-white text-teal rounded-card rounded-bl-sm px-3.5 py-2 border border-teal/[0.09] shadow-card">
        <div className="text-sm font-inter leading-relaxed chat-md">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              strong: ({ children }) => <strong className="font-semibold text-teal">{children}</strong>,
              em: ({ children }) => <em className="italic">{children}</em>,
              h1: ({ children }) => <h1 className="font-syne font-bold text-sm mt-1 mb-2">{children}</h1>,
              h2: ({ children }) => <h2 className="font-syne font-bold text-sm mt-1 mb-2">{children}</h2>,
              h3: ({ children }) => <h3 className="font-syne font-bold text-xs mt-1 mb-2 uppercase tracking-wide">{children}</h3>,
              ul: ({ children }) => <ul className="list-disc list-outside pl-5 mb-2 last:mb-0 space-y-1">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal list-outside pl-5 mb-2 last:mb-0 space-y-1">{children}</ol>,
              li: ({ children }) => <li className="leading-relaxed">{children}</li>,
              hr: () => <hr className="my-2 border-teal/[0.1]" />,
              code: ({ children }) => (
                <code className="font-jetbrains text-xs bg-teal/[0.06] rounded px-1 py-0.5">{children}</code>
              ),
              blockquote: ({ children }) => (
                <blockquote className="border-l-2 border-copper/50 pl-3 italic text-teal/70 my-2">
                  {children}
                </blockquote>
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  )
}
