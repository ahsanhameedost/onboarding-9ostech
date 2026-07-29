'use client'

import { useEffect, useState } from 'react'
import { Button, Icon, Modal, PageToolbar, StatusBanner } from '@/components/ui'
import { apiFetch } from '@/lib/api/client'
import { getValidSession } from '@/lib/auth/client'
import { useAppRouter } from '@/lib/router'

type AdminUser = {
  id: string
  email: string
  fullName: string
  role: 'admin' | 'member'
  isAdmin: boolean
  isRootAdmin: boolean
  verifiedAt: string | null
  isVerified: boolean
  lastSignInAt: string | null
  createdAt: string | null
  mustChangePassword: boolean
  failedLoginCount: number
  lockedUntil: string | null
  isLocked: boolean
  planCount: number
  activePlanCount: number
  loginCount: number
  activeSessionCount: number
  emailCount: number
}

type AdminPlanOwner = { id: string; email: string; fullName: string }

type AdminPlan = {
  id: string
  title: string
  role: string
  nWeeks: 2 | 4
  reportsTo: string
  collaboratesWith: string
  isArchived: boolean
  archivedAt: string | null
  createdAt: string | null
  updatedAt: string | null
  owner?: AdminPlanOwner
  plan?: {
    weeks?: Array<{ title?: string; goal?: string; days?: Array<{ day?: number; g?: number; title?: string }> }>
  } | null
}

type AdminSession = {
  id: string
  createdAt: string | null
  lastSeenAt: string | null
  expiresAt: string | null
  revokedAt: string | null
  isActive: boolean
}

type AdminEmailLog = {
  id: string
  planId: string | null
  recipient: string
  cc: string | null
  status: string
  error: string | null
  createdAt: string | null
}

type AdminUserDetail = {
  user: AdminUser
  plans: AdminPlan[]
  sessions: AdminSession[]
  emails: AdminEmailLog[]
}

type Overview = Record<string, number>

type DailyPoint = { day: string; signups: number; logins: number; plans: number }
type RecentSignin = { email: string; fullName: string; at: string | null }
type RecentPlan = { id: string; role: string; nWeeks: 2 | 4; email: string; fullName: string; at: string | null }

type AdminTab = 'overview' | 'users' | 'plans'
type PlanScope = 'all' | 'active' | 'archived'

const STAT_GROUPS: Array<{ heading: string; items: Array<[string, string]> }> = [
  {
    heading: 'Accounts',
    items: [
      ['total_users', 'Total users'],
      ['verified_users', 'Verified'],
      ['pending_users', 'Pending verification'],
      ['locked_users', 'Locked out'],
      ['admin_users', 'Administrators'],
      ['signups_7d', 'New signups (7d)'],
    ],
  },
  {
    heading: 'Onboarding plans',
    items: [
      ['total_plans', 'Total plans'],
      ['active_plans', 'Active'],
      ['archived_plans', 'Archived'],
      ['two_week_plans', '2-week plans'],
      ['four_week_plans', '4-week plans'],
      ['plans_7d', 'Created (7d)'],
    ],
  },
  {
    heading: 'Sign-in activity',
    items: [
      ['total_logins', 'Total sign-ins'],
      ['logins_24h', 'Sign-ins (24h)'],
      ['logins_7d', 'Sign-ins (7d)'],
      ['active_sessions', 'Active sessions'],
      ['emails_sent', 'Plan emails sent'],
      ['emails_failed', 'Plan emails failed'],
    ],
  },
]

function formatDateTime(value: string | null) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function formatDate(value: string | null) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleDateString(undefined, { dateStyle: 'medium' })
}

