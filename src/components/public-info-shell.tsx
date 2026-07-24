import Link from './app-link'
import type { ReactNode } from 'react'
import { BrandLogo, Icon } from '@/components/ui'

export function PublicInfoShell({
  children,
  current,
  description,
  eyebrow,
  title,
}: {
  children: ReactNode
  current: 'help' | 'home' | 'privacy' | 'terms'
  description: string
  eyebrow: string
  title: string
}) {
  return (
    <main className="info-page">
      <div className="info-page__glow" aria-hidden="true" />
      <header className="info-header">
        <Link className="info-brand-link" href="/" aria-label="OakBoard home">
          <BrandLogo />
        </Link>
        <nav className="info-nav" aria-label="Support and policy navigation">
          <Link aria-current={current === 'home' ? 'page' : undefined} href="/">Product</Link>
          <Link aria-current={current === 'help' ? 'page' : undefined} href="/help">Help</Link>
          <Link aria-current={current === 'privacy' ? 'page' : undefined} href="/privacy-policy">Privacy</Link>
          <Link className="info-nav__signin" href="/sign-in">
            <Icon name="arrow-left" />
            Sign in
          </Link>
        </nav>
      </header>

      <section className="info-hero">
        <span>{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </section>

      <div className="info-content">{children}</div>

      <footer className="info-footer">
        <span>{'\u00A9'} 2026 Oak Street Technologies</span>
        <div>
          <a href="https://9ostech.com/" target="_blank" rel="noreferrer">9ostech.com</a>
          <a href="mailto:support@9ostech.com">support@9ostech.com</a>
        </div>
      </footer>
    </main>
  )
}
