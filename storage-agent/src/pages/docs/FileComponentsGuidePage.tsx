import { useMemo, useState } from "react"
import { Eye, EyeOff, KeyRound, Server } from "lucide-react"

import { ApiKeyProvider, useApiKey } from "@/components/guides/api-key-context"
import { FileDownloadDemo } from "@/components/guides/file-download-demo"
import { FileUploadDemo } from "@/components/guides/file-upload-demo"
import {
  GuideEndpointsProvider,
  useGuideDemoBackendSelection,
} from "@/components/guides/guide-endpoints-context"
import { GuideBackendSelector } from "@/components/guides/guide-backend-selector"
import { DocComingSoon } from "@/components/docs/coming-soon"
import { useGoDoc } from "@/components/docs/nav-context"
import {
  DocHeading,
  DocLead,
  DocNote,
  DocTitle,
  useRegisterToc,
} from "@/components/docs/primitives"
import { useDocVersion } from "@/components/docs/version-switcher"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { getComponentGuideContent } from "./file-components-content"

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
            上传和下载共用这枚 APIKey，并通过请求头 <code className="font-mono">x-api-key</code> 发送。
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
        演示密钥只保存在当前浏览器。生产接入请由业务服务端保存，避免将 APIKey 放入前端包。
      </p>
    </div>
  )
}

function ComponentsDemoContent() {
  const goDoc = useGoDoc()
  const { apiKey } = useApiKey()
  const { base, setBase } = useGuideDemoBackendSelection()
  const [lastUploadedObjectKey, setLastUploadedObjectKey] = useState<string | null>(null)
  const [version] = useDocVersion()
  const versionContent = useMemo(() => getComponentGuideContent(version), [version])
  const toc = useMemo(() => {
    if (versionContent.status !== "released") {
      return [{ id: "coming-soon", title: "版本预告", level: 2 as const }]
    }
    return [
      { id: "demo-config", title: "演示配置", level: 2 as const },
      { id: "upload-demo", title: "上传演示", level: 2 as const },
      { id: "download-demo", title: "下载演示", level: 2 as const },
    ]
  }, [versionContent])
  useRegisterToc(toc)

  if (versionContent.status !== "released") {
    return (
      <DocComingSoon
        title="功能组件演示"
        version={versionContent.version}
        summary={versionContent.summary}
        highlights={versionContent.highlights}
      />
    )
  }

  return (
    <div className="pb-10">
      <div className="border-b border-border/70 pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <DocTitle>功能组件演示</DocTitle>
          <span className="inline-flex h-6 items-center rounded-full bg-primary/10 px-2.5 text-xs font-semibold text-primary">
            {version}
          </span>
        </div>
        <DocLead>
          在控制台中完成一次文件上传与下载，观察组件的配置、进度和结果联动。
        </DocLead>
      </div>

      <section id="demo-config" className="mt-8 scroll-m-36">
        <DocHeading id="demo-config-heading" level={2} className="mt-0">
          演示配置
        </DocHeading>
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <ApiKeyBox />
          <div className="rounded-lg border border-border/70 bg-card/40 p-4">
            <div className="flex items-start gap-3">
              <Server className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" aria-hidden />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-foreground">共享服务端点</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  上传和下载使用同一个 Storagent API 基址；切换后两处演示同时生效。
                </p>
              </div>
            </div>
            <div className="mt-4">
              <GuideBackendSelector value={base} onChange={setBase} />
            </div>
          </div>
        </div>
        <DocNote>
          本页只验证控制台组件交互。调用关系见
          <button
            type="button"
            className="ml-1 font-medium text-primary underline-offset-4 hover:underline"
            onClick={() => goDoc("getting-started")}
          >
            快速开始
          </button>
          ，请求约束见
          <button
            type="button"
            className="ml-1 font-medium text-primary underline-offset-4 hover:underline"
            onClick={() => goDoc("api-guide")}
          >
            功能接口引导
          </button>
          。
        </DocNote>
      </section>

      <section id="upload-demo" className="mt-10 scroll-m-36">
        <DocHeading id="upload-demo-heading" level={2} className="mt-0">
          上传演示
        </DocHeading>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          选择文件并完成上传。成功后的 object_key 会自动填入下方下载演示。
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
          下载演示
        </DocHeading>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          可查看下载进度、已接收数据量和传输速度，也可取消正在进行的下载。
        </p>
        <div className="mt-4">
          <FileDownloadDemo apiKey={apiKey} baseURL={base} defaultObjectKey={lastUploadedObjectKey ?? undefined} />
        </div>
      </section>
    </div>
  )
}

function InnerPage() {
  return (
    <GuideEndpointsProvider>
      <ComponentsDemoContent />
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
