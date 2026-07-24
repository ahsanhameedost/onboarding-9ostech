import Link from '@/components/app-link'
import type { PageMetadata as Metadata } from '@/types/metadata'
import { PublicInfoShell } from '@/components/public-info-shell'
import { Icon } from '@/components/ui'

export const metadata: Metadata = {
  title: 'Employee Onboarding Plan Builder',
  description: 'Create structured 2-week and 4-week employee onboarding plans, manage role-specific activities, and export polished PDFs with OakBoard.',
  alternates: {
    canonical: '/',
  },
}

const features = [
  ['01', 'Guided plan creation', 'Build role-specific onboarding plans through clear duration, role, week, and daily activity steps.'],
  ['02', 'Two flexible durations', 'Choose a focused 2-week plan or a complete 4-week onboarding journey with working-day scheduling.'],
  ['03', 'Private plan history', 'Save, revisit, edit, archive, restore, and permanently delete plans associated with your own account.'],
  ['04', 'Share-ready output', 'Review the final plan, download a polished PDF, or send the PDF through OakBoard email delivery.'],
]

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'OakBoard',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description: 'Employee onboarding plan builder for creating structured 2-week and 4-week role-specific onboarding plans.',
  publisher: {
    '@type': 'Organization',
    name: 'Oak Street Technologies',
    url: 'https://9ostech.com/',
  },
}

export default function HomePage() {
  return (
    <PublicInfoShell
      current="home"
      eyebrow="Employee onboarding, structured"
      title="Build clear onboarding plans that are ready to share."
      description="OakBoard turns role expectations, weekly goals, daily activities, and expected outcomes into a consistent onboarding plan and polished PDF."
    >
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}
        type="application/ld+json"
      />

      <section className="info-section" aria-labelledby="oakboard-capabilities">
        <div className="info-section__heading">
          <span>OakBoard capabilities</span>
          <h2 id="oakboard-capabilities">From role details to a complete onboarding document</h2>
        </div>
        <div className="help-step-grid">
          {features.map(([number, title, copy]) => (
            <article className="help-step" key={number}>
              <span className="help-step__number">{number}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="support-panel" aria-labelledby="start-building">
        <div className="support-panel__icon"><Icon name="plus" /></div>
        <div>
          <span>Your onboarding workspace</span>
          <h2 id="start-building">Create your next onboarding plan</h2>
          <p>Sign in with an approved Oak Street Technologies work account to create, manage, and export onboarding plans securely.</p>
        </div>
        <div className="support-panel__actions">
          <Link className="support-primary" href="/sign-in">Sign in to OakBoard</Link>
          <Link href="/help">View the user guide</Link>
        </div>
      </section>
    </PublicInfoShell>
  )
}
