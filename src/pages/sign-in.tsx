'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import Link from '@/components/app-link'
import { BrandLogo } from '@/components/ui'
import {
  confirmPasswordReset,
  getValidSession,
  requestPasswordReset,
  resendSignupOtp,
  signInWithPassword,
  signUpWithPassword,
  verifySignupOtp,
} from '@/lib/auth/client'
import { useAppRouter } from '@/lib/router'

type AuthTab = 'signin' | 'signup' | 'pending' | 'reset'
type PasswordVisibility = {
  signin: boolean
  signup: boolean
  confirm: boolean
  reset: boolean
  resetConfirm: boolean
}

const orgDomain = '@9ostech.com'
const REMEMBER_EMAIL_KEY = 'oakboard_remembered_email'
const PENDING_SIGNUP_EMAIL_KEY = 'oakboard_pending_signup_email'

function isOrgEmail(email: string) {
  return email.trim().toLowerCase().endsWith(orgDomain)
}

function getPasswordScore(password: string) {
  let score = 0
  if (password.length >= 8) score += 1
  if (password.length >= 12) score += 1
  if (/[A-Z]/.test(password)) score += 1
  if (/[0-9]/.test(password)) score += 1
  if (/[^A-Za-z0-9]/.test(password)) score += 1
  return Math.min(score, 4)
}

type AuthFailure = {
  code?: string
  message?: string
  status?: number
}

function formatAuthError(failure: string | AuthFailure) {
  const message = typeof failure === 'string' ? failure : failure.message || ''
  const code = typeof failure === 'string' ? '' : failure.code || ''
  const lower = message.toLowerCase()
  if (code === 'email_address_not_authorized') {
    return 'Verification email cannot be sent to this address yet. Contact OakBoard support.'
  }
  if (code === 'over_email_send_rate_limit') {
    return 'The verification email limit has been reached. Please wait before trying again.'
  }
  if (code === 'email_exists' || code === 'user_already_exists') {
    return 'This email is already registered. Try signing in instead.'
  }
  if (code === 'email_provider_disabled') {
    return 'New email accounts are currently disabled. Contact OakBoard support.'
  }
  if (lower.includes('email not confirmed')) {
    return 'Please confirm your email first — check your inbox.'
  }
  if (lower.includes('invalid login') || lower.includes('invalid')) {
    return "Incorrect email or password. If you're new to OakBoard, create an account."
  }
  if (lower.includes('already registered')) {
    return 'This email is already registered. Try signing in instead.'
  }
  if (!message || message === '{}' || message === '[]' || message === '[object Object]') {
    const diagnostic = code || (typeof failure === 'string' ? '' : failure.status ? `HTTP ${failure.status}` : '')
    return `Account request failed${diagnostic ? ` (${diagnostic})` : ''}. Please contact OakBoard support.`
  }
  return message
}

function formatOtpError(message: string) {
  const lower = message.toLowerCase()
  if (lower.includes('expired') || lower.includes('invalid') || lower.includes('token')) {
    return 'That code is invalid or has expired. Check the code or request a new one.'
  }
  if (lower.includes('rate') || lower.includes('too many')) {
    return 'Too many attempts. Please wait a moment before trying again.'
  }
  return message
}

function FieldIcon({ type }: { type: 'email' | 'lock' | 'user' }) {
  if (type === 'email') {
    return (
      <svg className="auth-input-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" />
        <path d="M1.5 5.5l6.5 4 6.5-4" />
      </svg>
    )
  }

  if (type === 'user') {
    return (
      <svg className="auth-input-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <circle cx="8" cy="5.5" r="2.5" />
        <path d="M2.5 13s0-4 5.5-4 5.5 4 5.5 4" />
      </svg>
    )
  }

  return (
    <svg className="auth-input-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5 7V5a3 3 0 016 0v2" />
    </svg>
  )
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M1.5 8s2.5-4 6.5-4 6.5 4 6.5 4-2.5 4-6.5 4-6.5-4-6.5-4z" />
      {hidden ? <circle cx="8" cy="8" r="1.8" /> : <line x1="1.5" y1="1.5" x2="14.5" y2="14.5" />}
    </svg>
  )
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="7" cy="7" r="5.5" />
      <path d="M7 4.5v3M7 9.5h.01" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M2.5 7l3 3 6-6" />
    </svg>
  )
}

