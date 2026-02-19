const normalizePath = (path: string) =>
  path.startsWith('/') ? path : `/${path}`

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '')

export const resolveApiUrl = (path: string) => {
  const normalizedPath = normalizePath(path)

  // Browser requests should always hit the same origin to avoid CORS in local dev.
  if (typeof window !== 'undefined') {
    return normalizedPath
  }

  if (process.env.NODE_ENV === 'development') {
    const devPort = process.env.PORT || '3000'

    return `http://localhost:${devPort}${normalizedPath}`
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL

  if (baseUrl) {
    return `${trimTrailingSlash(baseUrl)}${normalizedPath}`
  }

  return normalizedPath
}
