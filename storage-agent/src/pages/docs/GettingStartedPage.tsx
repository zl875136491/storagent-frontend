import { useMemo } from "react"
import { Link } from "react-router-dom"
import { DocCodeBlock, DocCodeTabs } from "@/components/docs/code"
import { useGoDoc } from "@/components/docs/nav-context"
import {
  DocExpand,
  DocLead,
  DocNextCard,
  DocNote,
  DocSteps,
  DocTitle,
  useRegisterToc,
} from "@/components/docs/primitives"
import { DEFAULT_DOC_VERSION } from "./doc-versions"

export default function GettingStartedPage() {
  const goDoc = useGoDoc()
  const toc = useMemo(
    () => [
      { id: "prep", title: "准备", level: 2 as const },
      { id: "console", title: "控制台路径", level: 2 as const },
      { id: "first-call", title: "第一次 API 调用", level: 2 as const },
      { id: "next", title: "下一步", level: 2 as const },
    ],
    [],
  )
  useRegisterToc(toc)

  return (
    <div className="pb-10">
      <div className="flex flex-wrap items-center gap-2">
        <DocTitle>快速开始</DocTitle>
        <span className="inline-flex h-6 items-center rounded-full bg-primary/10 px-2.5 text-xs font-semibold text-primary">
          {DEFAULT_DOC_VERSION}
        </span>
      </div>
      <DocLead>三分钟内完成准备，并发出第一次文件接口请求；本页示例对应当前业务接口版本 {DEFAULT_DOC_VERSION}。</DocLead>
      <DocNote>
        {DEFAULT_DOC_VERSION} 把接口按「控制面 / 数据面」拆开：本页第一次调用用的{" "}
        <code className="font-mono text-[11px]">x-api-key</code> 只应出现在 App 后端环境里，浏览器前端不持有它。
        分片上传、下载等前端可直连的数据面接口改用 App 后端签发的能力令牌，完整说明见「功能接口引导」。
      </DocNote>

      <h2 id="prep" className="mt-8 scroll-m-24 text-xl font-semibold tracking-tight">
        准备
      </h2>
      <ul className="mt-3 space-y-2 text-sm text-foreground/90">
        <li className="flex gap-2">
          <span className="text-primary">•</span>
          <span>
            控制台账号（已登录）→{" "}
            <Link className="font-medium text-primary underline-offset-4 hover:underline" to="/login">
              登录
            </Link>
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">•</span>
          <span>
            业务 APIKey（绑定已授权应用）→{" "}
            <Link
              className="font-medium text-primary underline-offset-4 hover:underline"
              to="/data/basic/api-key"
            >
              APIKey 管理
            </Link>
          </span>
        </li>
      </ul>
      <DocNote>
        文件接口鉴权头是 <code className="font-mono text-[11px]">x-api-key</code>，不是{" "}
        <code className="font-mono text-[11px]">Authorization: Bearer</code>。
      </DocNote>

      <h2 id="console" className="mt-10 scroll-m-24 text-xl font-semibold tracking-tight">
        控制台路径
      </h2>
      <DocSteps
        items={[
          {
            title: "创建应用",
            body: (
              <>
                打开{" "}
                <Link className="text-primary underline-offset-4 hover:underline" to="/data/basic/application">
                  应用管理
                </Link>{" "}
                → 新建应用。
              </>
            ),
          },
          {
            title: "等待授权",
            body: "管理员在应用列表完成「授权」后，应用才可用于签发 APIKey。",
          },
          {
            title: "签发 APIKey",
            body: (
              <>
                打开{" "}
                <Link className="text-primary underline-offset-4 hover:underline" to="/data/basic/api-key">
                  APIKey 管理
                </Link>{" "}
                → 新建；明文只展示一次。
              </>
            ),
          },
        ]}
      />
      <DocExpand summary="管理员还要做什么？（可展开）">
        <p>
          配置{" "}
          <Link className="text-primary underline-offset-4 hover:underline" to="/data/basic/region">
            区域
          </Link>{" "}
          与{" "}
          <Link className="text-primary underline-offset-4 hover:underline" to="/data/minio">
            MinIO 服务
          </Link>
          ，再对业务应用执行授权。复制拓扑编辑仅管理员可用，详见「使用概览」。
        </p>
      </DocExpand>

      <h2 id="first-call" className="mt-10 scroll-m-24 text-xl font-semibold tracking-tight">
        第一次 API 调用
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        用 stat 验证 Key 与 Base URL 是否可用；这是一个控制面接口，请在 App 后端环境里执行，不要放进浏览器页面代码：
      </p>
      <div className="mt-3">
        <DocCodeTabs
          tabs={[
            {
              id: "curl",
              label: "cURL",
              language: "bash",
              code: `export STORAGENT_BASE_URL="https://storagent.example.com"
export STORAGENT_API_KEY="sk_..."

curl -sS -X POST "$STORAGENT_BASE_URL/api/v1/files/object/stat" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: $STORAGENT_API_KEY" \\
  -d '{"object_key":"path/to/file.bin"}'`,
            },
            {
              id: "js",
              label: "Node.js（App 后端）",
              language: "javascript",
              code: `const baseURL = process.env.STORAGENT_BASE_URL
const apiKey = process.env.STORAGENT_API_KEY

const res = await fetch(\`\${baseURL}/api/v1/files/object/stat\`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
  },
  body: JSON.stringify({ object_key: "path/to/file.bin" }),
})
console.log(await res.json())`,
            },
            {
              id: "py",
              label: "Python",
              language: "python",
              code: `import os, requests

r = requests.post(
    f"{os.environ['STORAGENT_BASE_URL'].rstrip('/')}/api/v1/files/object/stat",
    headers={"x-api-key": os.environ["STORAGENT_API_KEY"], "Content-Type": "application/json"},
    json={"object_key": "path/to/file.bin"},
    timeout=30,
)
r.raise_for_status()
print(r.json())`,
            },
          ]}
        />
      </div>
      <div className="mt-3">
        <DocCodeBlock
          language="json"
          title="Response"
          code={`{
  "bucket": "your-app",
  "object_key": "path/to/file.bin",
  "size": 1048576,
  "etag": "...",
  "content_type": "application/octet-stream",
  "last_modified": "2026-07-31T08:00:00Z",
  "region": "beijing",
  "local": true
}`}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        看到 <code className="font-mono">local: false</code> 说明对象在其它区域，完整字段说明和跨区域回退流程见「功能接口引导」。
      </p>

      <h2 id="next" className="mt-10 scroll-m-24 text-xl font-semibold tracking-tight">
        下一步
      </h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <DocNextCard
          title="使用概览"
          description="对照控制台界面，走完各模块交互。"
          onClick={() => goDoc("usage-overview")}
        />
        <DocNextCard
          title="功能接口引导"
          description="multipart / object / endpoints 完整参考。"
          onClick={() => goDoc("api-guide")}
        />
        <DocNextCard
          title="功能组件引导"
          description="可试用的上传下载 Demo 与可拷贝代码。"
          onClick={() => goDoc("components")}
        />
      </div>
    </div>
  )
}
