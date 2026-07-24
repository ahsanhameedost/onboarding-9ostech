import { readCookie } from '@/lib/auth/client'

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, '') || '/api'

function resolveApiUrl(input: RequestInfo | URL) {
  if (typeof input !== 'string' || !input.startsWith('/api')) return input
  return `${configuredBaseUrl}${input.slice(4)}`
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  const method = (init.method || 'GET').toUpperCase()
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = readCookie('oakboard_csrf')
    if (csrf) headers.set('X-CSRF-Token', csrf)
  }
  headers.set('Accept', 'application/json')

  return fetch(resolveApiUrl(input), {
    ...init,
    headers,
    credentials: 'same-origin',
  })
}
