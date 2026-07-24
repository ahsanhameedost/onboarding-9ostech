'use client'

import { useEffect, useMemo, useState } from 'react'
import { toPng } from 'html-to-image'
import { jsPDF } from 'jspdf'
import oakboardLogo from '@/assets/oakboard-logo.svg'
import Image from '@/components/app-image'
import { Button, Modal, PageToolbar, StatusBanner, TextField } from '@/components/ui'
import { apiFetch } from '@/lib/api/client'
import { getValidSession } from '@/lib/auth/client'
import { useAppRouter } from '@/lib/router'
import { type OnboardingPlan, type PlanDay, type PlanWeek, readStoredPlan } from '@/types/plan'

const DAY_TITLE_MAX = 90
const DAY_TASK_MAX = 90
const DAY_TASK_SHORT_MAX = 50
const DAY_TASK_COUNT_LONG = 4
const DAY_TASK_COUNT_SHORT = 6
const DAY_OUTCOME_MAX = 90
type EmailPayload = {
  to: string
  cc?: string
  plan_id?: string
  subject: string
  text: string
  attachment: {
    filename: string
    content: string
  }
}

type EmailResult = {
  ok: boolean
  id?: string
  error?: string
}

function limitText(value: unknown, max: number) {
  return String(value ?? '').trim().slice(0, max)
}

function limitTasks(tasks: unknown) {
  const clean = (Array.isArray(tasks) ? tasks : [])
    .map((task) => limitText(task, DAY_TASK_MAX))
    .filter(Boolean)
  const max = clean.some((task) => task.length > DAY_TASK_SHORT_MAX)
    ? DAY_TASK_COUNT_LONG
    : DAY_TASK_COUNT_SHORT
  return clean.slice(0, max)
}

function formatDate(date: unknown) {
  if (!date) return ''
  const parsed = date instanceof Date ? date : new Date(String(date))
  if (Number.isNaN(parsed.getTime())) return String(date)
  return parsed.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    weekday: 'short',
  })
}

