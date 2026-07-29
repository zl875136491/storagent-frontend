import type { ReactElement } from "react"
import { useEffect, useMemo } from "react"
import { useSearchParams } from "react-router-dom"
import { MarkdownDoc } from "@/components/docs/markdown-doc"
import { TableOfContents } from "@/components/docs/table-of-contents"
import { cn } from "@/lib/utils"

import gettingStartedContent from "@/docs/getting-started.md?raw"
import usageOverviewContent from "@/docs/usage-overview.md?raw"
import apiGuideContent from "@/docs/api-guide.md?raw"
import FileComponentsGuidePage from "@/pages/docs/FileComponentsGuidePage"

type DocItem = {
  id: string
  title: string
  description: string
  section: string
} & (
  | { content: string; element?: never }
  | { element: ReactElement; content?: never }
)

const docs = [
  {
    id: "getting-started",
    title: "快速开始",
    description: "5 分钟弄清角色分工、上手路径与鉴权约定。",
    content: gettingStartedContent as string,
    section: "指南",
  },
  {
    id: "usage-overview",
    title: "使用概览",
    description: "对照控制台菜单的系统使用向导，说明各模块能力与权限边界。",
    content: usageOverviewContent as string,
    section: "指南",
  },
  {
    id: "api-guide",
    title: "功能接口引导",
    description: "对外存储 HTTP 接口说明与调用示例，便于自行设计组件。",
    content: apiGuideContent as string,
    section: "指南",
  },
  {
    id: "file-components",
    title: "功能组件引导",
    description: "控制台内可试用的上传/下载 Demo，以及可拷贝到外部项目的独立组件代码。",
    element: <FileComponentsGuidePage />,
    section: "指南",
  },
] as const satisfies readonly DocItem[]

const DOC_PARAM = "doc"

export default function DocsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const defaultDocId = docs[0]?.id ?? "getting-started"
  const rawDocId = searchParams.get(DOC_PARAM) ?? defaultDocId
  // 旧链接兼容：开发人员使用指南 → 使用概览
  const docId = rawDocId === "developer-usage" ? "usage-overview" : rawDocId
  const currentDoc = useMemo(
    () => docs.find((d) => d.id === docId) ?? docs[0],
    [docId],
  )

  const setDoc = (id: string) => {
    setSearchParams({ [DOC_PARAM]: id }, { replace: true })
  }

  useEffect(() => {
    if (docId !== currentDoc.id || rawDocId === "developer-usage") {
      setSearchParams({ [DOC_PARAM]: currentDoc.id }, { replace: true })
    }
  }, [docId, rawDocId, currentDoc.id, setSearchParams])

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden -ml-4 md:-ml-8 mr-0 pl-2 pr-4 md:pl-4 md:pr-8">
      <div className="grid flex-1 min-h-0 grid-cols-1 gap-4 lg:grid-cols-[theme(spacing.36)_1fr_theme(spacing.48)] lg:gap-6">
        <aside className="hidden flex-col border-r border-border/70 pr-3 text-xs text-muted-foreground lg:flex">
          <div className="space-y-3">
            <div>
              <div className="mb-1.5 text-[10px] font-semibold text-muted-foreground">
                指南
              </div>
              <nav className="space-y-1">
                {docs
                  .filter((doc) => doc.section === "指南")
                  .map((doc) => (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => setDoc(doc.id)}
                      className={cn(
                        "flex w-full items-center rounded-md px-2 py-1 text-left text-[12px] transition-colors",
                        currentDoc.id === doc.id
                          ? "bg-accent font-medium text-accent-foreground"
                          : "text-foreground/80 hover:bg-accent/70 hover:text-accent-foreground",
                      )}
                    >
                      <span className="line-clamp-2">{doc.title}</span>
                    </button>
                  ))}
              </nav>
            </div>
          </div>
        </aside>

        <section className="min-w-0 overflow-y-auto overflow-x-hidden docs-scroll pr-3 -mr-3 lg:pr-4 lg:-mr-4">
          <div className="space-y-4 pb-8">
            <div className="space-y-1">
              <h1 className="scroll-m-20 text-3xl font-semibold tracking-tight">
                {currentDoc.title}
              </h1>
              <p className="text-sm text-muted-foreground">
                {currentDoc.description}
              </p>
            </div>
            {"content" in currentDoc ? (
              <MarkdownDoc content={currentDoc.content} />
            ) : (
              currentDoc.element
            )}
          </div>
        </section>

        <aside className="hidden min-h-0 overflow-y-auto pl-2 docs-scroll lg:block">
          {"content" in currentDoc ? (
            <TableOfContents content={currentDoc.content} />
          ) : null}
        </aside>
      </div>
    </div>
  )
}
