import type { PageMetadata as Metadata } from '@/types/metadata'
import { PublicInfoShell } from '@/components/public-info-shell'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Learn how OakBoard handles account, onboarding plan, and service data.',
  alternates: {
    canonical: '/privacy-policy',
  },
}

export default function PrivacyPage() {
  return (
    <PublicInfoShell
      current="privacy"
      eyebrow="OakBoard privacy"
      title="Your work data, clearly explained."
      description="This notice describes the information OakBoard uses to authenticate employees, save onboarding plans, and deliver the files you choose to share."
    >
      <div className="privacy-meta">
        <div><span>Effective date</span><strong>July 22, 2026</strong></div>
        <div><span>Application owner</span><strong>Oak Street Technologies</strong></div>
        <div><span>Questions</span><a href="mailto:support@9ostech.com">support@9ostech.com</a></div>
      </div>

      <div className="privacy-layout">
        <aside className="privacy-summary">
          <span>At a glance</span>
          <h2>Built for internal onboarding work</h2>
          <ul>
            <li>Access is limited to approved work accounts.</li>
            <li>Your plans are associated with your signed-in user ID.</li>
            <li>Other users do not receive access to your plan history through the app.</li>
            <li>OakBoard does not include advertising or marketing trackers.</li>
            <li>You can archive or permanently delete plans from the app.</li>
          </ul>
        </aside>

        <article className="privacy-article">
          <section>
            <span>01</span>
            <div>
              <h2>Scope</h2>
              <p>This privacy notice applies to the OakBoard Employee Onboarding Plan application operated for Oak Street Technologies. It covers account registration, authentication, plan creation and storage, PDF generation, and user-requested email delivery.</p>
            </div>
          </section>

          <section>
            <span>02</span>
            <div>
              <h2>Information we process</h2>
              <p>OakBoard processes your work email address, name, authentication and session data, and the onboarding content you enter or import. Plan content may include role titles, reporting relationships, collaborators, dates, weekly goals, daily activities, and expected outcomes.</p>
            </div>
          </section>

          <section>
            <span>03</span>
            <div>
              <h2>How information is used</h2>
              <p>The application uses this information to verify your work account, keep you signed in, save and retrieve your own plans, generate previews and PDFs, restore archived plans, and send a plan when you explicitly request email delivery. Information is also used to secure, troubleshoot, and maintain the service.</p>
            </div>
          </section>

          <section>
            <span>04</span>
            <div>
              <h2>Storage and service providers</h2>
              <p>OakBoard&apos;s cPanel environment hosts the application and stores account, session, and owner-scoped plan records in MySQL. Mailgun processes recipient and message information when OakBoard sends verification codes, password-reset messages, or a PDF you explicitly request. These systems process data only as needed to operate the service.</p>
            </div>
          </section>

          <section>
            <span>05</span>
            <div>
              <h2>Cookies and browser storage</h2>
              <p>OakBoard uses essential authentication cookies and limited browser storage for session preference, remembered email choice, pending signup verification, and short-lived interface state. These technologies support sign-in and application continuity; they are not used for targeted advertising.</p>
            </div>
          </section>

          <section>
            <span>06</span>
            <div>
              <h2>Access, retention, and deletion</h2>
              <p>Plans remain associated with your account until they are deleted or removed under company retention practices. Archiving hides a plan from the active list but keeps it available for restoration. Confirming Delete permanently removes the selected plan from the application database. For account-level access, correction, export, or deletion requests, contact support.</p>
            </div>
          </section>

          <section>
            <span>07</span>
            <div>
              <h2>Security and appropriate use</h2>
              <p>OakBoard restricts access through work-email verification, authenticated sessions, server-side checks, and database policies. No online service can guarantee absolute security. Use accurate business information, avoid adding unnecessary sensitive personal data, and sign out on shared devices.</p>
            </div>
          </section>

          <section>
            <span>08</span>
            <div>
              <h2>Updates and contact</h2>
              <p>This notice may be updated when OakBoard&apos;s features, providers, or company practices change. The effective date above will be revised when material updates are published. For privacy or support questions, email <a href="mailto:support@9ostech.com">support@9ostech.com</a> or call <a href="tel:+18776250091">+1 877-625-0091</a>.</p>
            </div>
          </section>
        </article>
      </div>
    </PublicInfoShell>
  )
}
