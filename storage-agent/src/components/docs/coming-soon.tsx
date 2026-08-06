import { Construction, Sparkles } from "lucide-react"
import { DocLead, DocTitle } from "./primitives"

type DocComingSoonProps = {
  /** 文档标题，例如「功能接口引导」「功能组件引导」。 */
  title: string
  /** 当前选中的版本号，例如 "v2"。 */
  version: string
  /** 一句话说明这个版本目前的状态。 */
  summary: string
  /** 规划中、尚未定稿的方向列表，仅供预览。 */
  highlights: string[]
}

/**
 * 「功能接口引导」「功能组件引导」共用的版本占位页。
 *
 * 文档页右上角的版本下拉选择器（DocVersionSwitcher）选中一个 status 为 "developing" 的
 * 版本时，两个页面都渲染这个组件，而不是把未定稿的内容当成已发布文档展示。切换回已发布
 * 版本（如 v1）会立刻恢复完整内容，全程只是前端状态切换，不发任何请求。
 */
export function DocComingSoon({ title, version, summary, highlights }: DocComingSoonProps) {
  return (
    <div className="pb-10">
      <div className="flex flex-col gap-5 border-b border-border/70 pb-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <DocTitle>{title}</DocTitle>
            <span className="inline-flex h-6 items-center gap-1 rounded-full bg-amber-500/10 px-2.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
              {version} · 开发中
            </span>
          </div>
          <DocLead>{summary}</DocLead>
        </div>
      </div>

      <div className="mt-10 flex flex-col items-center gap-4 rounded-xl border border-dashed border-border/70 bg-muted/20 px-6 py-16 text-center">
        <Construction className="h-10 w-10 text-amber-500" aria-hidden />
        <div>
          <p className="text-base font-semibold text-foreground">{version} 尚未发布，内容正在编写中</p>
          <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
            切回页面右上角的 <span className="font-medium text-foreground">v1</span>{" "}
            可查看当前已发布的完整内容；版本切换只改变这份文档本身的展示，纯前端状态，不会触发任何请求。
          </p>
        </div>

        {highlights.length > 0 ? (
          <div className="mt-2 w-full max-w-md rounded-lg border border-border/60 bg-background/60 p-4 text-left">
            <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" aria-hidden />
              规划中的方向（尚未定稿，仅供预览）
            </div>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
              {highlights.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-primary">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  )
}
