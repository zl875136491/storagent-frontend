import { useMemo, useState } from "react"
import { Download, Eye, EyeOff, KeyRound, Server } from "lucide-react"
import { useSearchParams } from "react-router-dom"

import { ApiKeyProvider, useApiKey } from "@/components/guides/api-key-context"
import { FileDownloadDemo } from "@/components/guides/file-download-demo"
import { FileUploadDemo } from "@/components/guides/file-upload-demo"
import {
  GuideEndpointsProvider,
  useGuideDemoBackendSelection,
} from "@/components/guides/guide-endpoints-context"
import { GuideBackendSelector } from "@/components/guides/guide-backend-selector"
import { DocCodeBlock } from "@/components/docs/code"
import { LanguageBrandIcon } from "@/components/docs/language-brand-icon"
import {
  DocHeading,
  DocLead,
  DocNote,
  DocTitle,
  useRegisterToc,
} from "@/components/docs/primitives"
import { useGoDoc } from "@/components/docs/nav-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import {
  COMPONENT_GUIDE_CODE,
  COMPONENT_GUIDE_LANGUAGES,
  generateComponentGuideMarkdown,
  type ComponentGuideLanguage,
} from "./file-components-content"
import { getApiGuideLanguage, isApiGuideLanguage } from "./api-guide-content"

function ApiKeyBox() {
  const { apiKey, setApiKey, clearApiKey } = useApiKey()
  const [draft, setDraft] = useState(apiKey)
  const [show, setShow] = useState(false)

  return (
    <div className="rounded-lg border border-border/70 bg-card/40 p-4">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-300" aria-hidden />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">在线演示鉴权</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            上传和下载共用这一枚 APIKey，只在请求头 <code className="font-mono">x-api-key</code> 中发送。
          </p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <Label htmlFor="demo-api-key">APIKey</Label>
        <div className="flex items-center gap-2">
          <Input
            id="demo-api-key"
            type={show ? "text" : "password"}
            placeholder="粘贴控制台签发的 APIKey"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button
            type="button"
            size="icon"
            variant="outline"
            title={show ? "隐藏 APIKey" : "显示 APIKey"}
            aria-label={show ? "隐藏 APIKey" : "显示 APIKey"}
            onClick={() => setShow((value) => !value)}
          >
            {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
          </Button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={() => setApiKey(draft)} disabled={!draft.trim()}>
          保存 APIKey
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            clearApiKey()
            setDraft("")
          }}
          disabled={!apiKey && !draft}
        >
          清除
        </Button>
        {apiKey ? <span className="text-[11px] text-muted-foreground">已保存，长度 {apiKey.length}</span> : null}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        演示密钥仅用于当前浏览器的本地缓存。生产接入时请改由业务服务端保存，避免把 APIKey 放进前端包。
      </p>
    </div>
  )
}

