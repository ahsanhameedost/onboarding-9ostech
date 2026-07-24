export type PageMetadata = {
  title?: string
  description?: string
  robots?: string | Record<string, unknown>
  [key: string]: unknown
}
