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
        分两步冒烟：先用公共接口确认节点可达，再用控制面{" "}
        <code className="font-mono text-[11px]">multipart/init</code> +{" "}
        <code className="font-mono text-[11px]">abort</code> 验证 APIKey（不必事先已有对象）。
        这些请求都在 App 后端执行，不要放进浏览器页面。
      </p>

      <h3 className="mt-5 text-sm font-semibold text-foreground">1. 探测节点（无需鉴权）</h3>
      <div className="mt-2">
        <DocCodeTabs
          tabs={[
            {
              id: "probe-curl",
              label: "cURL",
              language: "bash",
              code: `export STORAGENT_BASE_URL="https://storagent.example.com"

# 返回 512 字节探测载荷；可用时延挑选就近节点
curl -sS -o /dev/null -w "HTTP %{http_code}  bytes=%{size_download}  time=%{time_total}\\n" \\
  "$STORAGENT_BASE_URL/api/v1/public/endpoints/test"`,
            },
            {
              id: "probe-js",
              label: "Node.js",
              language: "javascript",
              code: `const baseURL = process.env.STORAGENT_BASE_URL
const started = Date.now()
const res = await fetch(\`\${baseURL}/api/v1/public/endpoints/test\`)
const buf = await res.arrayBuffer()
console.log({ status: res.status, bytes: buf.byteLength, ms: Date.now() - started })`,
            },
            {
              id: "probe-py",
              label: "Python",
              language: "python",
              code: `import os, time, requests

base = os.environ["STORAGENT_BASE_URL"].rstrip("/")
started = time.perf_counter()
r = requests.get(f"{base}/api/v1/public/endpoints/test", timeout=8)
print({"status": r.status_code, "bytes": len(r.content), "ms": round((time.perf_counter()-started)*1000, 1)})`,
            },
          ]}
        />
      </div>

      <h3 className="mt-6 text-sm font-semibold text-foreground">2. 控制面 init + abort（需要 x-api-key）</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        <code className="font-mono">object_key</code> 由服务端生成并在响应里返回；
        <code className="font-mono">size_bytes</code> 必须{" "}
        <code className="font-mono">&gt; 0</code>（空文件会被直接拒绝）。测完立刻 abort，避免占用配额预留。
      </p>
      <div className="mt-2">
        <DocCodeTabs
          tabs={[
            {
              id: "curl",
              label: "cURL",
              language: "bash",
              code: `export STORAGENT_BASE_URL="https://storagent.example.com"
export STORAGENT_API_KEY="sk_..."

# init：声明即将上传的完整字节数（这里用 1024 做冒烟）
INIT=$(curl -sS -X POST "$STORAGENT_BASE_URL/api/v1/files/multipart/init" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: $STORAGENT_API_KEY" \\
  -d '{"size_bytes":1024,"content_type":"application/octet-stream"}')
echo "$INIT"

UPLOAD_ID=$(printf '%s' "$INIT" | python3 -c "import sys,json; print(json.load(sys.stdin)['upload_id'])")
OBJECT_KEY=$(printf '%s' "$INIT" | python3 -c "import sys,json; print(json.load(sys.stdin)['object_key'])")

# abort：释放会话预留，冒烟到此结束
curl -sS -X POST "$STORAGENT_BASE_URL/api/v1/files/multipart/abort" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: $STORAGENT_API_KEY" \\
  -d "{\\"upload_id\\":\\"$UPLOAD_ID\\",\\"object_key\\":\\"$OBJECT_KEY\\"}"`,
            },
            {
              id: "js",
              label: "Node.js（App 后端）",
              language: "javascript",
              code: `const baseURL = process.env.STORAGENT_BASE_URL
const apiKey = process.env.STORAGENT_API_KEY
const headers = { "Content-Type": "application/json", "x-api-key": apiKey }

const initRes = await fetch(\`\${baseURL}/api/v1/files/multipart/init\`, {
  method: "POST",
  headers,
  body: JSON.stringify({ size_bytes: 1024, content_type: "application/octet-stream" }),
})
const init = await initRes.json()
if (!initRes.ok) throw new Error(JSON.stringify(init))
console.log("init", init)

const abortRes = await fetch(\`\${baseURL}/api/v1/files/multipart/abort\`, {
  method: "POST",
  headers,
  body: JSON.stringify({ upload_id: init.upload_id, object_key: init.object_key }),
})
console.log("abort", await abortRes.json())`,
            },
            {
              id: "py",
              label: "Python（App 后端）",
              language: "python",
              code: `import os, requests

base = os.environ["STORAGENT_BASE_URL"].rstrip("/")
headers = {"x-api-key": os.environ["STORAGENT_API_KEY"], "Content-Type": "application/json"}

init = requests.post(
    f"{base}/api/v1/files/multipart/init",
    headers=headers,
    json={"size_bytes": 1024, "content_type": "application/octet-stream"},
    timeout=30,
)
init.raise_for_status()
upload = init.json()
print("init", upload)

abort = requests.post(
    f"{base}/api/v1/files/multipart/abort",
    headers=headers,
    json={"upload_id": upload["upload_id"], "object_key": upload["object_key"]},
    timeout=30,
)
abort.raise_for_status()
print("abort", abort.json())`,
            },
          ]}
        />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <DocCodeBlock
          language="json"
          title="init Response 200"
          code={`{
  "upload_id": "upload-...",
  "bucket": "your-app",
  "object_key": "8f66367a-a29f-4507-8cb7-aff361174060"
}`}
        />
        <DocCodeBlock
          language="json"
          title="abort Response 200"
          code={`{
  "bucket": "your-app",
  "object_key": "8f66367a-a29f-4507-8cb7-aff361174060",
  "upload_id": "upload-...",
  "aborted": true
}`}
        />
      </div>
      <DocNote>
        真正上传分片 / 下载对象时，浏览器前端应直连数据面并携带 App 后端签发的能力令牌，
        而不是把 <code className="font-mono text-[11px]">x-api-key</code> 放进页面。完整流程见「功能接口引导」；
        仓库旁的 <code className="font-mono text-[11px]">system-test/</code> 目录提供了一套可在 NUC 上跑的联调夹具。
      </DocNote>

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
