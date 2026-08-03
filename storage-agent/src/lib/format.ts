const DISPLAY_TIME_ZONE = "Asia/Shanghai"

function normalizeBackendDate(value: string): string {
  let normalized = value.trim().replace(" ", "T")
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized)) {
    normalized += "Z"
  }
  return normalized.replace(
    /\.(\d+)(?=Z|[+-]\d{2}:?\d{2}$)/i,
    (_match, fraction: string) => `.${fraction.slice(0, 3).padEnd(3, "0")}`,
  )
}

export function parseBackendDate(value?: string | null): Date | null {
  if (!value) return null
  const date = new Date(normalizeBackendDate(value))
  return Number.isNaN(date.getTime()) ? null : date
}

function partsFor(value?: string | Date | null): Record<string, string> | null {
  const date = value instanceof Date ? value : parseBackendDate(value)
  if (!date || Number.isNaN(date.getTime())) return null

  return Object.fromEntries(
    new Intl.DateTimeFormat("zh-CN", {
      timeZone: DISPLAY_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  )
}

export function formatDateTime(
  value?: string | Date | null,
  fallback = "-",
): string {
  const parts = partsFor(value)
  if (!parts) return fallback
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`
}

export function formatChartTime(value?: string | Date | null): string {
  const parts = partsFor(value)
  if (!parts) return "-"
  return `${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
}

export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB", "PB"]
  const index = Math.min(
    Math.floor(Math.log(size) / Math.log(1024)),
    units.length - 1,
  )
  const value = size / 1024 ** index
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(digits)} ${units[index]}`
}
