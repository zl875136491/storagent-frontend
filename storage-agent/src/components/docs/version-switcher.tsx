import { ChevronDown } from "lucide-react"
import { useSearchParams } from "react-router-dom"
import { cn } from "@/lib/utils"
import {
  DEFAULT_DOC_VERSION,
  DOC_VERSIONS,
  isDocVersion,
  type DocVersion,
} from "@/pages/docs/doc-versions"

const DOC_VERSION_PARAM = "docv"

/**
 * 「功能接口引导」「功能组件引导」共用的文档版本选择状态。
 *
 * 版本存放在 URL query（`?docv=`）里，纯前端状态，不发任何请求：切换版本只是换一份
 * 已经打包进前端的内容表（见 api-guide-content.ts / file-components-content.ts）。
 * 用同一个 query key 意味着在两份文档之间跳转时，已选的版本会保持一致。
 */
export function useDocVersion(): [DocVersion, (next: DocVersion) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const raw = searchParams.get(DOC_VERSION_PARAM)
  const version = isDocVersion(raw) ? raw : DEFAULT_DOC_VERSION

  const setVersion = (next: DocVersion) => {
    setSearchParams(
      (prev) => {
        const nextParams = new URLSearchParams(prev)
        nextParams.set(DOC_VERSION_PARAM, next)
        return nextParams
      },
      { replace: true },
    )
  }

  return [version, setVersion]
}

const STATUS_SUFFIX: Record<string, string> = {
  developing: "（开发中）",
  deprecated: "（已下线）",
}

/** 文档版本下拉选择器，放在文档页右上角。 */
export function DocVersionSwitcher({ className }: { className?: string }) {
  const [version, setVersion] = useDocVersion()
  const current = DOC_VERSIONS.find((item) => item.id === version)

  return (
    <div className={cn("inline-flex items-center gap-1.5", className)}>
      <label htmlFor="doc-version-select" className="text-[11px] font-medium text-muted-foreground">
        文档版本
      </label>
      <div className="relative">
        <select
          id="doc-version-select"
          value={version}
          onChange={(event) => setVersion(event.target.value as DocVersion)}
          className="h-7 appearance-none rounded-md border border-border bg-background py-0 pl-2.5 pr-7 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {DOC_VERSIONS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
              {STATUS_SUFFIX[item.status] ?? ""}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
      </div>
      {current?.status === "developing" ? (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden title="开发中" />
      ) : null}
    </div>
  )
}
