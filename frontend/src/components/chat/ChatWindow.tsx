import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAuth } from '../../hooks/useAuth'
import { createApi, streamPost } from '../../lib/api'

type Role = 'user' | 'assistant'

interface Message {
  role: Role
  content: string
  at?: string | null
}

interface ChatMeta {
  id: string
  type: string
  status: 'open' | 'closed'
  student_id: string
  coach_id: string
  created_at: string
  closed_at: string | null
  storage_path: string | null
  messages: Message[]
}

interface Props {
  chatId: string
  /** If true, forces read-only even for student (e.g. coach view). */
  readOnly?: boolean
}

type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; closed: boolean; final_content?: string }
  | { type: 'error'; message: string }

export function ChatWindow({ chatId, readOnly = false }: Props) {
  const { session, role } = useAuth()
  const [meta, setMeta] = useState<ChatMeta | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const canSend = useMemo(() => {
    if (readOnly) return false
    if (role !== 'student') return false
    if (!meta) return false
    return meta.status === 'open'
  }, [readOnly, role, meta])

  // Load
  useEffect(() => {
    if (!session?.access_token) return
    const api = createApi(session.access_token)
    api
      .get<ChatMeta>(`/chats/${chatId}`)
      .then(data => {
        setMeta(data)
        setMessages(data.messages ?? [])
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Erro ao carregar'))
      .finally(() => setLoading(false))
  }, [session, chatId])

  // Autoscroll to bottom on new content
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    if (!canSend || !session?.access_token) return
    const text = input.trim()
    if (!text || sending) return

    setError('')
    setSending(true)
    setInput('')

    // Optimistic user bubble + empty assistant bubble that we'll fill
    setMessages(prev => [
      ...prev,
      { role: 'user', content: text },
      { role: 'assistant', content: '' },
    ])

    try {
      await streamPost(
        `/chats/${chatId}/messages`,
        { content: text },
        session.access_token,
        (evt: unknown) => {
          const e = evt as StreamEvent
          if (e.type === 'delta') {
            setMessages(prev => {
              const next = prev.slice()
              const last = next[next.length - 1]
              if (last && last.role === 'assistant') {
                next[next.length - 1] = { ...last, content: last.content + e.text }
              }
              return next
            })
          } else if (e.type === 'done') {
            if (e.closed) {
              // Replace streamed bubble with cleaned final content (tag stripped)
              setMessages(prev => {
                const next = prev.slice()
                const last = next[next.length - 1]
                if (last && last.role === 'assistant' && e.final_content !== undefined) {
                  next[next.length - 1] = { ...last, content: e.final_content }
                }
                return next
              })
              setMeta(m => (m ? { ...m, status: 'closed' } : m))
            }
          } else if (e.type === 'error') {
            setError(e.message || 'Erro no streaming')
          }
        },
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar mensagem')
      // Roll back the empty assistant bubble
      setMessages(prev => {
        if (prev.length && prev[prev.length - 1].role === 'assistant' && !prev[prev.length - 1].content) {
          return prev.slice(0, -1)
        }
        return prev
      })
    } finally {
      setSending(false)
      // textarea is `disabled` while sending, so the browser drops focus.
      // Re-focus on next tick (after React re-enables it) so the user can
      // type the next answer without clicking.
      setTimeout(() => textareaRef.current?.focus(), 0)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-7 h-7 border-4 border-copper border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!meta) {
    return <p className="text-teal/50 px-4">Chat não encontrado.</p>
  }

  const closed = meta.status === 'closed'

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] md:h-[calc(100vh-120px)]">
      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 md:px-0 space-y-3"
      >
        {messages.length === 0 && !closed && role === 'student' && !readOnly && (
          <div className="text-center text-sm text-teal/50 py-8">
            Comece a conversa mandando sua primeira mensagem.
          </div>
        )}
        {messages.length === 0 && (readOnly || role === 'coach') && (
          <div className="text-center text-sm text-teal/50 py-8">
            Sem mensagens.
          </div>
        )}

        {messages.map((m, i) => (
          <Bubble key={i} role={m.role} content={m.content} />
        ))}

        {sending && messages[messages.length - 1]?.role === 'assistant' &&
          messages[messages.length - 1].content === '' && (
          <Bubble role="assistant" content="…" />
        )}
      </div>

      {error && (
        <p className="text-sm text-red-500 bg-red-50 rounded-btn px-4 py-2.5 mx-4 md:mx-0 mt-3">
          {error}
        </p>
      )}

      {/* Composer */}
      {!readOnly && role === 'student' && !closed && (
        <div className="border-t border-teal/[0.08] pt-3 px-4 md:px-0 bg-surface">
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
              disabled={sending}
              placeholder="Escreva sua resposta…"
              className="
                flex-1 border border-teal/[0.15] rounded-card px-3 py-2
                text-sm text-teal font-inter resize-none
                focus:outline-none focus:border-copper bg-white
                disabled:opacity-60
              "
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className="
                bg-copper text-white rounded-btn px-4 py-2 text-sm font-medium shadow-btn
                hover:opacity-90 active:scale-95 transition-all
                disabled:opacity-40 disabled:active:scale-100
              "
            >
              {sending ? '…' : 'Enviar'}
            </button>
          </div>
        </div>
      )}

      {closed && (
        <div className="border-t border-teal/[0.08] pt-3 px-4 md:px-0">
          <div className="bg-teal/10 text-teal rounded-btn px-4 py-2.5 text-sm font-medium text-center">
            Anamnese finalizada ✓
          </div>
        </div>
      )}

      {role === 'coach' && !closed && (
        <div className="border-t border-teal/[0.08] pt-3 px-4 md:px-0">
          <div className="bg-copper/10 text-copper rounded-btn px-4 py-2.5 text-sm font-medium text-center">
            Em andamento — você verá o transcript quando o aluno finalizar.
          </div>
        </div>
      )}
    </div>
  )
}

function Bubble({ role, content }: { role: Role; content: string }) {
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-copper text-white rounded-card rounded-br-sm px-4 py-2.5 shadow-btn">
          <p className="text-sm font-inter whitespace-pre-wrap leading-relaxed">
            {content}
          </p>
        </div>
      </div>
    )
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] bg-white text-teal rounded-card rounded-bl-sm px-4 py-2.5 border border-teal/[0.09] shadow-card">
        <div className="text-sm font-inter leading-relaxed chat-md">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => (
                <p className="mb-2 last:mb-0">{children}</p>
              ),
              strong: ({ children }) => (
                <strong className="font-semibold text-teal">{children}</strong>
              ),
              em: ({ children }) => <em className="italic">{children}</em>,
              h1: ({ children }) => (
                <h1 className="font-syne font-bold text-base mt-1 mb-2">{children}</h1>
              ),
              h2: ({ children }) => (
                <h2 className="font-syne font-bold text-base mt-1 mb-2">{children}</h2>
              ),
              h3: ({ children }) => (
                <h3 className="font-syne font-bold text-sm mt-1 mb-2">{children}</h3>
              ),
              ul: ({ children }) => (
                <ul className="list-disc list-outside pl-5 mb-2 last:mb-0 space-y-1">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal list-outside pl-5 mb-2 last:mb-0 space-y-1">{children}</ol>
              ),
              li: ({ children }) => <li className="leading-relaxed">{children}</li>,
              hr: () => <hr className="my-3 border-teal/[0.1]" />,
              a: ({ href, children }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-copper underline underline-offset-2 hover:opacity-80"
                >
                  {children}
                </a>
              ),
              code: ({ children }) => (
                <code className="font-jetbrains text-xs bg-teal/[0.06] rounded px-1 py-0.5">
                  {children}
                </code>
              ),
              pre: ({ children }) => (
                <pre className="font-jetbrains text-xs bg-teal/[0.06] rounded-btn p-2.5 my-2 overflow-x-auto">
                  {children}
                </pre>
              ),
              blockquote: ({ children }) => (
                <blockquote className="border-l-2 border-copper/50 pl-3 italic text-teal/70 my-2">
                  {children}
                </blockquote>
              ),
              table: ({ children }) => (
                <div className="overflow-x-auto my-2">
                  <table className="w-full text-xs border-collapse">{children}</table>
                </div>
              ),
              th: ({ children }) => (
                <th className="border border-teal/[0.1] bg-teal/[0.04] px-2 py-1 text-left font-semibold">
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="border border-teal/[0.1] px-2 py-1">{children}</td>
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
