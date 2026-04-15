import { useEffect, useState, useCallback } from 'react'
import { AppLayout } from '../../components/AppLayout'
import { useAuth } from '../../hooks/useAuth'
import { createApi } from '../../lib/api'

interface CatalogEntry {
  id: string
  name: string
  demo_url: string | null
  updated_at?: string
}

interface UsagePlan {
  id: string
  name: string
}

interface UsageResponse {
  in_use_count: number
  plans: UsagePlan[]
}

export default function CoachCatalog() {
  const { session } = useAuth()
  const [items, setItems] = useState<CatalogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  // Add form
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDemoUrl, setNewDemoUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [addError, setAddError] = useState('')

  // Edit inline
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDemoUrl, setEditDemoUrl] = useState('')
  const [editError, setEditError] = useState('')

  // Delete feedback
  const [deleteBlockedId, setDeleteBlockedId] = useState<string | null>(null)
  const [deleteBlockedMsg, setDeleteBlockedMsg] = useState('')
  const [usageDetail, setUsageDetail] = useState<UsageResponse | null>(null)

  const fetchItems = useCallback(async (q?: string) => {
    if (!session?.access_token) return
    const api = createApi(session.access_token)
    const qs = q && q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''
    try {
      const data = await api.get<CatalogEntry[]>(`/catalog${qs}`)
      setItems(data)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [session])

  // Initial load
  useEffect(() => { fetchItems() }, [fetchItems])

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => fetchItems(query), 250)
    return () => clearTimeout(t)
  }, [query, fetchItems])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!session?.access_token || !newName.trim()) return
    setSaving(true)
    setAddError('')
    try {
      const api = createApi(session.access_token)
      await api.post<CatalogEntry>('/catalog', {
        name: newName.trim(),
        demo_url: newDemoUrl.trim() || null,
      })
      setNewName('')
      setNewDemoUrl('')
      setAdding(false)
      fetchItems(query)
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Erro ao criar')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(item: CatalogEntry) {
    setEditingId(item.id)
    setEditName(item.name)
    setEditDemoUrl(item.demo_url ?? '')
    setEditError('')
  }

  async function handleSaveEdit(id: string) {
    if (!session?.access_token || !editName.trim()) return
    setEditError('')
    try {
      const api = createApi(session.access_token)
      await api.patch<CatalogEntry>(`/catalog/${id}`, {
        name: editName.trim(),
        demo_url: editDemoUrl.trim() || null,
      })
      setEditingId(null)
      fetchItems(query)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Erro ao salvar')
    }
  }

  async function handleDelete(item: CatalogEntry) {
    if (!session?.access_token) return
    const api = createApi(session.access_token)
    try {
      await api.delete(`/catalog/${item.id}`)
      setItems(prev => prev.filter(i => i.id !== item.id))
      setDeleteBlockedId(null)
      setUsageDetail(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao excluir'
      setDeleteBlockedId(item.id)
      setDeleteBlockedMsg(msg)
      // Best-effort: fetch detailed usage for transparency
      try {
        const usage = await api.get<UsageResponse>(`/catalog/${item.id}/usage`)
        setUsageDetail(usage)
      } catch {
        setUsageDetail(null)
      }
    }
  }

  return (
    <AppLayout>
      <div className="px-4 py-6 md:px-8 max-w-2xl">
        <h1 className="page-title mb-1">Catálogo de exercícios</h1>
        <p className="text-sm text-teal/50 mb-6">
          Sua biblioteca pessoal — apenas você vê. Seus alunos acessam o vídeo ao executar.
        </p>

        {/* Search + Add */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar exercício..."
            className="flex-1 border border-teal/[0.15] rounded-btn px-3 py-2.5 text-sm text-teal placeholder:text-teal/25 focus:outline-none focus:border-copper transition-colors"
          />
          {!adding && (
            <button
              type="button"
              onClick={() => { setAdding(true); setAddError('') }}
              className="bg-copper text-white rounded-btn px-4 py-2.5 text-sm font-medium shadow-btn hover:opacity-90 transition-all whitespace-nowrap"
            >
              + Novo
            </button>
          )}
        </div>

        {/* Add form */}
        {adding && (
          <form onSubmit={handleAdd} className="mb-4 bg-white rounded-card border border-copper/20 shadow-card p-4 space-y-3">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              required
              autoFocus
              placeholder="Nome do exercício (ex: Supino reto)"
              className="w-full border border-teal/[0.15] rounded-btn px-3 py-2 text-sm text-teal placeholder:text-teal/25 focus:outline-none focus:border-copper transition-colors"
            />
            <input
              type="url"
              value={newDemoUrl}
              onChange={e => setNewDemoUrl(e.target.value)}
              placeholder="Link do vídeo (opcional)"
              className="w-full border border-teal/[0.15] rounded-btn px-3 py-2 text-sm text-teal placeholder:text-teal/25 focus:outline-none focus:border-copper transition-colors"
            />
            {addError && <p className="text-xs text-red-500">{addError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setAdding(false); setNewName(''); setNewDemoUrl(''); setAddError('') }}
                className="flex-1 border border-teal/[0.15] rounded-btn py-2 text-sm font-medium text-teal/60 hover:bg-surface transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving || !newName.trim()}
                className="flex-1 bg-copper text-white rounded-btn py-2 text-sm font-medium shadow-btn hover:opacity-90 disabled:opacity-40 transition-all"
              >
                {saving ? 'Salvando...' : 'Adicionar'}
              </button>
            </div>
          </form>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 border-4 border-copper border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {!loading && items.length === 0 && (
          <div className="text-center py-12">
            <p className="text-3xl mb-3">🏋️</p>
            <p className="font-medium text-teal">
              {query ? 'Nenhum exercício encontrado' : 'Seu catálogo está vazio'}
            </p>
            <p className="text-sm text-teal/50 mt-1">
              {query ? 'Tente outro termo' : 'Exercícios são adicionados automaticamente ao montar treinos.'}
            </p>
          </div>
        )}

        {/* List */}
        {!loading && items.length > 0 && (
          <div className="bg-white rounded-card border border-teal/[0.09] shadow-card overflow-hidden divide-y divide-teal/[0.06]">
            {items.map(item => {
              const isEditing = editingId === item.id
              const isBlocked = deleteBlockedId === item.id

              return (
                <div key={item.id} className="p-4">
                  {isEditing ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        autoFocus
                        className="w-full border border-teal/[0.15] rounded-btn px-3 py-2 text-sm text-teal focus:outline-none focus:border-copper transition-colors"
                      />
                      <input
                        type="url"
                        value={editDemoUrl}
                        onChange={e => setEditDemoUrl(e.target.value)}
                        placeholder="Link do vídeo (opcional)"
                        className="w-full border border-teal/[0.15] rounded-btn px-3 py-2 text-sm text-teal placeholder:text-teal/25 focus:outline-none focus:border-copper transition-colors"
                      />
                      {editError && <p className="text-xs text-red-500">{editError}</p>}
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="text-xs text-teal/50 font-medium px-3 py-1"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(item.id)}
                          disabled={!editName.trim()}
                          className="text-xs text-copper font-medium px-3 py-1 disabled:opacity-40"
                        >
                          Salvar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-teal font-medium truncate">{item.name}</p>
                          {item.demo_url && (
                            <a
                              href={item.demo_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-copper hover:underline inline-block mt-0.5"
                            >
                              Ver vídeo →
                            </a>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => startEdit(item)}
                            className="text-xs text-teal/50 hover:text-copper transition-colors px-2 py-1"
                            title="Editar"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item)}
                            className="text-xs text-teal/50 hover:text-red-400 transition-colors px-2 py-1"
                            title="Excluir"
                          >
                            Excluir
                          </button>
                        </div>
                      </div>

                      {isBlocked && (
                        <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                          <p className="text-xs text-red-600">{deleteBlockedMsg}</p>
                          {usageDetail && usageDetail.plans.length > 0 && (
                            <p className="text-xs text-red-500/70 mt-1">
                              Em uso em: {usageDetail.plans.map(p => p.name).join(', ')}
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={() => { setDeleteBlockedId(null); setUsageDetail(null) }}
                            className="text-xs text-red-500/60 mt-1.5 underline"
                          >
                            Ok, entendi
                          </button>
                        </div>
                      )}
                    </>
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
