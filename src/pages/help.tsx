import type { PageMetadata as Metadata } from '@/types/metadata'
import { PublicInfoShell } from '@/components/public-info-shell'
import { Icon } from '@/components/ui'

export const metadata: Metadata = {
  title: 'Help',
  description: 'Get help creating, managing, exporting, and sharing onboarding plans in OakBoard.',
  alternates: {
    canonical: '/help',
  },
}

const steps = [
  {
    number: '01',
    title: 'Create and verify your account',
    copy: 'Register with your @9ostech.com work email, enter the 6-digit code from your inbox, and OakBoard will sign you in automatically.',
  },
  {
    number: '02',
    title: 'Start an onboarding plan',
    copy: 'Choose Create new plan, then fill the plan manually or import structured NotebookLM content.',
  },
  {
    number: '03',
    title: 'Complete weeks and days',
    copy: 'Set the duration and role details, then add a goal for each week and titles, activities, and outcomes for every day.',
  },
  {
    number: '04',
    title: 'Review and share',
    copy: 'Generate the preview, download the polished PDF, or send the plan as a PDF attachment from OakBoard.',
  },
]

const faqs = [
  {
    question: 'I did not receive the signup code. What should I do?',
    answer: 'Check your spam or junk folder, confirm that the address ends in @9ostech.com, and request a new code after the countdown finishes. If it still does not arrive, contact support. OakBoard verification messages are delivered through Mailgun.',
  },
  {
    question: 'Where are my recent plans?',
    answer: 'Your active plans appear in Recent Plans after you sign in. Plans are tied to your account, so another user cannot see them. Archived plans are available from Archive.',
  },
  {
    question: 'How do I change an existing plan?',
    answer: 'Open the plan from Recent Plans, choose Edit in the preview toolbar, update the required sections, and generate it again to save the latest version.',
  },
  {
    question: 'What happens when I delete a plan?',
    answer: 'Delete permanently removes that plan from your account after confirmation. Use Archive instead when you may need to restore it later.',
  },
  {
    question: 'Why did email delivery fail?',
    answer: 'Confirm that you are signed in and online, then try again. During restricted demo delivery, the system may only allow the approved test recipient. Contact support if the Edge Function continues to return an error.',
  },
]

export default function HelpPage() {
  return (
    <PublicInfoShell
      current="help"
      eyebrow="OakBoard support"
      title="Build better onboarding plans, faster."
      description="A quick guide to creating, reviewing, and sharing role-specific onboarding plans, plus direct support when you need a hand."
    >
      <section className="info-section" aria-labelledby="getting-started">
        <div className="info-section__heading">
          <span>Getting started</span>
          <h2 id="getting-started">From account setup to a share-ready PDF</h2>
        </div>
        <div className="help-step-grid">
          {steps.map((step) => (
            <article className="help-step" key={step.number}>
              <span className="help-step__number">{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="support-panel" aria-labelledby="contact-support">
        <div className="support-panel__icon"><Icon name="chat" /></div>
        <div>
          <span>Oak Street Technologies support</span>
          <h2 id="contact-support">Still need help?</h2>
          <p>Oak Street Technologies provides technology and business support across its global offices. For OakBoard access, OTP, plan, PDF, or email-delivery issues, contact the support team.</p>
        </div>
        <div className="support-panel__actions">
          <a className="support-primary" href="mailto:support@9ostech.com">Email support</a>
          <a href="tel:+18776250091">+1 877-625-0091</a>
          <small>Phone support: Monday-Friday</small>
        </div>
      </section>

      <section className="info-section" aria-labelledby="frequent-questions">
        <div className="info-section__heading">
          <span>Common questions</span>
          <h2 id="frequent-questions">Answers without the wait</h2>
        </div>
        <div className="faq-list">
          {faqs.map((faq) => (
            <details key={faq.question}>
              <summary>{faq.question}</summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="office-strip" aria-label="Oak Street Technologies offices">
        <div><span>United States</span><strong>Orlando, Florida</strong></div>
        <div><span>United Arab Emirates</span><strong>Business Bay, Dubai</strong></div>
        <div><span>Pakistan</span><strong>Gulberg Greens, Islamabad</strong></div>
        <a href="https://9ostech.com/contact/" target="_blank" rel="noreferrer">View company contact page <Icon name="arrow-right" /></a>
      </section>
    </PublicInfoShell>
  )
}
