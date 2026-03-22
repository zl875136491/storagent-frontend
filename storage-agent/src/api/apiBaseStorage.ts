/** 与 cross_storage_access_token 同系列，存当前选定的后端基址 */
export const STORAGE_API_BASE_KEY = "cross_storage_api_base_url"

export function getStoredApiBase(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_API_BASE_KEY)
    const t = v?.trim()
    return t || null
  } catch {
    return null
  }
}

export function setStoredApiBase(url: string): void {
  localStorage.setItem(STORAGE_API_BASE_KEY, url.trim().replace(/\/$/, ""))
}

export function clearStoredApiBase(): void {
  localStorage.removeItem(STORAGE_API_BASE_KEY)
}