export default function LoginPage() {
  const router = useAppRouter()
  const [tab, setTab] = useState<AuthTab>('signin')
  const [signinEmail, setSigninEmail] = useState('')
  const [signinPassword, setSigninPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [signupName, setSignupName] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupConfirm, setSignupConfirm] = useState('')
  const [resetToken] = useState(() => new URLSearchParams(window.location.search).get('reset_token') || '')
  const [resetPassword, setResetPassword] = useState('')
  const [resetConfirm, setResetConfirm] = useState('')
  const [pendingEmail, setPendingEmail] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [verificationError, setVerificationError] = useState<string | null>(null)
  const [verificationOk, setVerificationOk] = useState<string | null>(null)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [visible, setVisible] = useState<PasswordVisibility>({
    signin: false,
    signup: false,
    confirm: false,
    reset: false,
    resetConfirm: false,
  })
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [signinError, setSigninError] = useState<string | null>(null)
  const [signinOk, setSigninOk] = useState<string | null>(null)
  const [signupError, setSignupError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'signin' | 'signup' | 'forgot' | 'verify' | 'resend' | 'reset' | null>(null)

  const passwordStrength = useMemo(() => {
    if (!signupPassword) return null
    const levels = [
      { width: '20%', color: '#e05555', label: 'Very weak' },
      { width: '40%', color: '#e07530', label: 'Weak' },
      { width: '60%', color: '#d4a017', label: 'Fair' },
      { width: '80%', color: '#2f9e44', label: 'Strong' },
      { width: '100%', color: '#24B34B', label: 'Very strong' },
    ]
    return levels[getPasswordScore(signupPassword)]
  }, [signupPassword])

  const passwordConfirmation = useMemo(() => {
    if (!signupConfirm) {
      return {
        color: '#98a2b3',
        label: 'Repeat your password to confirm',
        state: 'pending',
        width: '0%',
      }
    }
    if (signupPassword === signupConfirm) {
      return {
        color: '#2f9e44',
        label: 'Passwords match',
        state: 'match',
        width: '100%',
      }
    }
    return {
      color: '#d64545',
      label: 'Passwords do not match',
      state: 'mismatch',
      width: '100%',
    }
  }, [signupConfirm, signupPassword])

  useEffect(() => {
    if (resetToken) {
      queueMicrotask(() => setTab('reset'))
      return
    }

    const rememberedEmail = localStorage.getItem(REMEMBER_EMAIL_KEY)
    if (rememberedEmail) {
      queueMicrotask(() => {
        setSigninEmail(rememberedEmail)
        setRememberMe(true)
      })
    }

    const pendingSignupEmail = sessionStorage.getItem(PENDING_SIGNUP_EMAIL_KEY)
    if (pendingSignupEmail && isOrgEmail(pendingSignupEmail)) {
      queueMicrotask(() => {
        setPendingEmail(pendingSignupEmail)
        setTab('pending')
      })
    }

    let active = true
    getValidSession().then((result) => {
      if (active && result.ok) {
        router.replace('/workspace')
      }
    })
    return () => {
      active = false
    }
  }, [resetToken, router])

  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = window.setTimeout(() => {
      setResendCooldown((current) => Math.max(0, current - 1))
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [resendCooldown])

  function clearErrors() {
    setFieldErrors({})
    setSigninError(null)
    setSigninOk(null)
    setSignupError(null)
    setVerificationError(null)
    setVerificationOk(null)
  }

  function switchTab(nextTab: AuthTab) {
    clearErrors()
    setTab(nextTab)
  }

  function toggleVisibility(key: keyof PasswordVisibility) {
    setVisible((current) => ({ ...current, [key]: !current[key] }))
  }

  async function handleSignIn(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    clearErrors()

    const errors: Record<string, string> = {}
    if (!signinEmail || !isOrgEmail(signinEmail)) {
      errors.signinEmail = `Please enter a valid ${orgDomain} email`
    }
    if (!signinPassword) {
      errors.signinPassword = 'Password is required'
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    setBusy('signin')
    const { data, error } = await signInWithPassword(signinEmail.trim(), signinPassword, rememberMe)
    setBusy(null)

    if (error) {
      setSigninError(formatAuthError(error))
      return
    }

    setSigninOk('Signed in! Redirecting...')
    try {
      if (rememberMe) {
        localStorage.setItem(REMEMBER_EMAIL_KEY, signinEmail.trim())
      } else {
        localStorage.removeItem(REMEMBER_EMAIL_KEY)
      }
      localStorage.setItem(
        'obf_session_cache',
        JSON.stringify({
          timestamp: Date.now(),
          email: data?.session?.user?.email || data?.user?.email || signinEmail,
        }),
      )
    } catch (error) {
      console.error('Unable to cache local session:', error)
    }
    window.setTimeout(() => router.replace('/workspace'), 700)
  }

  async function handleSignUp(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    clearErrors()

    const errors: Record<string, string> = {}
    if (!signupName.trim()) errors.signupName = 'Full name is required'
    if (!signupEmail || !isOrgEmail(signupEmail)) {
      errors.signupEmail = `Must be a valid ${orgDomain} email`
    }
    if (!signupPassword || signupPassword.length < 8) {
      errors.signupPassword = 'Password must be at least 8 characters'
    }
    if (signupPassword !== signupConfirm) {
      errors.signupConfirm = 'Passwords do not match'
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    setBusy('signup')
    const normalizedEmail = signupEmail.trim().toLowerCase()
    const { error } = await signUpWithPassword(normalizedEmail, signupPassword, signupName.trim())
    setBusy(null)

    if (error) {
      console.error('OakBoard signup failed', {
        code: error.code,
        message: error.message,
        status: error.status,
      })
      setSignupError(formatAuthError(error))
      return
    }

    setPendingEmail(normalizedEmail)
    setVerificationCode('')
    setResendCooldown(30)
    sessionStorage.setItem(PENDING_SIGNUP_EMAIL_KEY, normalizedEmail)
    setTab('pending')
  }

  async function handleVerifyCode(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    setVerificationError(null)
    setVerificationOk(null)

    if (!pendingEmail || !isOrgEmail(pendingEmail)) {
      setVerificationError('Your signup email is missing. Please create the account again.')
      return
    }
    if (!/^\d{6}$/.test(verificationCode)) {
      setVerificationError('Enter the complete 6-digit verification code.')
      return
    }

    setBusy('verify')
    const { data, error } = await verifySignupOtp(pendingEmail, verificationCode)
    setBusy(null)

    if (error) {
      setVerificationError(formatOtpError(error.message))
      return
    }
    if (!data?.session) {
      setVerificationError('Your email was verified, but a login session could not be created. Please sign in.')
      return
    }

    sessionStorage.removeItem(PENDING_SIGNUP_EMAIL_KEY)
    try {
      localStorage.setItem(
        'obf_session_cache',
        JSON.stringify({
          timestamp: Date.now(),
          email: data.session.user.email || pendingEmail,
        }),
      )
    } catch (cacheError) {
      console.error('Unable to cache verified session:', cacheError)
    }
    setVerificationOk('Email verified. Opening your workspace...')
    window.setTimeout(() => router.replace('/workspace'), 500)
  }

  async function handleResendVerificationCode() {
    if (!pendingEmail || resendCooldown > 0 || busy) return
    setVerificationError(null)
    setVerificationOk(null)
    setBusy('resend')
    const { error } = await resendSignupOtp(pendingEmail)
    setBusy(null)

    if (error) {
      setVerificationError(formatOtpError(error.message))
      return
    }
    setVerificationCode('')
    setResendCooldown(30)
    setVerificationOk('A new verification code has been sent.')
  }

  function changeSignupEmail() {
    sessionStorage.removeItem(PENDING_SIGNUP_EMAIL_KEY)
    setPendingEmail('')
    setVerificationCode('')
    setResendCooldown(0)
    switchTab('signup')
  }

  async function handleForgotPassword() {
    clearErrors()
    if (!signinEmail || !isOrgEmail(signinEmail)) {
      setFieldErrors({ signinEmail: `Enter your ${orgDomain} email first` })
      return
    }

    setBusy('forgot')
    const { error } = await requestPasswordReset(signinEmail.trim())
    setBusy(null)

    if (error) {
      setSigninError('Could not send reset email. Try again.')
      return
    }

    setSigninOk(`If this account exists, a password reset link has been sent to ${signinEmail.trim()}. Check spam or junk too.`)
  }

  async function handleResetPassword(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    clearErrors()
    if (!resetToken) {
      setSigninError('This password reset link is invalid or incomplete.')
      return
    }
    if (resetPassword.length < 8) {
      setFieldErrors({ resetPassword: 'Password must be at least 8 characters' })
      return
    }
    if (resetPassword !== resetConfirm) {
      setFieldErrors({ resetConfirm: 'Passwords do not match' })
      return
    }

    setBusy('reset')
    const { data, error } = await confirmPasswordReset(resetToken, resetPassword)
    setBusy(null)
    if (error || !data?.session) {
      setSigninError(formatAuthError(error || 'This password reset link is invalid or has expired.'))
      return
    }
    setSigninOk('Password updated. Opening your workspace...')
    window.setTimeout(() => router.replace('/workspace'), 600)
  }

  const visualTitle =
    tab === 'signup'
      ? 'Create your OakBoard account'
      : tab === 'pending'
        ? 'Verify your work email'
        : tab === 'reset'
          ? 'Choose a new password'
        : 'Welcome Back to OakBoard'
  const visualSubtitle =
    tab === 'signup'
      ? 'Create a secure work account to start building onboarding plans.'
      : tab === 'pending'
        ? 'Enter the six-digit code to verify your account and continue automatically.'
        : tab === 'reset'
          ? 'Secure your account with a new password, then continue to your workspace.'
        : 'Sign in to continue creating and sharing onboarding plans.'
  const passwordFieldFeedback = fieldErrors.signupPassword
    ? { color: '#b02020', label: fieldErrors.signupPassword }
    : passwordStrength
  const confirmationFieldFeedback = fieldErrors.signupConfirm
    ? { color: '#b02020', label: fieldErrors.signupConfirm }
    : passwordConfirmation.state === 'pending'
      ? null
      : passwordConfirmation

  return (
    <main className="auth-wrap">
      <section className="auth-card" aria-label="OakBoard authentication">
        <div className="auth-form-side">
          <BrandLogo />
          {tab === 'signin' && (
            <form className="form-panel active" onSubmit={handleSignIn}>
              {signinError && (
                <div className="banner-err show">
                  <AlertIcon />
                  <span>{signinError}</span>
                </div>
              )}
              {signinOk && (
                <div className="banner-ok show">
                  <CheckIcon />
                  <span>{signinOk}</span>
                </div>
              )}

              <div className="fld">
                <label htmlFor="si-email">Work Email</label>
                <div className="inp-wrap">
                  <FieldIcon type="email" />
                  <input
                    autoComplete="email"
                    className={fieldErrors.signinEmail ? 'err-inp' : ''}
                    id="si-email"
                    onChange={(event) => {
                      clearErrors()
                      setSigninEmail(event.target.value)
                    }}
                    placeholder="yourname@9ostech.com"
                    type="email"
                    value={signinEmail}
                  />
                </div>
                {fieldErrors.signinEmail && <span className="field-err show">{fieldErrors.signinEmail}</span>}
              </div>

              <div className="fld">
                <label htmlFor="si-pw">Password</label>
                <div className="inp-wrap">
                  <FieldIcon type="lock" />
                  <input
                    autoComplete="current-password"
                    className={`has-toggle ${fieldErrors.signinPassword ? 'err-inp' : ''}`}
                    id="si-pw"
                    onChange={(event) => {
                      clearErrors()
                      setSigninPassword(event.target.value)
                    }}
                    placeholder="Your password"
                    type={visible.signin ? 'text' : 'password'}
                    value={signinPassword}
                  />
                  <button className="toggle-pw" onClick={() => toggleVisibility('signin')} type="button">
                    <EyeIcon hidden={!visible.signin} />
                  </button>
                </div>
                {fieldErrors.signinPassword && <span className="field-err show">{fieldErrors.signinPassword}</span>}
              </div>

              <div className="forgot-row">
                <label className="remember-me" title="Keep me signed in on this device for up to 30 days">
                  <input checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} type="checkbox" />
                  <span>Remember Me</span>
                </label>
                <button className="link-btn" disabled={busy === 'forgot'} onClick={handleForgotPassword} type="button">
                  {busy === 'forgot' ? 'Sending...' : 'Forgot password?'}
                </button>
              </div>

              <button className={`btn-submit ${busy === 'signin' ? 'loading' : ''}`} disabled={busy === 'signin'} type="submit">
                <span className="btn-spin" />
                <span className="btn-txt">Sign In</span>
                <svg className="btn-txt" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M3 8h10M9 4l4 4-4 4" />
                </svg>
              </button>
              <p className="auth-switch-line">
                Not registered yet?{' '}
                <button className="link-btn inline" onClick={() => switchTab('signup')} type="button">Create account</button>
              </p>
            </form>
          )}

          {tab === 'signup' && (
            <form className="form-panel active" onSubmit={handleSignUp}>
              {signupError && (
                <div className="banner-err show">
                  <AlertIcon />
                  <span>{signupError}</span>
                </div>
              )}

              <div className="fld">
                <label htmlFor="su-name">Full Name</label>
                <div className="inp-wrap">
                  <FieldIcon type="user" />
                  <input
                    autoComplete="name"
                    className={fieldErrors.signupName ? 'err-inp' : ''}
                    id="su-name"
                    onChange={(event) => {
                      clearErrors()
                      setSignupName(event.target.value)
                    }}
                    placeholder="Your full name"
                    type="text"
                    value={signupName}
                  />
                </div>
                {fieldErrors.signupName && <span className="field-err show">{fieldErrors.signupName}</span>}
              </div>

              <div className="fld">
                <label htmlFor="su-email">Work Email</label>
                <div className="inp-wrap">
                  <FieldIcon type="email" />
                  <input
                    autoComplete="email"
                    className={fieldErrors.signupEmail ? 'err-inp' : ''}
                    id="su-email"
                    onChange={(event) => {
                      clearErrors()
                      setSignupEmail(event.target.value)
                    }}
                    placeholder="yourname@9ostech.com"
                    type="email"
                    value={signupEmail}
                  />
                </div>
                {fieldErrors.signupEmail && <span className="field-err show">{fieldErrors.signupEmail}</span>}
              </div>

              <div className="fld">
                <label htmlFor="su-pw">Password</label>
                <div className="inp-wrap">
                  <FieldIcon type="lock" />
                  <input
                    autoComplete="new-password"
                    className={`has-toggle ${fieldErrors.signupPassword ? 'err-inp' : ''}`}
                    id="su-pw"
                    onChange={(event) => {
                      clearErrors()
                      setSignupPassword(event.target.value)
                    }}
                    placeholder="Min. 8 characters"
                    style={passwordFieldFeedback
                      ? {
                          borderColor: passwordFieldFeedback.color,
                          boxShadow: `0 0 0 3px ${passwordFieldFeedback.color}18`,
                        }
                      : undefined}
                    type={visible.signup ? 'text' : 'password'}
                    value={signupPassword}
                  />
                  <button className="toggle-pw" onClick={() => toggleVisibility('signup')} type="button">
                    <EyeIcon hidden={!visible.signup} />
                  </button>
                  {passwordFieldFeedback && (
                    <span
                      aria-live="polite"
                      className="input-corner-feedback"
                      role="status"
                      style={{ color: passwordFieldFeedback.color }}
                    >
                      {passwordFieldFeedback.label}
                    </span>
                  )}
                </div>
              </div>

              <div className="fld no-bottom">
                <label htmlFor="su-pw2">Confirm Password</label>
                <div className="inp-wrap">
                  <FieldIcon type="lock" />
                  <input
                    autoComplete="new-password"
                    className={`has-toggle ${
                      fieldErrors.signupConfirm || passwordConfirmation.state === 'mismatch'
                        ? 'err-inp'
                        : passwordConfirmation.state === 'match'
                          ? 'match-inp'
                          : ''
                    }`}
                    id="su-pw2"
                    onChange={(event) => {
                      clearErrors()
                      setSignupConfirm(event.target.value)
                    }}
                    placeholder="Repeat password"
                    style={confirmationFieldFeedback
                      ? {
                          borderColor: confirmationFieldFeedback.color,
                          boxShadow: `0 0 0 3px ${confirmationFieldFeedback.color}18`,
                        }
                      : undefined}
                    type={visible.confirm ? 'text' : 'password'}
                    value={signupConfirm}
                  />
                  <button className="toggle-pw" onClick={() => toggleVisibility('confirm')} type="button">
                    <EyeIcon hidden={!visible.confirm} />
                  </button>
                  {confirmationFieldFeedback && (
                    <span
                      aria-live="polite"
                      className="input-corner-feedback"
                      role="status"
                      style={{ color: confirmationFieldFeedback.color }}
                    >
                      {confirmationFieldFeedback.label}
                    </span>
                  )}
                </div>
              </div>

              <button className={`btn-submit ${busy === 'signup' ? 'loading' : ''}`} disabled={busy === 'signup'} type="submit">
                <span className="btn-spin" />
                <span className="btn-txt">Create Account</span>
                <svg className="btn-txt" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M8 3v10M3 8h10" />
                </svg>
              </button>
              <p className="terms-note">
                By creating an account you agree to the
                <br />
                <Link href="/terms-of-service">Terms of Service</Link> &amp; <Link href="/privacy-policy">Privacy Policy</Link> of 9ostech.
              </p>
              <p className="auth-switch-line">
                Already registered?{' '}
                <button className="link-btn inline" onClick={() => switchTab('signin')} type="button">Sign in</button>
              </p>
            </form>
          )}

          {tab === 'reset' && (
            <form className="form-panel active" onSubmit={handleResetPassword}>
              {signinError && (
                <div className="banner-err show">
                  <AlertIcon />
                  <span>{signinError}</span>
                </div>
              )}
              {signinOk && (
                <div className="banner-ok show">
                  <CheckIcon />
                  <span>{signinOk}</span>
                </div>
              )}

              <div className="fld">
                <label htmlFor="reset-password">New Password</label>
                <div className="inp-wrap">
                  <FieldIcon type="lock" />
                  <input
                    autoComplete="new-password"
                    className={`has-toggle ${fieldErrors.resetPassword ? 'err-inp' : ''}`}
                    id="reset-password"
                    onChange={(event) => {
                      clearErrors()
                      setResetPassword(event.target.value)
                    }}
                    placeholder="Min. 8 characters"
                    type={visible.reset ? 'text' : 'password'}
                    value={resetPassword}
                  />
                  <button className="toggle-pw" onClick={() => toggleVisibility('reset')} type="button">
                    <EyeIcon hidden={!visible.reset} />
                  </button>
                </div>
                {fieldErrors.resetPassword && <span className="field-err show">{fieldErrors.resetPassword}</span>}
              </div>

              <div className="fld">
                <label htmlFor="reset-confirm">Confirm New Password</label>
                <div className="inp-wrap">
                  <FieldIcon type="lock" />
                  <input
                    autoComplete="new-password"
                    className={`has-toggle ${fieldErrors.resetConfirm ? 'err-inp' : ''}`}
                    id="reset-confirm"
                    onChange={(event) => {
                      clearErrors()
                      setResetConfirm(event.target.value)
                    }}
                    placeholder="Repeat password"
                    type={visible.resetConfirm ? 'text' : 'password'}
                    value={resetConfirm}
                  />
                  <button className="toggle-pw" onClick={() => toggleVisibility('resetConfirm')} type="button">
                    <EyeIcon hidden={!visible.resetConfirm} />
                  </button>
                </div>
                {fieldErrors.resetConfirm && <span className="field-err show">{fieldErrors.resetConfirm}</span>}
              </div>

              <button className={`btn-submit ${busy === 'reset' ? 'loading' : ''}`} disabled={busy === 'reset'} type="submit">
                <span className="btn-spin" />
                <span className="btn-txt">Update Password</span>
              </button>
              <p className="auth-switch-line">
                <button className="link-btn inline" onClick={() => switchTab('signin')} type="button">Back to sign in</button>
              </p>
            </form>
          )}

          {tab === 'pending' && (
            <form className="pending-panel active" onSubmit={handleVerifyCode}>
              {verificationError && (
                <div className="banner-err show">
                  <AlertIcon />
                  <span>{verificationError}</span>
                </div>
              )}
              {verificationOk && (
                <div className="banner-ok show">
                  <CheckIcon />
                  <span>{verificationOk}</span>
                </div>
              )}
              <div className="pending-icon">
                <svg viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <rect x="3.5" y="6" width="21" height="16" rx="3" />
                  <path d="m5 8 9 7 9-7" />
                </svg>
              </div>
              <div className="pending-title">Verify your email</div>
              <div className="pending-sub" id="verification-help">
                We sent a 6-digit verification code to
                <br />
                <strong>{pendingEmail || 'your email'}</strong>
              </div>

              <div className="fld otp-field">
                <label htmlFor="signup-code">Verification code</label>
                <input
                  aria-describedby="verification-help"
                  autoComplete="one-time-code"
                  autoFocus
                  className="otp-input"
                  id="signup-code"
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(event) => {
                    setVerificationError(null)
                    setVerificationOk(null)
                    setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                  }}
                  placeholder="000000"
                  type="text"
                  value={verificationCode}
                />
              </div>

              <button className={`btn-submit ${busy === 'verify' ? 'loading' : ''}`} disabled={busy !== null} type="submit">
                <span className="btn-spin" />
                <span className="btn-txt">Verify &amp; Continue</span>
              </button>
              <p className="otp-resend">
                Didn&apos;t receive the code?{' '}
                <button
                  className="link-btn inline"
                  disabled={busy !== null || resendCooldown > 0}
                  onClick={handleResendVerificationCode}
                  type="button"
                >
                  {busy === 'resend'
                    ? 'Sending...'
                    : resendCooldown > 0
                      ? `Resend in ${resendCooldown}s`
                      : 'Resend code'}
                </button>
              </p>
              <button className="link-btn otp-change-email" disabled={busy !== null} onClick={changeSignupEmail} type="button">
                Use a different email
              </button>
            </form>
          )}

          <div className="auth-footer">
            <span>© 2026 9ostech</span>
            <span className="dot">•</span>
            <Link href="/help">Help</Link>
            <span className="dot">•</span>
            <Link href="/privacy-policy">Privacy</Link>
          </div>
        </div>
        <aside className="auth-visual" aria-hidden="true">
          <div className="auth-grid-pattern" />
          <div className="auth-ring auth-ring-top" />
          <div className="auth-ring auth-ring-bottom" />
          <div className="auth-visual-copy">
            <h1>{visualTitle}</h1>
            <p>{visualSubtitle}</p>
          </div>
        </aside>
      </section>
    </main>
  )
}