function ComponentsGuideContent() {
  const goDoc = useGoDoc()
  const [searchParams, setSearchParams] = useSearchParams()
  const { apiKey } = useApiKey()
  const { base, setBase } = useGuideDemoBackendSelection()
  const [lastUploadedObjectKey, setLastUploadedObjectKey] = useState<string | null>(null)

  const rawLanguage = searchParams.get("lang")
  const language: ComponentGuideLanguage = isApiGuideLanguage(rawLanguage) ? rawLanguage : "typescript"
  const languageMeta = getApiGuideLanguage(language)
  const code = COMPONENT_GUIDE_CODE[language]
  const markdownDownloadHref = useMemo(
    () => `data:text/markdown;charset=utf-8,${encodeURIComponent(generateComponentGuideMarkdown(language))}`,
    [language],
  )
  const toc = useMemo(
    () => [
      { id: "demo-config", title: "在线演示配置", level: 2 as const },
      { id: "upload-demo", title: "在线上传", level: 2 as const },
      { id: "download-demo", title: "在线下载", level: 2 as const },
      { id: "integration-code", title: "接入代码", level: 2 as const },
    ],
    [],
  )
  useRegisterToc(toc)

  const selectLanguage = (nextLanguage: ComponentGuideLanguage) => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        next.set("lang", nextLanguage)
        return next
      },
      { replace: true },
    )
  }

  return (
    <div className="pb-10">
      <div className="flex flex-col gap-5 border-b border-border/70 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <DocTitle>功能组件引导</DocTitle>
          <DocLead>
            用一套 APIKey 和服务端点在线验证上传、元信息查询、跨区域定位与可取消下载；下方提供 TypeScript 与 Python 两种客户端实现。
          </DocLead>
        </div>
        <a
          href={markdownDownloadHref}
          download={`storagent-file-components-guide-${language}.md`}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`下载 ${languageMeta.label} 组件接入文档`}
        >
          <LanguageBrandIcon language={language} className="h-4 w-4" />
          下载 {languageMeta.label} Markdown
          <Download className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        </a>
      </div>

      <div className="sticky top-0 z-30 -mx-4 border-b border-border/70 bg-background px-4 py-3 sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-medium text-foreground">示例语言</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              切换后，上传、下载代码和 Markdown 文档保持一致。
            </div>
          </div>
          <div className="grid w-full grid-cols-2 gap-1 rounded-lg border border-border bg-muted/40 p-1 sm:w-auto" role="group" aria-label="组件示例语言">
            {COMPONENT_GUIDE_LANGUAGES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => selectLanguage(item.id)}
                aria-pressed={language === item.id}
                className={cn(
                  "min-w-28 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  language === item.id
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <section id="demo-config" className="mt-8 scroll-m-36">
        <DocHeading id="demo-config-heading" level={2} className="mt-0">
          在线演示配置
        </DocHeading>
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <ApiKeyBox />
          <div className="rounded-lg border border-border/70 bg-card/40 p-4">
            <div className="flex items-start gap-3">
              <Server className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" aria-hidden />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-foreground">共享服务端点</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  上传和下载使用同一个已探测的 Storagent API 基址；切换后两处演示同时生效。
                </p>
              </div>
            </div>
            <div className="mt-4">
              <GuideBackendSelector value={base} onChange={setBase} />
            </div>
          </div>
        </div>
        <DocNote>
          在线演示只验证文件接口。纯 HTTP 语义、请求字段和错误码见{" "}
          <button
            type="button"
            className="font-medium text-primary underline-offset-4 hover:underline"
            onClick={() => goDoc("api-guide")}
          >
            功能接口引导
          </button>
          。
        </DocNote>
      </section>

      <section id="upload-demo" className="mt-10 scroll-m-36">
        <DocHeading id="upload-demo-heading" level={2} className="mt-0">
          在线上传
        </DocHeading>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          选择文件后，演示会使用上方共享 APIKey 和服务端点完成 multipart 初始化、分片上传与完成操作；成功后 object_key 会自动带入下载演示。
        </p>
        <div className="mt-4">
          <FileUploadDemo
            apiKey={apiKey}
            baseURL={base}
            onUploaded={(result) => setLastUploadedObjectKey(result.objectKey)}
          />
        </div>
      </section>

      <section id="download-demo" className="mt-10 scroll-m-36">
        <DocHeading id="download-demo-heading" level={2} className="mt-0">
          在线下载
        </DocHeading>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          下载过程实时展示完成比例、已接收数据量与传输速度，并可随时取消。若当前服务点没有副本，演示会展示可用节点并让跨节点下载沿用同一套进度控制。
        </p>
        <div className="mt-4">
          <FileDownloadDemo apiKey={apiKey} baseURL={base} defaultObjectKey={lastUploadedObjectKey ?? undefined} />
        </div>
      </section>

      <section id="integration-code" className="mt-10 scroll-m-36">
        <DocHeading id="integration-code-heading" level={2} className="mt-0">
          接入代码
        </DocHeading>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {language === "typescript"
            ? "完整 React 组件集成上传、object_key 回填、元信息、定位，以及带进度、速度和取消能力的跨节点下载；只依赖 React，加入项目后即可引入。"
            : "完整 Python 客户端类封装上传、元信息、定位和流式下载；下载支持进度回调与取消事件，调用方可取得 object_key、完整上传响应或下载结果字典。"}
        </p>
        <div className="mt-5 space-y-5">
          <DocCodeBlock
            language={languageMeta.fence}
            title={`${code.filename} · ${code.implementationTitle}`}
            code={code.implementation}
          />
          <DocCodeBlock
            language={languageMeta.fence}
            title={`${languageMeta.label} · ${code.usageTitle}`}
            code={code.usage}
          />
        </div>
      </section>
    </div>
  )
}

function InnerPage() {
  return (
    <GuideEndpointsProvider>
      <ComponentsGuideContent />
    </GuideEndpointsProvider>
  )
}

export default function FileComponentsGuidePage() {
  return (
    <ApiKeyProvider>
      <InnerPage />
    </ApiKeyProvider>
  )
}
