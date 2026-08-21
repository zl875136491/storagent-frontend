import { useMemo } from "react"
import { Download } from "lucide-react"

import { ApiWorkflowDiagram, generateWorkflowMarkdown } from "@/components/docs/api-workflow-diagram"
import { DocLead, DocNote, DocTitle, useRegisterToc } from "@/components/docs/primitives"
import { useDocVersion } from "@/components/docs/version-switcher"

export default function GettingStartedPage() {
  const [version] = useDocVersion()
  const toc = useMemo(() => [{ id: "workflow", title: "调用时序总览", level: 2 as const }], [])
  useRegisterToc(toc)
  const markdownHref = "data:text/markdown;charset=utf-8," + encodeURIComponent(generateWorkflowMarkdown(version))
  const isV2 = version === "v2"

  return (
    <div className="pb-10">
      <div className="flex flex-col gap-4 border-b border-border/70 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div><div className="flex flex-wrap items-center gap-2"><DocTitle>快速开始</DocTitle><span className="inline-flex h-6 items-center rounded-full bg-primary/10 px-2.5 text-xs font-semibold text-primary">{version}</span></div><DocLead>{isV2 ? "先用上传、下载与删除三张关系图建立调用边界，再进入 v2 的对象生命周期和一次性分享接口。" : "先用两张关系图建立 App 前端、App 后端与 Storagent 的调用边界，再进入功能接口细节。"}</DocLead></div>
        <a href={markdownHref} download={"storagent-workflow-" + version + ".md"} className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent" aria-label={"下载 " + version + " 调用时序 Markdown"}>下载 {version} 时序图<Download className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /></a>
      </div>
      <section id="workflow" className="mt-8 scroll-m-24">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">调用时序总览</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{isV2 ? "上传、下载与删除各自是一张图。连线只保留动作与顺序，点击后在图内右侧查看认证、输入和输出；全屏模式用于查看完整关系。" : "上传与下载各自是一张图。连线只保留动作与顺序，点击后在图内右侧查看认证、输入和输出；全屏模式用于查看完整关系。"}</p>
        <DocNote><strong className="text-foreground">{version} 实现约定：</strong>App 后端使用 Python，负责业务鉴权、控制面调用和能力令牌签发；App 前端使用 TypeScript，携带 token 直连数据面上传或下载，文件字节不经 App 后端中转。直连前须在控制台「应用管理 → 浏览器来源」登记页面 Origin。其他技术栈由开发者按同一边界自行适配。</DocNote>
        <DocNote><strong className="text-foreground">网关约定：</strong>默认且唯一的接入基址是 <code className="font-mono text-[11px]">http://stor.1oa.com.cn/server/local</code>。只有存在明确的区域选择需求时，才将 <code className="font-mono text-[11px]">/server/{"{region}"}</code> 中的 <code className="font-mono text-[11px]">region</code> 替换为指定区域短码；完整规则见“功能接口引导”的生产网关基址说明。</DocNote>
        {isV2 ? <DocNote><strong className="text-foreground">v2 删除约定：</strong>删除会将对象标记为软删除并立即从应用逻辑配额中剔除，MinIO 原始数据在恢复期内保留。恢复时会重新校验配额；超过恢复期后由周期任务归档和清理。</DocNote> : null}
        <ApiWorkflowDiagram version={version} />
      </section>
    </div>
  )
}
