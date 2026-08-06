import { useEffect, useMemo, useRef } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { BookOpen, ChevronRight, Layers, Plug, Rocket } from "lucide-react"
import { cn } from "@/lib/utils"
import { DocsNavProvider, useGoDoc } from "@/components/docs/nav-context"
import { DocsOnThisPage, DocsTocProvider } from "@/components/docs/primitives"
import { DocVersionSwitcher } from "@/components/docs/version-switcher"
import GettingStartedPage from "@/pages/docs/GettingStartedPage"
import UsageOverviewPage from "@/pages/docs/UsageOverviewPage"
import ApiGuidePage from "@/pages/docs/ApiGuidePage"
import FileComponentsGuidePage from "@/pages/docs/FileComponentsGuidePage"

type DocId = "getting-started" | "usage-overview" | "api-guide" | "components"

const NAV: { id: DocId; title: string; icon: typeof Rocket; hint: string }[] = [
  { id: "getting-started", title: "快速开始", icon: Rocket, hint: "最短路径上手" },
  { id: "usage-overview", title: "使用概览", icon: BookOpen, hint: "控制台怎么用" },
  { id: "api-guide", title: "功能接口引导", icon: Plug, hint: "HTTP API 参考" },
  { id: "components", title: "功能组件引导", icon: Layers, hint: "上传 / 下载演示" },
]

function resolveDocId(raw: string | null): DocId {
  if (raw === "developer-usage" || raw === "file-components") return raw === "file-components" ? "components" : "usage-overview"
  if (raw === "getting-started" || raw === "usage-overview" || raw === "api-guide" || raw === "components") {
    return raw
  }
  return "getting-started"
}

function DocsShell() {
  const [searchParams] = useSearchParams()
  const goDoc = useGoDoc()
  const active = useMemo(() => resolveDocId(searchParams.get("doc")), [searchParams])
  const showVersionSwitcher = active === "api-guide" || active === "components"
  const shellScrollRef = useRef<HTMLDivElement>(null)
  const contentScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const raw = searchParams.get("doc")
    if (raw === "developer-usage") {
      goDoc("usage-overview", { replace: true })
    } else if (raw === "file-components") {
      goDoc("components", { replace: true })
    }
  }, [searchParams, goDoc])

  useEffect(() => {
    shellScrollRef.current?.scrollTo({ top: 0 })
    contentScrollRef.current?.scrollTo({ top: 0 })
  }, [active])

  return (
    <div
      ref={shellScrollRef}
      className="docs-scroll flex h-full min-h-0 flex-col overflow-y-auto bg-background lg:flex-row lg:overflow-hidden"
    >
      <aside className="shrink-0 border-b border-border/60 bg-muted/15 lg:h-full lg:w-60 lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="px-4 pb-3 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            文档中心
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">Storagent Docs</p>
        </div>
        <nav className="space-y-0.5 px-2 pb-6" aria-label="文档导航">
          {NAV.map((item) => {
            const Icon = item.icon
            const isActive = active === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => goDoc(item.id)}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{item.title}</span>
                  <span className="mt-0.5 block text-[11px] opacity-80">{item.hint}</span>
                </span>
              </button>
            )
          })}
        </nav>
      </aside>

      <section className="min-w-0 flex-1 lg:flex lg:min-h-0 lg:flex-col">
        <div className="shrink-0 border-b border-border/60 bg-background px-4 py-2.5 text-xs text-muted-foreground sm:px-8 lg:px-10">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-1.5">
              <Link to="/docs" className="hover:text-foreground">
                文档
              </Link>
              <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />
              <span className="truncate font-medium text-foreground">
                {NAV.find((n) => n.id === active)?.title}
              </span>
            </div>
            {showVersionSwitcher ? <DocVersionSwitcher className="shrink-0" /> : null}
          </div>
        </div>

        <div
          ref={contentScrollRef}
          className="docs-scroll min-w-0 lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
        >
          <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8 lg:px-10">
            {active === "getting-started" && <GettingStartedPage />}
            {active === "usage-overview" && <UsageOverviewPage />}
            {active === "api-guide" && <ApiGuidePage />}
            {active === "components" && <FileComponentsGuidePage />}
          </main>
        </div>
      </section>

      <aside className="docs-scroll hidden h-full w-48 shrink-0 overflow-y-auto border-l border-border/60 bg-muted/15 px-4 py-6 xl:block">
        <DocsOnThisPage />
      </aside>
    </div>
  )
}

export default function DocsPage() {
  return (
    <DocsTocProvider>
      <DocsNavProvider>
        <DocsShell />
      </DocsNavProvider>
    </DocsTocProvider>
  )
}
