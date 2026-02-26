const ABSOLUTE_URL_PATTERN = /^https?:\/\//i;

export function resolveCatalogMediaUrl(input: string): string {
  const value = input.trim();
  if (!value) {
    return "";
  }

  if (
    ABSOLUTE_URL_PATTERN.test(value) ||
    value.startsWith("data:") ||
    value.startsWith("blob:") ||
    value.startsWith("/api/media/files/") ||
    value.startsWith("/api/media/proxy")
  ) {
    return value;
  }

  if (!value.startsWith("/")) {
    return value;
  }

  if (value.startsWith("/uploads/")) {
    return `/api/media/files/${value.replace(/^\/uploads\/+/, "")}`;
  }

  return `/api/media/proxy?path=${encodeURIComponent(value)}`;
}
