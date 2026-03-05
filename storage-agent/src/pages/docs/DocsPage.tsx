import { useEffect, useMemo } from "react"
import { useSearchParams } from "react-router-dom"
import { MarkdownDoc } from "@/components/docs/markdown-doc"
import { TableOfContents } from "@/components/docs/table-of-contents"
import { cn } from "@/lib/utils"

// 使用 Vite 的 raw 导入，将 Markdown 作为字符串加载
// eslint-disable-next-line import/no-unresolved
import gettingStartedContent from "@/docs/getting-started.md?raw"
import developerUsageContent from "@/docs/developer-usage.md?raw"

const docs = [
  {
    id: "getting-started",
    title: "快速开始",
    description: "了解 Storage Agent 的核心概念与典型使用流程。",
    content: gettingStartedContent as string,
    section: "指南",
  },
  {
    id: "developer-usage",
    title: "开发人员使用指南",
    description: "了解开发人员如何使用 Storage Agent 跨区域存储系统。",
    content: developerUsageContent as string,
    section: "指南",
  },
]

const DOC_PARAM = "doc"

export default function DocsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const docId = searchParams.get(DOC_PARAM) ?? docs[0].id
  const currentDoc = useMemo(
    () => docs.find((d) => d.id === docId) ?? docs[0],
    [docId],
  )

  const setDoc = (id: string) => {
    setSearchParams({ [DOC_PARAM]: id }, { replace: true })
  }

  // 无效 doc 时同步 URL 为当前文档 id
  useEffect(() => {
    if (docId !== currentDoc.id) {
      setSearchParams({ [DOC_PARAM]: currentDoc.id }, { replace: true })
    }
  }, [docId, currentDoc.id, setSearchParams])

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden -ml-4 md:-ml-8 mr-0 pl-2 pr-4 md:pl-4 md:pr-8">
      <div className="grid flex-1 min-h-0 grid-cols-1 gap-4 lg:grid-cols-[theme(spacing.36)_1fr_theme(spacing.48)] lg:gap-6">
        {/* 左侧：文档导航（固定宽度，不随正文滚动） */}
        <aside className="hidden flex-col border-r border-border/70 pr-3 text-xs text-muted-foreground lg:flex">
          {/* <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            文档中心
          </div> */}
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

        {/* 中间：文档正文（固定占满中间列，预留滚动条轨道防抖动，滚动条不遮挡内容） */}
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
            <MarkdownDoc content={currentDoc.content} />
          </div>
        </section>

        {/* 右侧：本页导航（固定宽度，项多时本列内滚动） */}
        <aside className="hidden min-h-0 overflow-y-auto pl-2 docs-scroll lg:block">
          <TableOfContents content={currentDoc.content} />
        </aside>
      </div>
    </div>
  )
}

