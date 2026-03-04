import { useMemo } from "react"
import { MarkdownDoc } from "@/components/docs/markdown-doc"
import { TableOfContents } from "@/components/docs/table-of-contents"

// 使用 Vite 的 raw 导入，将 Markdown 作为字符串加载
// eslint-disable-next-line import/no-unresolved
import gettingStartedContent from "@/docs/getting-started.md?raw"

const docs = [
  {
    id: "getting-started",
    title: "快速开始",
    description: "了解 Storage Agent 的核心概念与典型使用流程。",
    content: gettingStartedContent as string,
    section: "指南",
  },
]

export default function DocsPage() {
  const currentDoc = useMemo(() => docs[0], [])

  return (
    <div className="mx-auto flex max-w-6xl gap-8">
      {/* 左侧：文档导航（类似 shadcn 左侧 docs nav） */}
      <aside className="hidden w-56 shrink-0 border-r pr-4 text-xs text-muted-foreground lg:block">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          文档中心
        </div>
        <div className="space-y-4">
          <div>
            <div className="mb-2 text-[11px] font-semibold text-muted-foreground">
              指南
            </div>
            <nav className="space-y-1">
              {docs
                .filter((doc) => doc.section === "指南")
                .map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[13px] text-foreground/80 hover:bg-accent hover:text-accent-foreground"
                  >
                    <span>{doc.title}</span>
                  </button>
                ))}
            </nav>
          </div>
        </div>
      </aside>

      {/* 中间：文档正文 */}
      <section className="min-w-0 flex-1 space-y-4">
        <div className="mb-4 space-y-1">
          <h1 className="scroll-m-20 text-3xl font-semibold tracking-tight">
            {currentDoc.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {currentDoc.description}
          </p>
        </div>
        <MarkdownDoc content={currentDoc.content} />
      </section>

      {/* 右侧：本页导航（类似 shadcn 右侧 ToC） */}
      <aside className="hidden w-60 shrink-0 pl-2 lg:block">
        <TableOfContents content={currentDoc.content} />
      </aside>
    </div>
  )
}

