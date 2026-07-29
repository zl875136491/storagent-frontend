import { useEffect, useMemo } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { BookOpen, ChevronRight, Layers, Plug, Rocket } from "lucide-react"
import { cn } from "@/lib/utils"
import { DocsNavProvider, useGoDoc } from "@/components/docs/nav-context"
import { DocsOnThisPage, DocsTocProvider } from "@/components/docs/primitives"
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

  useEffect(() => {
    const raw = searchParams.get("doc")
    if (raw === "developer-usage") {
      goDoc("usage-overview", { replace: true })
    } else if (raw === "file-components") {
      goDoc("components", { replace: true })
    }
  }, [searchParams, goDoc])

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col bg-background lg:flex-row">
      <aside className="shrink-0 border-b border-border/60 bg-card/40 lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:w-60 lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="px-4 py-5">
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

      <div className="min-w-0 flex-1">
        <div className="border-b border-border/50 bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground sm:px-8">
          <div className="mx-auto flex max-w-6xl items-center gap-1.5">
            <Link to="/docs" className="hover:text-foreground">
              文档
            </Link>
            <ChevronRight className="h-3 w-3 opacity-50" />
            <span className="font-medium text-foreground">
              {NAV.find((n) => n.id === active)?.title}
            </span>
          </div>
        </div>

        <div className="mx-auto flex max-w-6xl gap-10 px-4 py-8 sm:px-8 lg:px-10">
          <main className="min-w-0 flex-1">
            {active === "getting-started" && <GettingStartedPage />}
            {active === "usage-overview" && <UsageOverviewPage />}
            {active === "api-guide" && <ApiGuidePage />}
            {active === "components" && <FileComponentsGuidePage />}
          </main>
          <aside className="hidden w-44 shrink-0 xl:block">
            <div className="sticky top-24">
              <DocsOnThisPage />
            </div>
          </aside>
        </div>
      </div>
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