function cleanDisplayWeekTitle(value: unknown) {
  const cleaned = String(value ?? '')
    .trim()
    .replace(/^week\s+\d+\s*[:\-–—]?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || 'Training Plan'
}

function fitClass(title: string, tasks: string[], outcome: string) {
  const totalChars = title.length + outcome.length + tasks.reduce((sum, task) => sum + task.length, 0)
  if (tasks.length >= 6 || totalChars > 370) return ' ultra'
  if (tasks.length >= 5 || totalChars > 290) return ' dense'
  return ''
}

function TitleIcon() {
  return (
    <svg className="pdc-icon" viewBox="0 0 16 16" fill="none">
      <path d="M8 14.666A6.666 6.666 0 1 0 8 1.334a6.666 6.666 0 0 0 0 13.332Z" stroke="#02621C" strokeWidth="1.333" />
      <path d="M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="#02621C" strokeWidth="1.333" />
      <path d="M8 9.334a1.333 1.333 0 1 0 0-2.667 1.333 1.333 0 0 0 0 2.667Z" stroke="#02621C" strokeWidth="1.333" />
    </svg>
  )
}

function OutcomeIcon() {
  return (
    <svg className="pdc-icon" viewBox="0 0 16 16" fill="none">
      <path d="M8 14.666A6.666 6.666 0 1 0 8 1.334a6.666 6.666 0 0 0 0 13.332Z" stroke="#02621C" strokeWidth="1.333" />
      <path d="M6 8l1.333 1.334L10 6.667" stroke="#02621C" strokeWidth="1.333" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function DayCard({ day }: { day: PlanDay }) {
  const title = limitText(day.title, DAY_TITLE_MAX)
  const tasks = limitTasks(day.tasks)
  const outcome = limitText(day.outcome, DAY_OUTCOME_MAX)
  const cardClass = fitClass(title, tasks, outcome)
  const dayNumber = day.g || day.day

  return (
    <article className={`pdc${cardClass}`}>
      <div className="pdc-top">
        <span className="pdc-badge">Day {dayNumber}</span>
        <span className="pdc-date">{formatDate(day.date)}</span>
      </div>
      <div className="pdc-topic-row">
        <TitleIcon />
        <span className="pdc-topic-txt">{title || 'Day title'}</span>
      </div>
      <div className="pdc-tasks-area">
        <Image className="pdc-icon" src="/task-icon.svg" alt="" height={16} width={16} unoptimized />
        <div className="pdc-tasks-list">
          {tasks.map((task) => (
            <div className="pdc-task" key={task}>
              <span className="ptb">•</span>
              <span className="ptt">{task}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="pdc-out">
        <OutcomeIcon />
        <span className="pot">{outcome || 'Outcome'}</span>
      </div>
    </article>
  )
}

function PlanPage({
  pageWeeks,
  pageIndex,
  role,
  reports,
  collab,
  nWeeks,
}: {
  pageWeeks: PlanWeek[]
  pageIndex: number
  role: string
  reports: string
  collab: string
  nWeeks: 2 | 4
}) {
  const planName = nWeeks === 4 ? 'Four-Week' : 'Two-Week'

  return (
    <section className="plan-doc-react" aria-label={`${planName} onboarding plan page ${pageIndex + 1}`}>
      <div className="plan-frame">
        <div className="ph">
          <div className="ph-logo">
            <Image src={oakboardLogo} alt="Oak Street Technologies" height={80} width={80} unoptimized />
          </div>
          <div className="ph-right">
            <div className="ph-title">{planName} Onboarding Plan</div>
            <div className="ph-chips">
              <div className="ph-chip"><div className="ph-chip-lbl">Role</div><div className="ph-chip-val">{role || '—'}</div></div>
              <div className="ph-chip"><div className="ph-chip-lbl">Reports To</div><div className="ph-chip-val">{reports || '—'}</div></div>
              <div className="ph-chip"><div className="ph-chip-lbl">Collaborates With</div><div className="ph-chip-val">{collab || '—'}</div></div>
            </div>
          </div>
        </div>

        {pageWeeks.map((week, localWeekIndex) => {
          const weekNumber = pageIndex * 2 + localWeekIndex + 1
          return (
            <div className="week-block" key={weekNumber}>
              <div className="pw">
                <div className="pw-pill">Week {weekNumber} — {cleanDisplayWeekTitle(week.title)}</div>
                {week.goal && <div className="pw-sub">{week.goal}</div>}
              </div>
              <div className="pd">
                {week.days.slice(0, 5).map((day) => (
                  <DayCard day={day} key={day.g || day.day} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

type GenerateFormClientProps = {
  initialPlan?: OnboardingPlan | null
  initialPlanId?: string | null
}

export default function GenerateFormClient({ initialPlan = null, initialPlanId = null }: GenerateFormClientProps) {
  const router = useAppRouter()
  const plan = useMemo(() => initialPlan || readStoredPlan(), [initialPlan])
  const planId = initialPlanId || plan?.id || null
  const [exporting, setExporting] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)
  const [emailTo, setEmailTo] = useState('')
  const [emailCc, setEmailCc] = useState('')
  const [emailNote, setEmailNote] = useState('')
  const [emailError, setEmailError] = useState('')
  const [emailNotice, setEmailNotice] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [planActionBusy, setPlanActionBusy] = useState<'archive' | 'delete' | null>(null)
  const [planActionError, setPlanActionError] = useState('')

  useEffect(() => {
    if (!plan) router.replace('/workspace')
  }, [plan, router])

  if (!plan) {
    return (
      <main className="auth-loader" aria-live="polite">
        <span className="auth-loader__spinner" aria-hidden="true" />
        <p>Loading plan...</p>
      </main>
    )
  }

  const weeks =
    plan.weeks && plan.weeks.length > 0
      ? plan.weeks
      : [
          {
            title: 'Training Plan',
            days: (plan.days || []).slice(0, 5),
          },
          {
            title: 'Training Plan',
            days: (plan.days || []).slice(5, 10),
          },
        ]
  const nWeeks = Number(plan.nWeeks) === 4 ? 4 : 2
  const pageGroups = nWeeks === 4 ? [weeks.slice(0, 2), weeks.slice(2, 4)] : [weeks.slice(0, 2)]
  const role = plan.role || ''
  const reports = plan.reports || plan.reportsTo || ''
  const collab = plan.collab || plan.collaboratesWith || ''
  const filename = `OakBoard-${nWeeks}-Week-Onboarding-Plan.pdf`

  async function buildPdfAttachment() {
    const pages = Array.from(document.querySelectorAll<HTMLElement>('.plan-doc-react'))
    if (pages.length === 0) throw new Error('No plan pages found.')

    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'px',
      format: [1920, 1080],
      hotfixes: ['px_scaling'],
    })

    for (const [index, page] of pages.entries()) {
      const dataUrl = await toPng(page, {
        cacheBust: true,
        pixelRatio: 2,
        width: 1920,
        height: 1080,
        style: {
          margin: '0',
          transform: 'none',
          boxShadow: 'none',
        },
      })

      if (index > 0) pdf.addPage([1920, 1080], 'landscape')
      pdf.addImage(dataUrl, 'PNG', 0, 0, 1920, 1080, undefined, 'FAST')
    }

    const dataUri = pdf.output('datauristring')
    return {
      filename,
      content: dataUri.slice(dataUri.indexOf(',') + 1),
    }
  }

  async function downloadPdf() {
    setExporting(true)
    try {
      const attachment = await buildPdfAttachment()
      const binary = atob(attachment.content)
      const bytes = new Uint8Array(binary.length)
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index)
      }

      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
      const link = document.createElement('a')
      link.href = url
      link.download = attachment.filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'PDF export failed.'
      window.alert(message)
    } finally {
      setExporting(false)
    }
  }

  function buildEmailText(note: string) {
    const noteBlock = note ? `\n\nNote:\n${note}` : ''
    return `Hello,\n\nThe ${nWeeks}-week onboarding plan for ${role || 'the selected role'} is attached as a PDF.${noteBlock}\n\nRegards,\nOakBoard`
  }

  function openEmailModal() {
    setEmailTo('')
    setEmailCc('')
    setEmailNote('')
    setEmailError('')
    setEmailNotice('')
    setEmailOpen(true)
    void getValidSession().then((result) => {
      if (result.ok && result.session.user.email) {
        setEmailTo(result.session.user.email)
      }
    })
  }

  function editPlan() {
    setPlanActionError('')
    if (!planId) {
      setPlanActionError('Please return to Recent Plans and reopen this plan before editing it.')
      return
    }
    router.push(`/plans/${planId}/edit`)
  }

  async function mutatePlan(action: 'archive' | 'delete') {
    setPlanActionError('')
    if (!planId) {
      setPlanActionError('Please return to Recent Plans and reopen this plan before changing it.')
      return
    }

    setPlanActionBusy(action)
    const response = action === 'archive'
      ? await apiFetch(`/api/plans/${encodeURIComponent(planId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'archive' }),
        })
      : await apiFetch(`/api/plans/${encodeURIComponent(planId)}`, { method: 'DELETE' })

    if (!response.ok) {
      setPlanActionError(action === 'archive' ? 'This plan could not be archived.' : 'This plan could not be deleted.')
      setPlanActionBusy(null)
      return
    }

    setDeleteOpen(false)
    router.replace('/workspace')
  }

  async function sendEmail() {
    setEmailError('')
    setEmailNotice('')

    if (!emailTo.trim()) {
      setEmailError('Enter at least one recipient email address.')
      return
    }

    setSendingEmail(true)
    try {
      const attachment = await buildPdfAttachment()
      const payload: EmailPayload = {
        to: emailTo.trim(),
        cc: emailCc.trim() || undefined,
        plan_id: planId || undefined,
        subject: `${nWeeks}-Week Onboarding Plan: ${role || 'New Role'} — Oak Street Technologies`,
        text: buildEmailText(emailNote.trim()),
        attachment,
      }
      const response = await apiFetch('/api/email/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json().catch(() => null) as EmailResult | null
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Email was not sent.')
      setEmailNotice(`PDF attachment sent to ${emailTo.trim()}.`)
      setEmailNote('')
      window.setTimeout(() => setEmailOpen(false), 900)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Failed to send. Please try again.'
      setEmailError(message)
    } finally {
      setSendingEmail(false)
    }
  }

  return (
    <main className="generate-page">
      <PageToolbar
        backLabel="Back to details"
        backTo="/workspace"
        subtitle={`${role || 'New role'} / Preview & export`}
        title={`${nWeeks}-Week Onboarding Plan`}
        actions={(
          <>
            <Button disabled={planActionBusy !== null} icon="pencil" onClick={editPlan} type="button" variant="secondary">Edit</Button>
            <Button disabled={planActionBusy !== null} icon="archive" onClick={() => void mutatePlan('archive')} type="button" variant="soft">
              {planActionBusy === 'archive' ? 'Archiving...' : 'Archive'}
            </Button>
            <Button disabled={planActionBusy !== null} icon="trash" onClick={() => setDeleteOpen(true)} type="button" variant="danger">Delete</Button>
            <Button icon="email" onClick={openEmailModal} type="button" variant="secondary">Send Email</Button>
            <Button disabled={exporting} icon="download" onClick={downloadPdf} type="button" variant="primary">
              {exporting ? 'Preparing PDF...' : 'Download PDF'}
            </Button>
          </>
        )}
      />

      {planActionError && <div className="generate-action-status"><StatusBanner tone="error">{planActionError}</StatusBanner></div>}

      <div className="plan-wrap-react">
        {pageGroups.map((pageWeeks, pageIndex) => (
          <PlanPage
            collab={collab}
            key={pageIndex}
            nWeeks={nWeeks}
            pageIndex={pageIndex}
            pageWeeks={pageWeeks}
            reports={reports}
            role={role}
          />
        ))}
      </div>

      <Modal
        icon="email"
        onClose={() => setEmailOpen(false)}
        open={emailOpen}
        subtitle="Send the downloaded onboarding plan as a PDF attachment."
        title="Send Onboarding Plan"
        footer={(
          <>
            <Button disabled={sendingEmail} onClick={() => setEmailOpen(false)} type="button" variant="secondary">Cancel</Button>
            <Button disabled={sendingEmail} icon="email" onClick={sendEmail} type="button" variant="primary">
              {sendingEmail ? 'Sending PDF...' : 'Send PDF'}
            </Button>
          </>
        )}
      >
        <div className="email-summary">
          <strong>Plan:</strong> {nWeeks}-Week Onboarding · {role || '—'}<br />
          <strong>From:</strong> onboarding@osdevlabs.com<br />
          <strong>Attachment:</strong> {filename}
        </div>
        {emailError && <StatusBanner tone="error">{emailError}</StatusBanner>}
        {emailNotice && <StatusBanner tone="success">{emailNotice}</StatusBanner>}
        <TextField label="Recipient Email *" type="email" value={emailTo} onChange={(event) => setEmailTo(event.target.value)} />
        <TextField label="CC (Optional)" placeholder="Optional copy recipient" type="email" value={emailCc} onChange={(event) => setEmailCc(event.target.value)} />
        <TextField label="Personal Note (Optional)" multiline placeholder="Add a short message to include with the plan..." value={emailNote} onChange={(event) => setEmailNote(event.target.value)} />
      </Modal>

      <Modal
        icon="warning"
        onClose={() => !planActionBusy && setDeleteOpen(false)}
        open={deleteOpen}
        subtitle="This will permanently remove the plan from your account."
        title="Delete Onboarding Plan?"
        footer={(
          <>
            <Button disabled={planActionBusy !== null} onClick={() => setDeleteOpen(false)} type="button" variant="secondary">No</Button>
            <Button disabled={planActionBusy !== null} icon="trash" onClick={() => void mutatePlan('delete')} type="button" variant="danger">
              {planActionBusy === 'delete' ? 'Deleting...' : 'Yes, Delete'}
            </Button>
          </>
        )}
      >
        <p>Are you sure you want to delete the onboarding plan for <strong>{role || 'this role'}</strong>?</p>
      </Modal>
    </main>
  )
}
