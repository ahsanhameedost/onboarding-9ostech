'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { BrandLogo } from '@/components/ui'
import { changePassword, getValidSession } from '@/lib/auth/client'
import { useAppRouter } from '@/lib/router'

// Shown to accounts an administrator created with a temporary password. The
// gate in App.tsx sends them here before the workspace or console opens.
export default function ChangePasswordPage() {
  const router = useAppRouter()
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let active = true
    void getValidSession().then((result) => {
      if (!active) return
      if (!result.ok) {
        router.replace('/sign-in')
        return
      }
      // Someone who no longer needs a change should not be stuck on this page.
      if (!result.session.user.must_change_password) {
        router.replace(result.session.user.is_admin ? '/admin' : '/workspace')
        return
      }
      setChecking(false)
    })
    return () => { active = false }
  }, [router])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (!currentPassword) {
      setError('Enter the temporary password you signed in with.')
      return
    }
    if (password.length < 8) {
      setError('The new password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('The two new passwords do not match.')
      return
    }

    setBusy(true)
    const { data, error: failure } = await changePassword(currentPassword, password)
    setBusy(false)

    if (failure || !data?.user) {
      setError(failure?.message || 'The password could not be changed.')
      return
    }

    setNotice('Password updated. Opening OakBoard...')
    const target = data.user.is_admin ? '/admin' : '/workspace'
    window.setTimeout(() => router.replace(target), 600)
  }

  if (checking) {
    return (
      <main className="auth-loader" aria-live="polite">
        <span className="auth-loader__spinner" aria-hidden="true" />
        <p>Checking your account...</p>
      </main>
    )
  }

  return (
    <main className="auth-wrap">
      <section className="auth-card" aria-label="Choose a new password">
        <div className="auth-form-side">
          <BrandLogo />
          <form className="form-panel active" onSubmit={handleSubmit}>
            {error && <div className="banner-err show"><span>{error}</span></div>}
            {notice && <div className="banner-ok show"><span>{notice}</span></div>}

            <p className="pending-sub" id="change-password-help">
              This account was created for you with a temporary password.
              Choose your own before continuing.
            </p>

            <div className="fld">
              <label htmlFor="cp-current">Temporary password</label>
              <div className="inp-wrap">
                <input
                  aria-describedby="change-password-help"
                  autoComplete="current-password"
                  autoFocus
                  id="cp-current"
                  onChange={(event) => { setError(''); setCurrentPassword(event.target.value) }}
                  placeholder="The password you were given"
                  type={visible ? 'text' : 'password'}
                  value={currentPassword}
                />
              </div>
            </div>

            <div className="fld">
              <label htmlFor="cp-new">New password</label>
              <div className="inp-wrap">
                <input
                  autoComplete="new-password"
                  id="cp-new"
                  onChange={(event) => { setError(''); setPassword(event.target.value) }}
                  placeholder="Min. 8 characters"
                  type={visible ? 'text' : 'password'}
                  value={password}
                />
              </div>
            </div>

            <div className="fld">
              <label htmlFor="cp-confirm">Confirm new password</label>
              <div className="inp-wrap">
                <input
                  autoComplete="new-password"
                  id="cp-confirm"
                  onChange={(event) => { setError(''); setConfirm(event.target.value) }}
                  placeholder="Repeat the new password"
                  type={visible ? 'text' : 'password'}
                  value={confirm}
                />
              </div>
            </div>

            <label className="remember-me">
              <input checked={visible} onChange={(event) => setVisible(event.target.checked)} type="checkbox" />
              <span>Show passwords</span>
            </label>

            <button className={`btn-submit ${busy ? 'loading' : ''}`} disabled={busy} type="submit">
              <span className="btn-spin" />
              <span className="btn-txt">Set new password</span>
            </button>
          </form>
        </div>
        <aside className="auth-visual" aria-hidden="true">
          <div className="auth-grid-pattern" />
          <div className="auth-ring auth-ring-top" />
          <div className="auth-ring auth-ring-bottom" />
          <div className="auth-visual-copy">
            <h1>Set your own password</h1>
            <p>Signing you in with your own password keeps the account yours alone.</p>
          </div>
        </aside>
      </section>
    </main>
  )
}
