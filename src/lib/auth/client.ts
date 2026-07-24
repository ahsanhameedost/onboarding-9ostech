const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, '') || '/api'

export type AuthUser = {
  id: string
  email?: string
  email_confirmed_at?: string | null
  last_sign_in_at?: string | null
  user_metadata: {
    full_name?: string
    name?: string
    display_name?: string
  }
}

export type AuthSession = {
  user: AuthUser
  expires_at: number
}

export type AuthFailure = {
  code?: string
  message: string
  status?: number
}

export type SessionCheck =
  | { ok: true; session: AuthSession }
  | { ok: false; reason: 'missing' | 'expired' | 'timeout' | 'error'; message?: string }

type AuthResult<T> = {
  data: T | null
  error: AuthFailure | null
}

let cachedSession: AuthSession | null = null
let pendingSessionCheck: Promise<SessionCheck> | null = null

function sessionIsCurrent(session: AuthSession | null): session is AuthSession {
  return Boolean(session && session.expires_at * 1000 > Date.now())
}

function cacheSession(session: AuthSession | null) {
  cachedSession = sessionIsCurrent(session) ? session : null
}

function resolveAuthUrl(path: string) {
  return `${configuredBaseUrl}/auth/${path}`
}

async function authRequest<T>(path: string, init: RequestInit = {}): Promise<AuthResult<T>> {
  try {
    const headers = new Headers(init.headers)
    headers.set('Accept', 'application/json')
    if (init.body) headers.set('Content-Type', 'application/json')

    const response = await fetch(resolveAuthUrl(path), {
      ...init,
      credentials: 'same-origin',
      headers,
    })
    const payload = await response.json().catch(() => null) as (T & { error?: string; code?: string }) | null
    if (!response.ok) {
      return {
        data: null,
        error: {
          code: payload?.code,
          message: payload?.error || 'OakBoard could not complete this account request.',
          status: response.status,
        },
      }
    }
    return { data: payload, error: null }
  } catch (caught) {
    return {
      data: null,
      error: {
        code: 'network_error',
        message: caught instanceof Error ? caught.message : 'The OakBoard server could not be reached.',
      },
    }
  }
}

export async function getValidSession(): Promise<SessionCheck> {
  if (sessionIsCurrent(cachedSession)) {
    return { ok: true, session: cachedSession }
  }
  if (!pendingSessionCheck) {
    pendingSessionCheck = (async () => {
      const result = await authRequest<{ session: AuthSession }>('session', { cache: 'no-store' })
      if (result.error || !result.data?.session) {
        cacheSession(null)
        return {
          ok: false,
          reason: result.error?.status === 401 ? 'missing' : 'error',
          message: result.error?.message,
        } satisfies SessionCheck
      }
      if (!sessionIsCurrent(result.data.session)) {
        cacheSession(null)
        return { ok: false, reason: 'expired' } satisfies SessionCheck
      }
      cacheSession(result.data.session)
      return { ok: true, session: result.data.session } satisfies SessionCheck
    })().finally(() => {
      pendingSessionCheck = null
    })
  }
  return pendingSessionCheck
}

async function authRequestWithSession<T extends { session: AuthSession }>(
  path: string,
  init: RequestInit,
): Promise<AuthResult<T>> {
  const result = await authRequest<T>(path, init)
  if (result.data?.session) {
    cacheSession(result.data.session)
  } else if (result.error?.status === 401) {
    cacheSession(null)
  }
  return result
}

export function signInWithPassword(email: string, password: string, remember: boolean) {
  return authRequestWithSession<{ session: AuthSession; user: AuthUser }>('signin', {
    method: 'POST',
    body: JSON.stringify({ email, password, remember }),
  })
}

export function signUpWithPassword(email: string, password: string, fullName: string) {
  return authRequest<{ user: AuthUser; verification_required: boolean }>('signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, full_name: fullName }),
  })
}

export function verifySignupOtp(email: string, code: string) {
  return authRequestWithSession<{ session: AuthSession; user: AuthUser }>('verify', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  })
}

export function resendSignupOtp(email: string) {
  return authRequest<{ ok: boolean }>('resend', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export function requestPasswordReset(email: string) {
  return authRequest<{ ok: boolean }>('password-reset', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export function confirmPasswordReset(token: string, password: string) {
  return authRequestWithSession<{ session: AuthSession; user: AuthUser }>('password-reset-confirm', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  })
}

export async function signOut() {
  const csrf = readCookie('oakboard_csrf')
  await authRequest<{ ok: boolean }>('signout', {
    method: 'POST',
    headers: csrf ? { 'X-CSRF-Token': csrf } : undefined,
  })
  cacheSession(null)
  localStorage.removeItem('obf_plan_data')
  sessionStorage.removeItem('obf_plan_data')
}

export function readCookie(name: string) {
  const prefix = `${name}=`
  return document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length) ?? ''
}
