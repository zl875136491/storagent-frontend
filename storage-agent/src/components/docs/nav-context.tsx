import { createContext, useCallback, useContext, type ReactNode } from "react"
import { useSearchParams } from "react-router-dom"

type GoDocOptions = { replace?: boolean }

type DocsNavContextValue = {
  goDoc: (id: string, options?: GoDocOptions) => void
}

const DocsNavContext = createContext<DocsNavContextValue | null>(null)

export function DocsNavProvider({ children }: { children: ReactNode }) {
  const [, setSearchParams] = useSearchParams()

  const goDoc = useCallback(
    (id: string, options?: GoDocOptions) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set("doc", id)
          return next
        },
        { replace: options?.replace ?? false },
      )
      window.scrollTo({ top: 0, behavior: "smooth" })
    },
    [setSearchParams],
  )

  return <DocsNavContext.Provider value={{ goDoc }}>{children}</DocsNavContext.Provider>
}

export function useGoDoc() {
  const ctx = useContext(DocsNavContext)
  if (!ctx) throw new Error("useGoDoc must be used within DocsNavProvider")
  return ctx.goDoc
}
