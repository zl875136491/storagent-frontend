import { useCallback, useEffect, useMemo, useState } from "react"
import { KeyRound, Server } from "lucide-react"

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
import { Label } from "@/components/ui/label"
import { fetchDemoApiKeysApi, type DemoAPIKey } from "@/api/client"
import { useAuth } from "@/auth/AuthContext"

import { getComponentGuideContent } from "./file-components-content"

function ApiKeyBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { accessToken } = useAuth()
  const [keys, setKeys] = useState<DemoAPIKey[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    void fetchDemoApiKeysApi(accessToken ?? undefined)
      .then((response) => {
        if (!active) return
        setKeys(response.data)
        if (value && !response.data.some((item) => item.id === value)) onChange("")
      })
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [accessToken, onChange, value])

  return (
    <div className="rounded-lg border border-border/70 bg-card/40 p-4">
      <div className="flex items-start gap-3"><KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-300" aria-hidden /><div><h3 className="text-sm font-semibold text-foreground">演示鉴权</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">选择本人有效 APIKey 对象；浏览器不会接触密钥明文。</p></div></div>
      <div className="mt-4 space-y-2"><Label htmlFor="demo-api-key">可用 APIKey</Label><select id="demo-api-key" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50" value={value} disabled={loading} onChange={(event) => onChange(event.target.value)}><option value="">{loading ? "正在读取可用 APIKey..." : "选择 APIKey"}</option>{keys.map((item) => <option key={item.id} value={item.id}>{item.application.shown_name || item.application.name} · {item.key_hint}</option>)}</select></div>
    </div>
  )
}

function ComponentsDemoContent() {
  const goDoc = useGoDoc()
  const { accessToken } = useAuth()
  const [apiKeyId, setApiKeyId] = useState("")
  const selectApiKey = useCallback((next: string) => setApiKeyId(next), [])
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
          用真实浏览器交互演示上传与下载组件。完整接口验证已迁移至系统管理中的服务运维。
        </DocLead>
      </div>

      <section id="demo-config" className="mt-8 scroll-m-36">
        <DocHeading id="demo-config-heading" level={2} className="mt-0">
          演示配置
        </DocHeading>
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <ApiKeyBox value={apiKeyId} onChange={selectApiKey} />
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
          上传与下载演示都通过当前登录用户的 APIKey 对象引用完成鉴权。调用关系见
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
            apiKeyId={apiKeyId}
            accessToken={accessToken ?? undefined}
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
          <FileDownloadDemo
            apiKeyId={apiKeyId}
            accessToken={accessToken ?? undefined}
            baseURL={base}
            defaultObjectKey={lastUploadedObjectKey ?? undefined}
          />
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
  return <InnerPage />
}
