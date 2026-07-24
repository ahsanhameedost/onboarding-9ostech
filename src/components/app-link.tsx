import type { ComponentProps } from 'react'
import { Link } from 'react-router-dom'

type AppLinkProps = Omit<ComponentProps<typeof Link>, 'to'> & {
  href: string
}

export default function AppLink({ href, ...props }: AppLinkProps) {
  return <Link to={href} {...props} />
}
