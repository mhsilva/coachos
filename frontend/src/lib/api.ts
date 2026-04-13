const BASE_URL = import.meta.env.VITE_API_BASE_URL as string

async function request<T>(
  path: string,
  options: RequestInit,
  token: string,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    ...(options.headers as Record<string, string> | undefined),
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error((err as { detail?: string }).detail ?? 'Erro desconhecido')
  }

  // 204 No Content — return empty object
  if (res.status === 204) return {} as T
  return res.json() as Promise<T>
}

export function createApi(token: string) {
  return {
    get: <T>(path: string) =>
      request<T>(path, { method: 'GET' }, token),

    post: <T>(path: string, body: unknown) =>
      request<T>(path, { method: 'POST', body: JSON.stringify(body) }, token),

    patch: <T>(path: string, body?: unknown) =>
      request<T>(
        path,
        { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined },
        token,
      ),

    delete: <T>(path: string) =>
      request<T>(path, { method: 'DELETE' }, token),
  }
}

/**
 * SSE-streaming POST. The server is expected to emit `data: <json>\n\n` lines.
 * Parsed JSON chunks are handed to `onEvent` as they arrive.
 *
 * Resolves when the stream ends cleanly. Rejects on HTTP error or network drop.
 */
export async function streamPost(
  path: string,
  body: unknown,
  token: string,
  onEvent: (evt: unknown) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error((err as { detail?: string }).detail ?? 'Erro desconhecido')
  }
  if (!res.body) throw new Error('Resposta sem corpo')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // Process complete SSE events (separated by double newlines)
    let boundary = buffer.indexOf('\n\n')
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      for (const line of block.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (!payload) continue
        try {
          onEvent(JSON.parse(payload))
        } catch {
          // ignore malformed chunk
        }
      }
      boundary = buffer.indexOf('\n\n')
    }
  }
}
