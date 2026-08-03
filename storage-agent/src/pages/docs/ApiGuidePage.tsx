import { useMemo } from "react"
import { Download, KeyRound, Server, ShieldCheck } from "lucide-react"
import { useSearchParams } from "react-router-dom"
import { ApiEndpoint, ApiExamples, ApiParamTable } from "@/components/docs/api"
import { DocCodeBlock, DocSplit } from "@/components/docs/code"
import { LanguageBrandIcon } from "@/components/docs/language-brand-icon"
import {
  DocHeading,
  DocLead,
  DocNote,
  DocSteps,
  DocTitle,
  useRegisterToc,
} from "@/components/docs/primitives"
import { cn } from "@/lib/utils"
import {
  API_GUIDE_ENDPOINTS,
  API_GUIDE_ERROR_CODES,
  API_GUIDE_ERROR_EXAMPLES,
  API_GUIDE_LANGUAGES,
  API_GUIDE_SETUP,
  generateApiGuideMarkdown,
  getApiGuideLanguage,
  isApiGuideLanguage,
  type ApiGuideLanguage,
} from "./api-guide-content"

export default function ApiGuidePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawLanguage = searchParams.get("lang")
  const language: ApiGuideLanguage = isApiGuideLanguage(rawLanguage) ? rawLanguage : "typescript"
  const languageMeta = getApiGuideLanguage(language)
  const markdownDownloadHref = useMemo(
    () => `data:text/markdown;charset=utf-8,${encodeURIComponent(generateApiGuideMarkdown(language))}`,
    [language],
  )
  const toc = useMemo(
    () => [
      { id: "conventions", title: "接入约定", level: 2 as const },
      { id: "workflow", title: "推荐流程", level: 2 as const },
      { id: "client-setup", title: "公共请求封装", level: 2 as const },
      ...API_GUIDE_ENDPOINTS.map((endpoint) => ({
        id: endpoint.id,
        title: endpoint.summary,
        level: 2 as const,
      })),
      { id: "errors", title: "错误与跨区域回退", level: 2 as const },
    ],
    [],
  )
  useRegisterToc(toc)

  const selectLanguage = (nextLanguage: ApiGuideLanguage) => {
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
          <DocTitle>功能接口引导</DocTitle>
          <DocLead>
            面向服务端开发的存储 HTTP API 参考，覆盖选点、分片上传、断点续传、元信息查询、跨区域回退与流式下载。
          </DocLead>
        </div>
        <a
          href={markdownDownloadHref}
          download={`storagent-api-guide-${language}.md`}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`下载 ${languageMeta.label} 接入文档`}
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
              切换后，本页所有请求代码与下载文档会保持一致。
            </div>
          </div>
          <div
            className="grid w-full grid-cols-2 gap-1 rounded-lg border border-border bg-muted/40 p-1 sm:w-auto"
            role="group"
            aria-label="代码示例语言"
          >
            {API_GUIDE_LANGUAGES.map((item) => (
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

      <section id="conventions" className="mt-8 scroll-m-36">
        <DocHeading id="conventions-heading" level={2} className="mt-0">
          接入约定
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
            <div className="mt-2 text-xs font-semibold text-foreground">鉴权</div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              文件接口统一使用 x-api-key 请求头。密钥只能存放在服务端环境变量或密钥管理服务中。
            </p>
          </div>
          <div className="rounded-lg border border-border/70 p-3">
            <ShieldCheck className="h-4 w-4 text-rose-600 dark:text-rose-300" />
            <div className="mt-2 text-xs font-semibold text-foreground">边界</div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              浏览器只调用你自己的业务后端，不直接持有 APIKey；对象键按服务端返回值原样保存。
            </p>
          </div>
        </div>
        <DocNote>
          本页示例面向 {languageMeta.runtime} 服务端。公共 endpoints 接口无需 APIKey；控制台 JWT 登录接口不在本文范围。
        </DocNote>
      </section>

      <section id="workflow" className="mt-10 scroll-m-36">
        <DocHeading id="workflow-heading" level={2} className="mt-0">
          推荐流程
        </DocHeading>
        <DocSteps
          items={[
            { title: "发现并探测端点", body: "获取候选 Storagent 地址，并在服务启动或网络变化后重新选择低时延节点。" },
            { title: "初始化上传", body: "保存 upload_id 与 object_key；它们是续传、完成和中止操作的共同上下文。" },
            { title: "上传或恢复分片", body: "保存每片 ETag；重启后先查询已上传分片，只补传缺失部分。" },
            { title: "完成或中止", body: "全部分片成功后完成上传；取消或不可恢复失败时立即中止会话。" },
            { title: "查询与下载", body: "先使用 POST stat 获取元信息，按需流式下载；当前节点缺失时执行跨区域回退。" },
          ]}
        />
      </section>

      <section id="client-setup" className="mt-10 scroll-m-36">
        <DocHeading id="client-setup-heading" level={2} className="mt-0">
          公共请求封装
        </DocHeading>
        <DocSplit
          left={
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                运行环境：<span className="font-medium text-foreground">{languageMeta.runtime}</span>
              </p>
              <p>
                依赖：<span className="font-medium text-foreground">{languageMeta.dependency}</span>
              </p>
              <p>
                通过 <code className="rounded bg-muted px-1 font-mono text-[11px]">STORAGENT_BASE_URL</code> 与{" "}
                <code className="rounded bg-muted px-1 font-mono text-[11px]">STORAGENT_API_KEY</code> 注入配置。
                请求封装统一处理鉴权、超时和结构化错误。
              </p>
            </div>
          }
          right={
            <DocCodeBlock
              language={languageMeta.fence}
              title={`${languageMeta.label} · 公共封装`}
              code={API_GUIDE_SETUP[language]}
            />
          }
        />
      </section>

      {API_GUIDE_ENDPOINTS.map((endpoint) => (
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
            {endpoint.authentication === "public" ? "公共接口" : "x-api-key 请求头"}
          </div>
          <DocSplit
            left={
              <>
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
              </>
            }
            right={
              <ApiExamples
                request={endpoint.examples[language]}
                requestLanguage={languageMeta.fence}
                requestTitle={languageMeta.label}
                response={endpoint.response}
                responseTitle="Response 200"
              />
            }
          />
        </ApiEndpoint>
      ))}

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
              {API_GUIDE_ERROR_CODES.map(([code, meaning, action]) => (
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
          <DocCodeBlock
            language={languageMeta.fence}
            title={`${languageMeta.label} · 404032 回退`}
            code={API_GUIDE_ERROR_EXAMPLES[language]}
          />
        </div>
      </section>
    </div>
  )
}
