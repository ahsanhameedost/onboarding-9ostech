'use client'

import { createElement, useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react'

let vividRegistered = false

export function VividRegistry() {
  useEffect(() => {
    if (vividRegistered) return
    vividRegistered = true

    // Targeted Vivid imports keep the client bundle limited to components in use.
    void import('@vonage/vivid/button')
  }, [])

  return null
}

type VividButtonProps = Omit<ButtonHTMLAttributes<HTMLElement>, 'children'> & {
  appearance?: 'filled' | 'outlined' | 'ghost'
  connotation?: 'cta' | 'accent' | 'success' | 'alert'
  icon?: ReactNode
  iconTrailing?: boolean
  label: string
}

export function VividButton({
  appearance = 'filled',
  connotation = 'cta',
  icon,
  iconTrailing,
  label,
  type = 'button',
  ...props
}: VividButtonProps) {
  return createElement('vwc-button', {
    ...props,
    appearance,
    connotation,
    'icon-trailing': iconTrailing || undefined,
    label,
    type,
  }, icon ? createElement('span', { slot: 'icon' }, icon) : undefined)
}
