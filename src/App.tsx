import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { apiFetch } from '@/lib/api/client'
import { getValidSession } from '@/lib/auth/client'
import { writeStoredPlan, type SavedOnboardingPlan } from '@/types/plan'

const LoginPage = lazy(() => import('@/pages/sign-in'))
const GenerateFormClient = lazy(() => import('@/pages/plan-editor'))
const HelpPage = lazy(() => import('@/pages/help'))
const HomePage = lazy(() => import('@/pages/home'))
const PrivacyPage = lazy(() => import('@/pages/privacy-policy'))
const TermsPage = lazy(() => import('@/pages/terms-of-service'))
const WorkspaceClient = lazy(() => import('@/components/workspace-client'))

const publicMetadata: Record<string, { title: string; description: string }> = {
  '/': {
    title: 'OakBoard | Employee Onboarding Plans',
    description: 'Create, manage, export, and share role-specific employee onboarding plans with OakBoard.',
  },
  '/sign-in': {
    title: 'Sign In | OakBoard',
    description: 'Sign in to your OakBoard onboarding-plan workspace.',
  },
  '/help': {
    title: 'Help | OakBoard',
    description: 'Learn how to create, manage, export, and share onboarding plans in OakBoard.',
  },
  '/privacy-policy': {
    title: 'Privacy Policy | OakBoard',
    description: 'Read how OakBoard handles authentication, onboarding plans, and email delivery data.',
  },
  '/terms-of-service': {
    title: 'Terms of Service | OakBoard',
    description: 'Review the terms for using the OakBoard employee onboarding-plan service.',
  },
}

function RouteMetadata() {
  const location = useLocation()

  useEffect(() => {
    const metadata = publicMetadata[location.pathname] || {
      title: location.pathname.startsWith('/plans/') ? 'Onboarding Plan | OakBoard' : 'Workspace | OakBoard',
      description: 'Create and manage employee onboarding plans in OakBoard.',
    }
    document.title = metadata.title

    let description = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    if (!description) {
      description = document.createElement('meta')
      description.name = 'description'
      document.head.appendChild(description)
    }
    description.content = metadata.description

    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]')
    if (!robots) {
      robots = document.createElement('meta')
      robots.name = 'robots'
      document.head.appendChild(robots)
    }
    robots.content = publicMetadata[location.pathname] ? 'index,follow' : 'noindex,nofollow'
  }, [location.pathname])

  return null
}

function PageState({ children }: { children: ReactNode }) {
  return <main className="auth-loader" aria-live="polite">{children}</main>
}

function RequireAuth({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'checking' | 'allowed' | 'denied'>('checking')

  useEffect(() => {
    let active = true
    void getValidSession().then((result) => {
      if (active) setStatus(result.ok ? 'allowed' : 'denied')
    })
    return () => { active = false }
  }, [])

  if (status === 'denied') return <Navigate replace to="/sign-in" />
  if (status === 'checking') {
    return <PageState><span className="auth-loader__spinner" aria-hidden="true" /><p>Opening your workspace...</p></PageState>
  }
  return children
}

function PlanRoute({ edit = false }: { edit?: boolean }) {
  const { planId = '' } = useParams()
  const [savedPlan, setSavedPlan] = useState<SavedOnboardingPlan | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    void apiFetch(`/api/plans/${encodeURIComponent(planId)}`, { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json().catch(() => null) as { plan?: SavedOnboardingPlan } | null
        if (!active) return
        if (!response.ok || !result?.plan) {
          setFailed(true)
          return
        }
        writeStoredPlan({ ...result.plan.plan, id: result.plan.id })
        setSavedPlan(result.plan)
      })
      .catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [planId])

  if (failed) return <Navigate replace to="/workspace" />
  if (!savedPlan) return <PageState><span className="auth-loader__spinner" aria-hidden="true" /><p>Loading plan...</p></PageState>
  return edit
    ? <WorkspaceClient initialPlan={savedPlan} initialView="edit" />
    : <GenerateFormClient initialPlan={savedPlan.plan} initialPlanId={savedPlan.id} />
}

function ArchivedPlansRoute() {
  const [plans, setPlans] = useState<SavedOnboardingPlan[] | null>(null)

  useEffect(() => {
    let active = true
    void apiFetch('/api/plans?archived=true&limit=20', { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json().catch(() => null) as { plans?: SavedOnboardingPlan[] } | null
        if (active) setPlans(response.ok && result?.plans ? result.plans : [])
      })
      .catch(() => { if (active) setPlans([]) })
    return () => { active = false }
  }, [])

  if (!plans) return <PageState><span className="auth-loader__spinner" aria-hidden="true" /><p>Loading archived plans...</p></PageState>
  return <WorkspaceClient initialArchivedPlans={plans} initialView="archived" />
}

function Protected({ children }: { children: ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>
}

export default function App() {
  return (
    <Suspense fallback={<PageState><span className="auth-loader__spinner" aria-hidden="true" /><p>Loading OakBoard...</p></PageState>}>
      <RouteMetadata />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/privacy-policy" element={<PrivacyPage />} />
        <Route path="/terms-of-service" element={<TermsPage />} />
        <Route path="/sign-in" element={<LoginPage />} />
        <Route path="/auth/callback" element={<Navigate replace to="/sign-in" />} />
        <Route path="/workspace" element={<Protected><WorkspaceClient key="workspace" /></Protected>} />
        <Route path="/plans/new" element={<Protected><WorkspaceClient key="new-plan" initialView="new" /></Protected>} />
        <Route path="/plans/archived" element={<Protected><ArchivedPlansRoute /></Protected>} />
        <Route path="/plans/:planId" element={<Protected><PlanRoute /></Protected>} />
        <Route path="/plans/:planId/edit" element={<Protected><PlanRoute edit /></Protected>} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </Suspense>
  )
}
