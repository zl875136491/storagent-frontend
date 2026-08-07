import { useMemo } from "react"
import { Download, KeyRound, Lock, Server } from "lucide-react"
import { ApiEndpoint, ApiParamTable } from "@/components/docs/api"
import { DocCodeBlock, DocCodeTabs } from "@/components/docs/code"
import {
  DocHeading,
  DocLead,
  DocNote,
  DocSteps,
  DocTitle,
  useRegisterToc,
} from "@/components/docs/primitives"
import { DocComingSoon } from "@/components/docs/coming-soon"
import { useDocVersion } from "@/components/docs/version-switcher"
import {
  API_GUIDE_CODE_VARIANTS,
  getApiGuideContent,
  type ApiGuideCodeVariant,
  type ApiGuidePlane,
} from "./api-guide-content"

const PLANE_LABEL: Record<ApiGuidePlane, string> = {
  public: "公共接口",
  control: "控制面 · 仅 App 后端",
  data: "数据面 · 前端可直连",
}

const VARIANT_ORDER: ApiGuideCodeVariant[] = ["server-ts", "server-py", "browser"]

export default function ApiGuidePage() {
  const [version] = useDocVersion()
  const content = useMemo(() => getApiGuideContent(version), [version])
  const toc = useMemo(() => {
    if (content.status !== "released") {
      return [{ id: "coming-soon", title: "版本预告", level: 2 as const }]
    }
    return [
      { id: "versioning", title: "版本说明", level: 2 as const },
      { id: "planes", title: "控制面 / 数据面", level: 2 as const },
      { id: "workflow", title: "推荐流程", level: 2 as const },
      { id: "client-setup", title: "公共请求封装", level: 2 as const },
      ...content.endpoints.map((endpoint) => ({
        id: endpoint.id,
        title: endpoint.summary,
        level: 2 as const,
      })),
      { id: "errors", title: "错误与跨区域回退", level: 2 as const },
    ]
  }, [content])
  useRegisterToc(toc)

  if (content.status !== "released") {
    return (
      <DocComingSoon
        title="功能接口引导"
        version={content.version}
        summary={content.summary}
        highlights={content.highlights}
      />
    )
  }

  const markdownDownloadHref = `data:text/markdown;charset=utf-8,${encodeURIComponent(content.generateMarkdown())}`

  return (
    <div className="pb-10">
      <div className="flex flex-col gap-5 border-b border-border/70 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <DocTitle>功能接口引导</DocTitle>
            <span className="inline-flex h-6 items-center rounded-full bg-primary/10 px-2.5 text-xs font-semibold text-primary">
              {content.version}
            </span>
          </div>
          <DocLead>
            面向「App 后端 + 浏览器前端」协作的存储 HTTP API 参考，覆盖选点、分片上传直传、断点续传、
            元信息查询、跨区域回退与流式下载直连。示例代码不再按语言区分整份文档，而是按角色（App 后端 /
            浏览器前端）区分；本页只维护这一份 {content.version} Markdown。
          </DocLead>
        </div>
        <a
          href={markdownDownloadHref}
          download={`storagent-api-guide-${content.version}.md`}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`下载 ${content.version} 接入文档`}
        >
          下载 {content.version} Markdown
          <Download className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        </a>
      </div>

      <section id="versioning" className="mt-8 scroll-m-36">
        <DocHeading id="versioning-heading" level={2} className="mt-0">
          版本说明
        </DocHeading>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          当前业务接口版本为 <code className="rounded bg-muted px-1 font-mono text-[11px]">{content.version}</code>，
          统一挂载在 <code className="rounded bg-muted px-1 font-mono text-[11px]">{content.versionPrefix}</code> 前缀下。
          右上角「文档版本」切换器只影响这份文档本身的展示，纯前端状态，不会触发任何请求。
        </p>
        <DocNote>
          历史未带版本号的 <code className="font-mono text-[11px]">/api/*</code> 接口已经<strong>完全下线，不再兼容</strong>：
          其鉴权模型允许前端直接持有 <code className="font-mono text-[11px]">x-api-key</code>，一旦经浏览器网络面板泄露即可
          被冒用发起任意上传/下载，视为不安全设计，已被 {content.version} 的能力令牌机制完全取代。
        </DocNote>
      </section>

      <section id="planes" className="mt-10 scroll-m-36">
        <DocHeading id="planes-heading" level={2} className="mt-0">
          控制面 / 数据面
        </DocHeading>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border/70 p-3">
            <Server className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
            <div className="mt-2 text-xs font-semibold text-foreground">Base URL</div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              使用 Storagent API 根地址，例如 https://storagent.example.com；通过公共端点探测就近选择。
            </p>
          </div>
          <div className="rounded-lg border border-border/70 p-3">
            <KeyRound className="h-4 w-4 text-sky-600 dark:text-sky-300" />
            <div className="mt-2 text-xs font-semibold text-foreground">控制面</div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              init / complete / abort / parts / stat / locate 只允许 App 后端使用 x-api-key 调用。
            </p>
          </div>
          <div className="rounded-lg border border-border/70 p-3">
            <Lock className="h-4 w-4 text-rose-600 dark:text-rose-300" />
            <div className="mt-2 text-xs font-semibold text-foreground">数据面</div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              multipart/part 与 object/download 由浏览器前端直连，携带 App 后端签发的能力令牌（token），
              绝不使用 x-api-key。
            </p>
          </div>
        </div>
        <DocNote>
          本页固定了前后端各自的职责，不再由业务方“自由选择前后端实现”。App 后端与 Storagent 之间使用{" "}
          <code className="font-mono text-[11px]">x-api-key</code>；App 后端与浏览器前端之间约定的“能力令牌”
          由 App 后端用 x-api-key 本地签发（HMAC-SHA256），无需额外请求 Storagent。
          浏览器要直连数据面时，Storagent 的{" "}
          <code className="font-mono text-[11px]">BACKEND_CORS_ORIGINS</code> /{" "}
          <code className="font-mono text-[11px]">FRONT_URL</code>{" "}
          必须包含页面 Origin；否则预检会返回{" "}
          <code className="font-mono text-[11px]">Disallowed CORS origin</code>，浏览器表现为{" "}
          <code className="font-mono text-[11px]">TypeError: Failed to fetch</code>
          （生产环境禁止使用通配符 <code className="font-mono text-[11px]">*</code>）。
        </DocNote>
        <div className="mt-4 space-y-3">
          <DocCodeTabs
            tabs={[
              {
                id: "server-ts",
                label: "能力令牌签发 · TypeScript",
                language: "typescript",
                code: content.capabilityTokenCode.typescript,
              },
              {
                id: "server-py",
                label: "能力令牌签发 · Python",
                language: "python",
                code: content.capabilityTokenCode.python,
              },
            ]}
          />
        </div>
      </section>

      <section id="workflow" className="mt-10 scroll-m-36">
        <DocHeading id="workflow-heading" level={2} className="mt-0">
          推荐流程
        </DocHeading>
        <DocSteps
          items={[
            { title: "发现并探测端点", body: "前端直接调用公共 endpoints/test 获取候选 Storagent 地址，并在服务启动或网络变化后重新选择低时延节点。" },
            { title: "初始化上传（App 后端）", body: "App 后端先拒绝空文件，再用完整文件的 size_bytes 调用控制面 multipart/init 跨区域预留声明容量，并签发分片上传能力令牌一并下发给前端。" },
            { title: "直连上传分片（前端）", body: "前端携带令牌直连数据面 multipart/part，默认 5 MiB 分片并按 MiB 对齐；单片不超过 64 MiB，总数不超过 10,000。同一 part_number 可顺序重传，以最后一次成功上传的 ETag 和大小为准。" },
            { title: "完成或中止（App 后端）", body: "前端把分片列表交回 App 后端，由 App 后端调用控制面 complete 完成上传；取消或不可恢复失败时改为 abort。两者都会释放会话预留容量。" },
            { title: "申请并直连下载（App 后端签发 + 前端直连）", body: "App 后端校验业务权限后签发极短期下载令牌并拼出最终 URL；前端直接对该 URL 发起流式下载。" },
          ]}
        />
      </section>

      <section id="client-setup" className="mt-10 scroll-m-36">
        <DocHeading id="client-setup-heading" level={2} className="mt-0">
          App 后端公共请求封装
        </DocHeading>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          以下封装统一处理控制面调用的鉴权、超时和结构化错误；App 后端可任选其一实现语言，浏览器前端不需要这份封装
          （前端只需拼接能力令牌发起 fetch，见各数据面接口示例）。
        </p>
        <div className="mt-4">
          <DocCodeTabs
            tabs={[
              { id: "server-ts", label: "TypeScript", language: "typescript", code: content.serverSetup.typescript },
              { id: "server-py", label: "Python", language: "python", code: content.serverSetup.python },
            ]}
          />
        </div>
      </section>

      {content.endpoints.map((endpoint) => {
        const variants = VARIANT_ORDER
          .filter((variant) => endpoint.examples[variant])
          .map((variant) => ({
            id: variant,
            label: API_GUIDE_CODE_VARIANTS[variant].label,
            language: API_GUIDE_CODE_VARIANTS[variant].fence,
            code: endpoint.examples[variant]!,
          }))

        return (
          <ApiEndpoint
            key={endpoint.id}
            id={endpoint.id}
            method={endpoint.method}
            path={endpoint.path}
            summary={endpoint.summary}
          >
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{endpoint.description}</p>
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">鉴权</span>
              {PLANE_LABEL[endpoint.plane]}
            </div>

            {endpoint.params.map((section) => (
              <ApiParamTable key={section.title} title={section.title} rows={section.rows} />
            ))}
            {endpoint.notes?.length ? (
              <div className="mt-4 border-l-2 border-amber-500/70 pl-3 text-xs leading-relaxed text-muted-foreground">
                {endpoint.notes.map((note) => (
                  <p key={note} className="mt-1 first:mt-0">{note}</p>
                ))}
              </div>
            ) : null}

            <div className="mt-4 space-y-3">
              <DocCodeTabs tabs={variants} />
              {endpoint.response ? (
                <DocCodeBlock language="json" title="Response 200" code={endpoint.response} />
              ) : null}
            </div>
          </ApiEndpoint>
        )
      })}

      <section id="errors" className="mt-10 scroll-m-36 border-t border-border/70 pt-8">
        <DocHeading id="errors-heading" level={2} className="mt-0">
          错误与跨区域回退
        </DocHeading>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          失败响应通常包含 msg、data 和稳定业务 code。调用侧应同时检查 HTTP 状态与业务码，并保留可恢复上下文。
        </p>
        <div className="mt-4 overflow-x-auto rounded-lg border border-border/70">
          <table className="w-full min-w-[34rem] text-left text-xs">
            <thead className="border-b border-border/70 bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">业务码</th>
                <th className="px-3 py-2 font-medium">含义</th>
                <th className="px-3 py-2 font-medium">建议处理</th>
              </tr>
            </thead>
            <tbody>
              {content.errorCodes.map(([code, meaning, action]) => (
                <tr key={code} className="border-b border-border/50 last:border-b-0">
                  <td className="px-3 py-2 font-mono text-[11px] text-foreground">{code}</td>
                  <td className="px-3 py-2 text-foreground">{meaning}</td>
                  <td className="px-3 py-2 text-muted-foreground">{action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4">
          <DocCodeTabs
            tabs={[
              { id: "server-ts", label: "TypeScript", language: "typescript", code: content.errorExamples.typescript },
              { id: "server-py", label: "Python", language: "python", code: content.errorExamples.python },
            ]}
          />
        </div>
      </section>
    </div>
  )
}
