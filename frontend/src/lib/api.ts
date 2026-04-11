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
