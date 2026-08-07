import { useMemo } from "react"
import { Download } from "lucide-react"

import { ApiWorkflowDiagram, generateWorkflowMarkdown } from "@/components/docs/api-workflow-diagram"
import { DocComingSoon } from "@/components/docs/coming-soon"
import { DocLead, DocNote, DocTitle, useRegisterToc } from "@/components/docs/primitives"
import { useDocVersion } from "@/components/docs/version-switcher"

export default function GettingStartedPage() {
  const [version] = useDocVersion()
  const toc = useMemo(() => [{ id: "workflow", title: "调用时序总览", level: 2 as const }], [])
  useRegisterToc(toc)
  if (version !== "v1") {
    return <DocComingSoon title="快速开始" version={version} summary="该版本的调用时序仍在设计中，发布后会在这里提供上传、下载关系图与配套导出文件。" highlights={["独立的版本化上传与下载调用关系", "每条调用的认证、输入与输出说明"]} />
  }
  const markdownHref = "data:text/markdown;charset=utf-8," + encodeURIComponent(generateWorkflowMarkdown(version))

  return (
    <div className="pb-10">
      <div className="flex flex-col gap-4 border-b border-border/70 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div><div className="flex flex-wrap items-center gap-2"><DocTitle>快速开始</DocTitle><span className="inline-flex h-6 items-center rounded-full bg-primary/10 px-2.5 text-xs font-semibold text-primary">{version}</span></div><DocLead>先用两张关系图建立 App 前端、App 后端与 Storagent 的调用边界，再进入功能接口细节。</DocLead></div>
        <a href={markdownHref} download={"storagent-workflow-" + version + ".md"} className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent" aria-label={"下载 " + version + " 调用时序 Markdown"}>下载 {version} 时序图<Download className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /></a>
      </div>
      <section id="workflow" className="mt-8 scroll-m-24">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">调用时序总览</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">上传与下载各自是一张图。连线只保留动作与顺序，点击后在图内右侧查看认证、输入和输出；全屏模式用于查看完整关系。</p>
        <DocNote><strong className="text-foreground">{version} 实现约定：</strong>App 后端使用 Python，负责业务鉴权、控制面调用和能力令牌签发；App 前端使用 TypeScript，携带 token 直连数据面。其他技术栈由开发者按同一边界自行适配。</DocNote>
        <ApiWorkflowDiagram />
      </section>
    </div>
  )
}
