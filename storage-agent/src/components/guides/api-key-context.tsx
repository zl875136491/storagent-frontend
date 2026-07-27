import type { ReactNode } from "react"
import { createContext, useCallback, useContext, useMemo, useState } from "react"

type ApiKeyContextValue = {
  apiKey: string
  setApiKey: (next: string) => void
  clearApiKey: () => void
}

const ApiKeyContext = createContext<ApiKeyContextValue | null>(null)

const STORAGE_KEY = "storagent.demo.apiKey"

function loadStoredApiKey(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? ""
  } catch {
    return ""
  }
}

export function ApiKeyProvider({ children }: { children: ReactNode }) {
  const [apiKey, setApiKeyState] = useState(loadStoredApiKey)

  const setApiKey = useCallback((next: string) => {
    const v = next.trim()
    setApiKeyState(v)
    try {
      if (v) window.localStorage.setItem(STORAGE_KEY, v)
      else window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  }, [])

  const clearApiKey = useCallback(() => setApiKey(""), [setApiKey])

  const value = useMemo<ApiKeyContextValue>(
    () => ({ apiKey, setApiKey, clearApiKey }),
    [apiKey, clearApiKey, setApiKey],
  )

  return <ApiKeyContext.Provider value={value}>{children}</ApiKeyContext.Provider>
}

export function useApiKey() {
  const ctx = useContext(ApiKeyContext)
  if (!ctx) {
    throw new Error("useApiKey 必须在 ApiKeyProvider 内使用")
  }
  return ctx
}
