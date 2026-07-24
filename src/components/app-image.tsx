import type { ImgHTMLAttributes } from 'react'

type ImageSource = string | { src: string }
type AppImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: ImageSource
  unoptimized?: boolean
  priority?: boolean
}

export default function AppImage({ src, unoptimized: _unoptimized, priority: _priority, ...props }: AppImageProps) {
  const resolvedSource = typeof src === 'string' ? src : src.src
  return <img src={resolvedSource} {...props} />
}