function relativeTime(value: string | null) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  const seconds = Math.round((Date.now() - parsed.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  return formatDate(value)
}

function initials(fullName: string, email: string) {
  const source = fullName.trim() || email.split('@')[0] || '?'
  const parts = source.split(/[\s._-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

/**
 * One metric, fourteen daily buckets. Deliberately a single-series chart per
 * metric rather than one grouped chart: the heading carries identity, so no
 * legend and no colour-only encoding is needed, and the brand green clears 3:1
 * against the card surface. Bars keep a 2px surface gap and the reader gets a
 * native tooltip plus a screen-reader table.
 */
function ActivityChart({ label, points, valueOf }: {
  label: string
  points: DailyPoint[]
  valueOf: (point: DailyPoint) => number
}) {
  const values = points.map(valueOf)
  const total = values.reduce((sum, value) => sum + value, 0)
  const peak = Math.max(...values, 1)
  const dayLabel = (day: string) =>
    new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

  return (
    <figure className="admin-chart">
      <figcaption>
        <span className="admin-chart__label">{label}</span>
        <span className="admin-chart__total">{total}</span>
        <span className="admin-chart__range">last 14 days</span>
      </figcaption>
      <div className="admin-chart__plot" role="img" aria-label={`${label}: ${total} in the last 14 days`}>
        {points.map((point, index) => {
          const value = values[index]
          return (
            <span
              className={`admin-chart__bar${value === 0 ? ' is-empty' : ''}`}
              key={point.day}
              style={{ height: `${Math.max((value / peak) * 100, value > 0 ? 8 : 2)}%` }}
              title={`${dayLabel(point.day)} — ${value} ${label.toLowerCase()}`}
            />
          )
        })}
      </div>
      <div className="admin-chart__axis" aria-hidden="true">
        <span>{dayLabel(points[0].day)}</span>
        <span>{dayLabel(points[points.length - 1].day)}</span>
      </div>
      <table className="admin-sr-only">
        <caption>{label} per day</caption>
        <tbody>
          {points.map((point, index) => (
            <tr key={point.day}><th scope="row">{point.day}</th><td>{values[index]}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

async function readJson<T>(response: Response): Promise<T | null> {
  return await response.json().catch(() => null) as T | null
}

export default function AdminPage() {
  const router = useAppRouter()
  const [access, setAccess] = useState<'checking' | 'granted' | 'denied'>('checking')
  const [tab, setTab] = useState<AdminTab>('overview')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [daily, setDaily] = useState<DailyPoint[]>([])
  const [recentSignins, setRecentSignins] = useState<RecentSignin[]>([])
  const [recentPlans, setRecentPlans] = useState<RecentPlan[]>([])
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [plans, setPlans] = useState<AdminPlan[] | null>(null)
  const [search, setSearch] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [scope, setScope] = useState<PlanScope>('all')
  const [refreshToken, setRefreshToken] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [detail, setDetail] = useState<AdminUserDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [planPreview, setPlanPreview] = useState<AdminPlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmAction, setConfirmAction] = useState<
    { kind: 'delete-user'; user: AdminUser } | { kind: 'delete-plan'; plan: AdminPlan } | null
  >(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({ full_name: '', email: '', password: '', role: 'member' })
  const [createError, setCreateError] = useState('')

  useEffect(() => {
    let active = true
    void getValidSession().then((result) => {
      if (!active) return
      if (!result.ok) {
        router.replace('/sign-in')
        return
      }
      setAccess(result.session.user.is_admin ? 'granted' : 'denied')
    })
    return () => { active = false }
  }, [router])

  // Debounce the search field so typing does not fire a request per keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => setActiveSearch(search.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  // Every list reloads from these two effects. Actions bump refreshToken rather
  // than re-fetching inline, which keeps the fetch logic in one place.
  useEffect(() => {
    if (access !== 'granted') return
    let active = true

    async function loadOverview() {
      const response = await apiFetch('/api/admin/overview', { cache: 'no-store' })
      const result = await readJson<{
        overview?: Overview
        daily?: DailyPoint[]
        recentSignins?: RecentSignin[]
        recentPlans?: RecentPlan[]
      }>(response)
      if (!active) return
      if (!response.ok || !result?.overview) {
        setError('The admin summary could not be loaded.')
        return
      }
      setOverview(result.overview)
      setDaily(result.daily ?? [])
      setRecentSignins(result.recentSignins ?? [])
      setRecentPlans(result.recentPlans ?? [])
    }

    void loadOverview()
    return () => { active = false }
  }, [access, refreshToken])

  useEffect(() => {
    if (access !== 'granted') return
    let active = true

    async function loadRows() {
      if (tab === 'overview') return
      if (tab === 'users') {
        const query = activeSearch ? `?search=${encodeURIComponent(activeSearch)}` : ''
        const response = await apiFetch(`/api/admin/users${query}`, { cache: 'no-store' })
        const result = await readJson<{ users?: AdminUser[] }>(response)
        if (!active) return
        if (response.ok && result?.users) setUsers(result.users)
        else { setUsers([]); setError('The user list could not be loaded.') }
        return
      }

      const params = new URLSearchParams({ scope })
      if (activeSearch) params.set('search', activeSearch)
      const response = await apiFetch(`/api/admin/plans?${params.toString()}`, { cache: 'no-store' })
      const result = await readJson<{ plans?: AdminPlan[] }>(response)
      if (!active) return
      if (response.ok && result?.plans) setPlans(result.plans)
      else { setPlans([]); setError('The plan list could not be loaded.') }
    }

    void loadRows()
    return () => { active = false }
  }, [access, activeSearch, refreshToken, scope, tab])

  function refreshAll() {
    setNotice('')
    setError('')
    setRefreshToken((current) => current + 1)
  }

  function openCreateUser() {
    setCreateForm({ full_name: '', email: '', password: '', role: 'member' })
    setCreateError('')
    setCreateOpen(true)
  }

  // Uses the Web Crypto API rather than Math.random so the suggested password
  // is not predictable.
  function suggestPassword() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*'
    const bytes = new Uint32Array(16)
    crypto.getRandomValues(bytes)
    const generated = Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('')
    setCreateForm((current) => ({ ...current, password: generated }))
  }

  async function createUser() {
    setCreateError('')
    setBusy(true)
    const response = await apiFetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createForm),
    })
    const result = await readJson<AdminUserDetail & { error?: string }>(response)
    setBusy(false)
    if (!response.ok || !result?.user) {
      setCreateError(result?.error || 'That account could not be created.')
      return
    }
    setCreateOpen(false)
    setNotice(`${result.user.email} was created as ${result.user.role === 'admin' ? 'an administrator' : 'a member'}.`)
    setTab('users')
    setRefreshToken((current) => current + 1)
  }

  async function openUserDetail(userId: string) {
    setDetailLoading(true)
    setError('')
    const response = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}`, { cache: 'no-store' })
    const result = await readJson<AdminUserDetail>(response)
    setDetailLoading(false)
    if (!response.ok || !result?.user) {
      setError('That user could not be opened.')
      return
    }
    setDetail(result)
  }

  async function runUserAction(userId: string, action: string, successMessage: string) {
    setBusy(true)
    setError('')
    const response = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    const result = await readJson<AdminUserDetail & { error?: string }>(response)
    setBusy(false)
    if (!response.ok || !result?.user) {
      setError(result?.error || 'That administrator action could not be completed.')
      return
    }
    setDetail(result)
    setNotice(successMessage)
    setRefreshToken((current) => current + 1)
  }

  async function deleteUser(user: AdminUser) {
    setBusy(true)
    setError('')
    const response = await apiFetch(`/api/admin/users/${encodeURIComponent(user.id)}`, { method: 'DELETE' })
    const result = await readJson<{ error?: string }>(response)
    setBusy(false)
    setConfirmAction(null)
    if (!response.ok) {
      setError(result?.error || 'That account could not be deleted.')
      return
    }
    setDetail(null)
    setNotice(`${user.email} and all of their plans were deleted.`)
    setRefreshToken((current) => current + 1)
  }

  async function togglePlanArchive(plan: AdminPlan) {
    setBusy(true)
    setError('')
    const action = plan.isArchived ? 'restore' : 'archive'
    const response = await apiFetch(`/api/admin/plans/${encodeURIComponent(plan.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    const result = await readJson<{ error?: string }>(response)
    setBusy(false)
    if (!response.ok) {
      setError(result?.error || 'That plan could not be updated.')
      return
    }
    setNotice(action === 'archive' ? 'Plan archived.' : 'Plan restored.')
    setRefreshToken((current) => current + 1)
    if (detail) await openUserDetail(detail.user.id)
  }

  async function deletePlan(plan: AdminPlan) {
    setBusy(true)
    setError('')
    const response = await apiFetch(`/api/admin/plans/${encodeURIComponent(plan.id)}`, { method: 'DELETE' })
    const result = await readJson<{ error?: string }>(response)
    setBusy(false)
    setConfirmAction(null)
    if (!response.ok) {
      setError(result?.error || 'That plan could not be deleted.')
      return
    }
    setNotice('Plan deleted.')
    setRefreshToken((current) => current + 1)
    if (detail) await openUserDetail(detail.user.id)
  }

  async function openPlanPreview(planId: string) {
    setError('')
    const response = await apiFetch(`/api/admin/plans/${encodeURIComponent(planId)}`, { cache: 'no-store' })
    const result = await readJson<{ plan?: AdminPlan }>(response)
    if (!response.ok || !result?.plan) {
      setError('That plan could not be opened.')
      return
    }
    setPlanPreview(result.plan)
  }

  if (access === 'checking') {
    return (
      <main className="auth-loader" aria-live="polite">
        <span className="auth-loader__spinner" aria-hidden="true" />
        <p>Checking administrator access...</p>
      </main>
    )
  }

  if (access === 'denied') {
    return (
      <main className="admin-denied">
        <div className="admin-denied__card">
          <div className="admin-denied__icon" aria-hidden="true"><Icon name="warning" /></div>
          <h1>Administrator access required</h1>
          <p>This account is not an OakBoard administrator. Ask a super administrator to grant access.</p>
          <Button icon="arrow-left" to="/workspace" variant="primary">Back to workspace</Button>
        </div>
      </main>
    )
  }

  return (
    <main className="admin-page">
      <PageToolbar
        backLabel="Workspace"
        backTo="/workspace"
        subtitle="Every account, plan, and sign-in across OakBoard"
        title="Admin Console"
        actions={(
          <>
            <Button icon="plus" onClick={openCreateUser} type="button" variant="primary">Add user</Button>
            <Button icon="check" onClick={() => void refreshAll()} type="button" variant="secondary">Refresh</Button>
          </>
        )}
      />

      <div className="admin-body">
        {error && <StatusBanner tone="error">{error}</StatusBanner>}
        {notice && !error && <StatusBanner tone="success">{notice}</StatusBanner>}

        <section className="admin-hero" aria-label="Key figures">
          {([
            ['total_users', 'Users', 'verified_users', 'verified'],
            ['total_plans', 'Onboarding plans', 'active_plans', 'active'],
            ['total_logins', 'Sign-ins', 'active_sessions', 'sessions live'],
            ['emails_sent', 'Plan emails', 'emails_failed', 'failed'],
          ] as const).map(([key, label, subKey, subLabel]) => (
            <article className="admin-hero__tile" key={key}>
              <span className="admin-hero__value">{overview ? overview[key] ?? 0 : '—'}</span>
              <span className="admin-hero__label">{label}</span>
              <span className="admin-hero__sub">{overview ? overview[subKey] ?? 0 : '—'} {subLabel}</span>
            </article>
          ))}
        </section>

        <section className="admin-stats" aria-label="OakBoard summary">
          {STAT_GROUPS.map((group) => (
            <article className="admin-stat-group" key={group.heading}>
              <h2>{group.heading}</h2>
              <div className="admin-stat-grid">
                {group.items.map(([key, label]) => (
                  <div className="admin-stat" key={key}>
                    <span className="admin-stat__value">{overview ? overview[key] ?? 0 : '—'}</span>
                    <span className="admin-stat__label">{label}</span>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section>

        <div className="admin-controls">
          <div className="admin-tabs" role="tablist" aria-label="Admin sections">
            <button
              aria-selected={tab === 'overview'}
              className={tab === 'overview' ? 'active' : ''}
              onClick={() => { setTab('overview'); setNotice('') }}
              role="tab"
              type="button"
            >Overview</button>
            <button
              aria-selected={tab === 'users'}
              className={tab === 'users' ? 'active' : ''}
              onClick={() => { setTab('users'); setNotice('') }}
              role="tab"
              type="button"
            >Users {users ? `(${users.length})` : ''}</button>
            <button
              aria-selected={tab === 'plans'}
              className={tab === 'plans' ? 'active' : ''}
              onClick={() => { setTab('plans'); setNotice('') }}
              role="tab"
              type="button"
            >Onboarding plans {plans ? `(${plans.length})` : ''}</button>
          </div>

          <div className="admin-filters">
            {tab !== 'overview' && tab === 'plans' && (
              <select
                aria-label="Filter plans"
                onChange={(event) => setScope(event.target.value as PlanScope)}
                value={scope}
              >
                <option value="all">All plans</option>
                <option value="active">Active only</option>
                <option value="archived">Archived only</option>
              </select>
            )}
            {tab !== 'overview' && (
              <input
                aria-label={tab === 'users' ? 'Search users' : 'Search plans'}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={tab === 'users' ? 'Search name or email...' : 'Search role, title, or owner...'}
                type="search"
                value={search}
              />
            )}
          </div>
        </div>

        {tab === 'overview' && (
          <>
            <section className="admin-charts" aria-label="Activity over the last 14 days">
              {daily.length > 0 ? (
                <>
                  <ActivityChart label="Sign-ins" points={daily} valueOf={(point) => point.logins} />
                  <ActivityChart label="Plans created" points={daily} valueOf={(point) => point.plans} />
                  <ActivityChart label="New signups" points={daily} valueOf={(point) => point.signups} />
                </>
              ) : (
                <p className="admin-muted">Loading activity...</p>
              )}
            </section>

            <div className="admin-feeds">
              <section className="admin-feed" aria-labelledby="admin-recent-signins">
                <h3 id="admin-recent-signins">Latest sign-ins</h3>
                {recentSignins.length === 0 && <p className="admin-muted">No sign-ins recorded yet.</p>}
                <ul className="admin-list">
                  {recentSignins.map((entry, index) => (
                    <li key={`${entry.email}-${entry.at}-${index}`}>
                      <div className="admin-feed__who">
                        <span className="admin-avatar" aria-hidden="true">{initials(entry.fullName, entry.email)}</span>
                        <div>
                          <strong>{entry.fullName || entry.email}</strong>
                          <span>{entry.email}</span>
                        </div>
                      </div>
                      <span className="admin-feed__when" title={formatDateTime(entry.at)}>{relativeTime(entry.at)}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="admin-feed" aria-labelledby="admin-recent-plans">
                <h3 id="admin-recent-plans">Latest plans created</h3>
                {recentPlans.length === 0 && <p className="admin-muted">No plans created yet.</p>}
                <ul className="admin-list">
                  {recentPlans.map((entry) => (
                    <li key={entry.id}>
                      <div className="admin-feed__who">
                        <span className="admin-avatar" aria-hidden="true">{initials(entry.fullName, entry.email)}</span>
                        <div>
                          <strong>{entry.role}</strong>
                          <span>{entry.nWeeks} weeks · {entry.fullName || entry.email}</span>
                        </div>
                      </div>
                      <div className="admin-list__actions">
                        <span className="admin-feed__when" title={formatDateTime(entry.at)}>{relativeTime(entry.at)}</span>
                        <button onClick={() => void openPlanPreview(entry.id)} type="button">View</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </>
        )}

        {tab === 'users' && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">User</th>
                  <th scope="col">Status</th>
                  <th scope="col">Plans</th>
                  <th scope="col">Sign-ins</th>
                  <th scope="col">Last sign-in</th>
                  <th scope="col">Joined</th>
                  <th scope="col"><span className="admin-sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {users === null && <tr><td colSpan={7} className="admin-table__empty">Loading users...</td></tr>}
                {users?.length === 0 && <tr><td colSpan={7} className="admin-table__empty">No users match this search.</td></tr>}
                {users?.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="admin-user-cell">
                        <strong>{user.fullName || '—'}</strong>
                        <span>{user.email}</span>
                      </div>
                    </td>
                    <td>
                      <div className="admin-badges">
                        {user.isRootAdmin && <span className="admin-badge admin-badge--root">Super admin</span>}
                        {user.isAdmin && !user.isRootAdmin && <span className="admin-badge admin-badge--admin">Admin</span>}
                        <span className={`admin-badge ${user.isVerified ? 'admin-badge--ok' : 'admin-badge--pending'}`}>
                          {user.isVerified ? 'Verified' : 'Pending'}
                        </span>
                        {user.isLocked && <span className="admin-badge admin-badge--locked">Locked</span>}
                        {user.mustChangePassword && <span className="admin-badge admin-badge--pending">Temp password</span>}
                      </div>
                    </td>
                    <td>{user.activePlanCount} active <span className="admin-muted">/ {user.planCount} total</span></td>
                    <td>{user.loginCount} <span className="admin-muted">({user.activeSessionCount} active)</span></td>
                    <td>{formatDateTime(user.lastSignInAt)}</td>
                    <td>{formatDate(user.createdAt)}</td>
                    <td className="admin-table__actions">
                      <Button icon="info" onClick={() => void openUserDetail(user.id)} type="button" variant="secondary">View</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'plans' && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Plan</th>
                  <th scope="col">Created by</th>
                  <th scope="col">Length</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last updated</th>
                  <th scope="col"><span className="admin-sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {plans === null && <tr><td colSpan={6} className="admin-table__empty">Loading plans...</td></tr>}
                {plans?.length === 0 && <tr><td colSpan={6} className="admin-table__empty">No plans match this search.</td></tr>}
                {plans?.map((plan) => (
                  <tr key={plan.id}>
                    <td>
                      <div className="admin-user-cell">
                        <strong>{plan.role}</strong>
                        {plan.reportsTo && <span>Reports to {plan.reportsTo}</span>}
                      </div>
                    </td>
                    <td>
                      <div className="admin-user-cell">
                        <strong>{plan.owner?.fullName || '—'}</strong>
                        <span>{plan.owner?.email || '—'}</span>
                      </div>
                    </td>
                    <td>{plan.nWeeks} weeks</td>
                    <td>
                      <span className={`admin-badge ${plan.isArchived ? 'admin-badge--pending' : 'admin-badge--ok'}`}>
                        {plan.isArchived ? 'Archived' : 'Active'}
                      </span>
                    </td>
                    <td>{formatDateTime(plan.updatedAt)}</td>
                    <td className="admin-table__actions">
                      <Button icon="info" onClick={() => void openPlanPreview(plan.id)} type="button" variant="secondary">View</Button>
                      <Button disabled={busy} icon="archive" onClick={() => void togglePlanArchive(plan)} type="button" variant="soft">
                        {plan.isArchived ? 'Restore' : 'Archive'}
                      </Button>
                      <Button disabled={busy} icon="trash" onClick={() => setConfirmAction({ kind: 'delete-plan', plan })} type="button" variant="danger">Delete</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        icon="info"
        onClose={() => setDetail(null)}
        open={detail !== null || detailLoading}
        subtitle={detail ? detail.user.email : 'Loading account...'}
        title={detail ? detail.user.fullName || 'Account detail' : 'Account detail'}
        footer={detail && (
          <>
            <Button disabled={busy} onClick={() => setDetail(null)} type="button" variant="secondary">Close</Button>
            <Button
              disabled={busy}
              icon="archive"
              onClick={() => void runUserAction(detail.user.id, 'revoke-sessions', 'All sessions revoked. The user must sign in again.')}
              type="button"
              variant="soft"
            >Force sign-out</Button>
            {detail.user.isLocked ? (
              <Button disabled={busy} icon="check" onClick={() => void runUserAction(detail.user.id, 'unlock', 'Account unlocked.')} type="button" variant="soft">Unlock</Button>
            ) : (
              <Button disabled={busy || detail.user.isRootAdmin} icon="warning" onClick={() => void runUserAction(detail.user.id, 'lock', 'Account locked for 15 minutes.')} type="button" variant="secondary">Lock 15 min</Button>
            )}
            {detail.user.role === 'admin' ? (
              <Button disabled={busy || detail.user.isRootAdmin} onClick={() => void runUserAction(detail.user.id, 'demote', 'Administrator access removed.')} type="button" variant="secondary">Remove admin</Button>
            ) : (
              <Button disabled={busy} icon="plus" onClick={() => void runUserAction(detail.user.id, 'promote', 'Administrator access granted.')} type="button" variant="secondary">Make admin</Button>
            )}
            <Button disabled={busy || detail.user.isRootAdmin} icon="trash" onClick={() => setConfirmAction({ kind: 'delete-user', user: detail.user })} type="button" variant="danger">Delete user</Button>
          </>
        )}
      >
        {detailLoading && <p>Loading account...</p>}
        {detail && (
          <div className="admin-detail">
            {detail.user.isRootAdmin && (
              <StatusBanner tone="info">
                This is the super administrator named in the server configuration. It cannot be locked, demoted, or deleted.
              </StatusBanner>
            )}

            <div className="admin-detail__grid">
              <div><span>Role</span><strong>{detail.user.role === 'admin' ? 'Administrator' : 'Member'}</strong></div>
              <div><span>Email verified</span><strong>{detail.user.isVerified ? formatDate(detail.user.verifiedAt) : 'Not verified'}</strong></div>
              <div><span>Joined</span><strong>{formatDateTime(detail.user.createdAt)}</strong></div>
              <div><span>Last sign-in</span><strong>{formatDateTime(detail.user.lastSignInAt)}</strong></div>
              <div><span>Total sign-ins</span><strong>{detail.user.loginCount}</strong></div>
              <div><span>Active sessions</span><strong>{detail.user.activeSessionCount}</strong></div>
              <div><span>Failed attempts</span><strong>{detail.user.failedLoginCount}</strong></div>
              <div><span>Locked until</span><strong>{detail.user.isLocked ? formatDateTime(detail.user.lockedUntil) : 'Not locked'}</strong></div>
              <div><span>Password</span><strong>{detail.user.mustChangePassword ? 'Temporary — must change' : 'Set by the user'}</strong></div>
            </div>

            <h4>Onboarding plans ({detail.plans.length})</h4>
            {detail.plans.length === 0 && <p className="admin-muted">This user has not created any plans.</p>}
            {detail.plans.length > 0 && (
              <ul className="admin-list">
                {detail.plans.map((plan) => (
                  <li key={plan.id}>
                    <div>
                      <strong>{plan.role}</strong>
                      <span>{plan.nWeeks} weeks · updated {formatDateTime(plan.updatedAt)}</span>
                    </div>
                    <div className="admin-list__actions">
                      <span className={`admin-badge ${plan.isArchived ? 'admin-badge--pending' : 'admin-badge--ok'}`}>
                        {plan.isArchived ? 'Archived' : 'Active'}
                      </span>
                      <button onClick={() => void openPlanPreview(plan.id)} type="button">View</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <h4>Sign-in history ({detail.sessions.length} most recent)</h4>
            {detail.sessions.length === 0 && <p className="admin-muted">This user has never signed in.</p>}
            {detail.sessions.length > 0 && (
              <ul className="admin-list">
                {detail.sessions.map((session) => (
                  <li key={session.id}>
                    <div>
                      <strong>{formatDateTime(session.createdAt)}</strong>
                      <span>Last active {formatDateTime(session.lastSeenAt)}</span>
                    </div>
                    <span className={`admin-badge ${session.isActive ? 'admin-badge--ok' : 'admin-badge--pending'}`}>
                      {session.isActive ? 'Active' : session.revokedAt ? 'Revoked' : 'Expired'}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <h4>Plan emails ({detail.emails.length} most recent)</h4>
            {detail.emails.length === 0 && <p className="admin-muted">This user has not emailed any plans.</p>}
            {detail.emails.length > 0 && (
              <ul className="admin-list">
                {detail.emails.map((log) => (
                  <li key={log.id}>
                    <div>
                      <strong>{log.recipient}</strong>
                      <span>{formatDateTime(log.createdAt)}{log.error ? ` · ${log.error}` : ''}</span>
                    </div>
                    <span className={`admin-badge ${log.status === 'sent' ? 'admin-badge--ok' : 'admin-badge--locked'}`}>
                      {log.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Modal>

      <Modal
        icon="list"
        onClose={() => setPlanPreview(null)}
        open={planPreview !== null}
        subtitle={planPreview?.owner ? `Created by ${planPreview.owner.fullName || planPreview.owner.email}` : undefined}
        title={planPreview?.role || 'Plan'}
        footer={<Button onClick={() => setPlanPreview(null)} type="button" variant="secondary">Close</Button>}
      >
        {planPreview && (
          <div className="admin-detail">
            <div className="admin-detail__grid">
              <div><span>Length</span><strong>{planPreview.nWeeks} weeks</strong></div>
              <div><span>Reports to</span><strong>{planPreview.reportsTo || '—'}</strong></div>
              <div><span>Collaborates with</span><strong>{planPreview.collaboratesWith || '—'}</strong></div>
              <div><span>Status</span><strong>{planPreview.isArchived ? 'Archived' : 'Active'}</strong></div>
              <div><span>Created</span><strong>{formatDateTime(planPreview.createdAt)}</strong></div>
              <div><span>Updated</span><strong>{formatDateTime(planPreview.updatedAt)}</strong></div>
            </div>

            {(planPreview.plan?.weeks || []).map((week, weekIndex) => (
              <div className="admin-week" key={weekIndex}>
                <h4>Week {weekIndex + 1}{week.title ? ` — ${week.title}` : ''}</h4>
                {week.goal && <p className="admin-muted">{week.goal}</p>}
                <ul className="admin-list admin-list--compact">
                  {(week.days || []).map((day, dayIndex) => (
                    <li key={dayIndex}>
                      <div>
                        <strong>Day {day.g || day.day || dayIndex + 1}</strong>
                        <span>{day.title || '—'}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {!planPreview.plan?.weeks?.length && <p className="admin-muted">This plan has no stored week breakdown.</p>}
          </div>
        )}
      </Modal>

      <Modal
        icon="plus"
        onClose={() => !busy && setCreateOpen(false)}
        open={createOpen}
        subtitle="The account is created already verified, so they can sign in immediately."
        title="Add a user"
        footer={(
          <>
            <Button disabled={busy} onClick={() => setCreateOpen(false)} type="button" variant="secondary">Cancel</Button>
            <Button disabled={busy} icon="plus" onClick={() => void createUser()} type="button" variant="primary">
              {busy ? 'Creating...' : 'Create user'}
            </Button>
          </>
        )}
      >
        <div className="admin-form">
          {createError && <StatusBanner tone="error">{createError}</StatusBanner>}

          <label className="ob-field">
            <span>Full name</span>
            <input
              autoComplete="off"
              onChange={(event) => setCreateForm((c) => ({ ...c, full_name: event.target.value }))}
              placeholder="Jane Doe"
              value={createForm.full_name}
            />
          </label>

          <label className="ob-field">
            <span>Work email</span>
            <input
              autoComplete="off"
              onChange={(event) => setCreateForm((c) => ({ ...c, email: event.target.value }))}
              placeholder="jane@9ostech.com"
              type="email"
              value={createForm.email}
            />
          </label>

          <label className="ob-field">
            <span>Temporary password</span>
            <div className="admin-form__row">
              <input
                autoComplete="new-password"
                onChange={(event) => setCreateForm((c) => ({ ...c, password: event.target.value }))}
                placeholder="At least 8 characters"
                type="text"
                value={createForm.password}
              />
              <button className="admin-form__generate" onClick={suggestPassword} type="button">Generate</button>
            </div>
          </label>

          <label className="ob-field">
            <span>Role</span>
            <select
              onChange={(event) => setCreateForm((c) => ({ ...c, role: event.target.value }))}
              value={createForm.role}
            >
              <option value="member">Member — can create and manage their own plans</option>
              <option value="admin">Administrator — full access to this console</option>
            </select>
          </label>

          <StatusBanner tone="info">
            This password is temporary and is shown in plain text so you can copy it now.
            OakBoard does not email it — share it with the person directly. They must
            replace it the first time they sign in.
          </StatusBanner>
        </div>
      </Modal>

      <Modal
        icon="warning"
        onClose={() => !busy && setConfirmAction(null)}
        open={confirmAction !== null}
        subtitle="This action cannot be undone."
        title={confirmAction?.kind === 'delete-user' ? 'Delete this account?' : 'Delete this plan?'}
        footer={(
          <>
            <Button disabled={busy} onClick={() => setConfirmAction(null)} type="button" variant="secondary">Cancel</Button>
            <Button
              disabled={busy}
              icon="trash"
              onClick={() => {
                if (confirmAction?.kind === 'delete-user') void deleteUser(confirmAction.user)
                if (confirmAction?.kind === 'delete-plan') void deletePlan(confirmAction.plan)
              }}
              type="button"
              variant="danger"
            >{busy ? 'Deleting...' : 'Yes, delete'}</Button>
          </>
        )}
      >
        {confirmAction?.kind === 'delete-user' && (
          <p>
            <strong>{confirmAction.user.email}</strong> will be permanently deleted, along with
            {' '}<strong>{confirmAction.user.planCount} onboarding plan(s)</strong>, their sessions, and their email history.
          </p>
        )}
        {confirmAction?.kind === 'delete-plan' && (
          <p>
            The plan <strong>{confirmAction.plan.role}</strong>
            {confirmAction.plan.owner ? <> owned by <strong>{confirmAction.plan.owner.email}</strong></> : null}
            {' '}will be permanently deleted.
          </p>
        )}
      </Modal>
    </main>
  )
}
