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
      <DocTitle>快速开始</DocTitle>
      <DocLead>三分钟内完成准备，并发出第一次文件接口请求。</DocLead>

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
      <p className="mt-2 text-sm text-muted-foreground">用 stat 验证 Key 与 Base URL 是否可用：</p>
      <div className="mt-3">
        <DocCodeTabs
          tabs={[
            {
              id: "curl",
              label: "cURL",
              language: "bash",
              code: `export STORAGENT_BASE_URL="https://storagent.example.com"
export STORAGENT_API_KEY="sk_..."

curl -sS -X POST "$STORAGENT_BASE_URL/api/files/object/stat" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: $STORAGENT_API_KEY" \\
  -d '{"object_key":"path/to/file.bin"}'`,
            },
            {
              id: "js",
              label: "fetch",
              language: "javascript",
              code: `const baseURL = process.env.STORAGENT_BASE_URL
const apiKey = process.env.STORAGENT_API_KEY

const res = await fetch(\`\${baseURL}/api/files/object/stat\`, {
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
    f"{os.environ['STORAGENT_BASE_URL'].rstrip('/')}/api/files/object/stat",
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
  "content_type": "application/octet-stream"
}`}
        />
      </div>

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
