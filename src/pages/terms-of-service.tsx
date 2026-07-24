import type { PageMetadata as Metadata } from '@/types/metadata'
import { PublicInfoShell } from '@/components/public-info-shell'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms governing authorized use of the OakBoard employee onboarding plan application.',
  alternates: {
    canonical: '/terms-of-service',
  },
}

const sections = [
  ['Authorized use', 'OakBoard is provided for approved Oak Street Technologies business users. You must use your own authorized account and keep account credentials confidential.'],
  ['Appropriate content', 'Use OakBoard for legitimate onboarding work. Do not enter unnecessary sensitive personal information, unlawful material, or content that you are not authorized to process.'],
  ['Plan responsibility', 'You are responsible for reviewing role details, dates, tasks, outcomes, recipients, and generated PDF content before using or sharing an onboarding plan.'],
  ['Availability and changes', 'Features, integrations, limits, and availability may change as OakBoard evolves. Maintenance or third-party service interruptions can temporarily affect access, storage, or email delivery.'],
  ['Data and security', 'Use of OakBoard is also governed by the Privacy Policy and applicable company security, retention, and acceptable-use requirements. Sign out when using a shared device.'],
  ['Support', 'For access, plan, privacy, or service questions, contact Oak Street Technologies support at support@9ostech.com.'],
]

export default function TermsOfServicePage() {
  return (
    <PublicInfoShell
      current="terms"
      eyebrow="OakBoard terms"
      title="Clear expectations for responsible use."
      description="These terms describe the conditions for accessing and using OakBoard as an internal employee onboarding planning service."
    >
      <div className="privacy-meta">
        <div><span>Effective date</span><strong>July 22, 2026</strong></div>
        <div><span>Service owner</span><strong>Oak Street Technologies</strong></div>
        <div><span>Support</span><a href="mailto:support@9ostech.com">support@9ostech.com</a></div>
      </div>

      <article className="privacy-article">
        {sections.map(([title, copy], index) => (
          <section key={title}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <div>
              <h2>{title}</h2>
              <p>{copy}</p>
            </div>
          </section>
        ))}
      </article>
    </PublicInfoShell>
  )
}
