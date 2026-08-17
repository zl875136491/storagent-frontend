import { createContext, useCallback, useContext, type ReactNode } from "react"
import { useLocation, useNavigate } from "react-router-dom"

type GoDocOptions = { replace?: boolean }

type DocsNavContextValue = {
  goDoc: (id: string, options?: GoDocOptions) => void
}

const DocsNavContext = createContext<DocsNavContextValue | null>(null)

const docSlugs: Record<string, string> = {
  "usage-overview": "overview",
  "getting-started": "quick-start",
  "api-guide": "api-guide",
  components: "components",
}

export function DocsNavProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()

  const goDoc = useCallback(
    (id: string, options?: GoDocOptions) => {
      const slug = docSlugs[id] ?? "overview"
      navigate(`/docs/${slug}${location.search}`, { replace: options?.replace ?? false })
      window.scrollTo({ top: 0, behavior: "smooth" })
    },
    [location.search, navigate],
  )

  return <DocsNavContext.Provider value={{ goDoc }}>{children}</DocsNavContext.Provider>
}

export function useGoDoc() {
  const ctx = useContext(DocsNavContext)
  if (!ctx) throw new Error("useGoDoc must be used within DocsNavProvider")
  return ctx.goDoc
}
