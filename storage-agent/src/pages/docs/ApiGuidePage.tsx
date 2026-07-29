import { useMemo } from "react"
import { ApiEndpoint, ApiExamples, ApiParamTable } from "@/components/docs/api"
import { DocCodeBlock, DocSplit } from "@/components/docs/code"
import { DocLead, DocNote, DocTitle, useRegisterToc } from "@/components/docs/primitives"

export default function ApiGuidePage() {
  const toc = useMemo(
    () => [
      { id: "conventions", title: "约定", level: 2 as const },
      { id: "endpoints-list", title: "列出端点", level: 2 as const },
      { id: "endpoints-test", title: "探测端点", level: 2 as const },
      { id: "multipart-init", title: "初始化分片", level: 2 as const },
      { id: "multipart-part", title: "上传分片", level: 2 as const },
      { id: "multipart-complete", title: "完成上传", level: 2 as const },
      { id: "multipart-abort", title: "中止上传", level: 2 as const },
      { id: "object-stat", title: "对象元信息", level: 2 as const },
      { id: "object-download", title: "下载对象", level: 2 as const },
      { id: "object-locate", title: "定位对象", level: 2 as const },
    ],
    [],
  )
  useRegisterToc(toc)

  return (
    <div className="pb-10">
      <DocTitle>功能接口引导</DocTitle>
      <DocLead>
        对外存储 HTTP 参考。左侧说明参数与语义，右侧给可复制的请求/响应示例——自行设计组件时只依赖这些接口。
      </DocLead>

      <section id="conventions" className="mt-8 scroll-m-24">
        <h2 className="text-xl font-semibold tracking-tight">约定</h2>
        <ul className="mt-3 space-y-2 text-sm text-foreground/90">
          <li>
            Base URL：Storagent API 根，例如{" "}
            <code className="rounded bg-muted px-1 font-mono text-[11px]">https://storagent.example.com</code>
          </li>
          <li>
            鉴权：文件接口使用请求头{" "}
            <code className="rounded bg-muted px-1 font-mono text-[11px]">x-api-key</code>
          </li>
          <li>对象：业务通常只传 object_key；桶名一般等于应用名，由服务端返回</li>
        </ul>
        <DocNote>
          公共 endpoints 接口无需 APIKey。控制台登录 JWT 接口不在本文范围。
        </DocNote>
      </section>

      <ApiEndpoint id="endpoints-list" method="GET" path="/api/public/endpoints" summary="列出端点">
        <DocSplit
          left={
            <>
              <p className="mt-3 text-sm text-muted-foreground">
                返回各区域 Storagent API 地址，用于选择低时延 Base URL。
              </p>
              <ApiParamTable
                title="Returns"
                rows={[
                  { name: "data[].endpoint", type: "string", required: true, description: "Storagent API 基址" },
                  { name: "data[].shown_name", type: "string", required: true, description: "展示名称" },
                  { name: "data[].master", type: "boolean", required: true, description: "是否为区域主节点" },
                ]}
              />
            </>
          }
          right={
            <ApiExamples
              request={`curl "$BASE_URL/api/public/endpoints"`}
              response={`{
  "data": [
    {
      "shown_name": "hangzhou",
      "endpoint": "https://hz.example.com",
      "master": true
    }
  ]
}`}
            />
          }
        />
      </ApiEndpoint>

      <ApiEndpoint id="endpoints-test" method="GET" path="/api/public/endpoints/test" summary="探测端点">
        <DocSplit
          left={
            <p className="mt-3 text-sm text-muted-foreground">
              对候选基址发起探测，比较时延与可达性。控制台组件引导默认用它选最快节点。
            </p>
          }
          right={
            <DocCodeBlock
              language="bash"
              title="Example"
              code={`curl -o /dev/null -sS -w "%{time_total}\\n" \\
  "$BASE_URL/api/public/endpoints/test"`}
            />
          }
        />
      </ApiEndpoint>

      <ApiEndpoint id="multipart-init" method="POST" path="/api/files/multipart/init" summary="初始化分片上传">
        <DocSplit
          left={
            <>
              <ApiParamTable
                title="Headers"
                rows={[
                  { name: "x-api-key", type: "string", required: true, description: "业务 APIKey" },
                  { name: "Content-Type", type: "string", required: true, description: "application/json" },
                ]}
              />
              <ApiParamTable
                title="Body"
                rows={[
                  {
                    name: "content_type",
                    type: "string",
                    description: "对象 MIME，默认 application/octet-stream",
                  },
                ]}
              />
              <ApiParamTable
                title="Returns"
                rows={[
                  { name: "upload_id", type: "string", required: true, description: "后续分片会话 ID" },
                  { name: "bucket", type: "string", required: true, description: "应用桶名" },
                  { name: "object_key", type: "string", required: true, description: "服务端生成的对象键" },
                ]}
              />
            </>
          }
          right={
            <ApiExamples
              request={`curl -X POST "$BASE_URL/api/files/multipart/init" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: $API_KEY" \\
  -d '{"content_type":"application/pdf"}'`}
              response={`{
  "upload_id": "upload-...",
  "bucket": "cpl",
  "object_key": "2026/....pdf"
}`}
            />
          }
        />
      </ApiEndpoint>

      <ApiEndpoint id="multipart-part" method="POST" path="/api/files/multipart/part" summary="上传分片">
        <DocSplit
          left={
            <>
              <p className="mt-3 text-sm text-muted-foreground">
                Content-Type 为 multipart/form-data。建议分片 ≥ 5MiB（末片可更小）。
              </p>
              <ApiParamTable
                title="Form fields"
                rows={[
                  { name: "upload_id", type: "string", required: true, description: "init 返回" },
                  { name: "object_key", type: "string", required: true, description: "init 返回" },
                  { name: "part_number", type: "integer", required: true, description: "从 1 开始" },
                  { name: "file", type: "binary", required: true, description: "本分片内容" },
                ]}
              />
            </>
          }
          right={
            <ApiExamples
              request={`curl -X POST "$BASE_URL/api/files/multipart/part" \\
  -H "x-api-key: $API_KEY" \\
  -F upload_id="$UPLOAD_ID" \\
  -F object_key="$OBJECT_KEY" \\
  -F part_number=1 \\
  -F file=@part1.bin`}
              response={`{ "part_number": 1, "etag": "\\"...\\"" }`}
            />
          }
        />
      </ApiEndpoint>

      <ApiEndpoint
        id="multipart-complete"
        method="POST"
        path="/api/files/multipart/complete"
        summary="完成分片上传"
      >
        <DocSplit
          left={
            <ApiParamTable
              title="Body"
              rows={[
                { name: "upload_id", type: "string", required: true, description: "init 返回" },
                { name: "object_key", type: "string", required: true, description: "init 返回" },
                {
                  name: "parts",
                  type: "array",
                  required: true,
                  description: "按 part_number 升序；etag 建议去掉首尾引号",
                },
              ]}
            />
          }
          right={
            <ApiExamples
              request={`curl -X POST "$BASE_URL/api/files/multipart/complete" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: $API_KEY" \\
  -d '{
    "upload_id": "'"$UPLOAD_ID"'",
    "object_key": "'"$OBJECT_KEY"'",
    "parts": [{"part_number":1,"etag":"..."}]
  }'`}
              response={`{
  "bucket": "cpl",
  "object_key": "2026/....pdf",
  "etag": "...",
  "version_id": null
}`}
            />
          }
        />
      </ApiEndpoint>

      <ApiEndpoint id="multipart-abort" method="POST" path="/api/files/multipart/abort" summary="中止分片上传">
        <DocSplit
          left={
            <p className="mt-3 text-sm text-muted-foreground">
              上传失败或用户取消时调用，清理未完成的 multipart。
            </p>
          }
          right={
            <DocCodeBlock
              language="bash"
              title="Example"
              code={`curl -X POST "$BASE_URL/api/files/multipart/abort" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: $API_KEY" \\
  -d '{"upload_id":"'"$UPLOAD_ID"'","object_key":"'"$OBJECT_KEY"'"}'`}
            />
          }
        />
      </ApiEndpoint>

      <ApiEndpoint id="object-stat" method="POST" path="/api/files/object/stat" summary="获取对象元信息">
        <DocSplit
          left={
            <ApiParamTable
              title="Body"
              rows={[
                { name: "object_key", type: "string", required: true, description: "对象键" },
              ]}
            />
          }
          right={
            <ApiExamples
              request={`curl -X POST "$BASE_URL/api/files/object/stat" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: $API_KEY" \\
  -d '{"object_key":"path/to/file.bin"}'`}
              response={`{
  "bucket": "cpl",
  "object_key": "path/to/file.bin",
  "size": 1048576,
  "etag": "...",
  "content_type": "application/octet-stream"
}`}
            />
          }
        />
      </ApiEndpoint>

      <ApiEndpoint id="object-download" method="GET" path="/api/files/object/download" summary="下载对象">
        <DocSplit
          left={
            <ApiParamTable
              title="Query"
              rows={[
                { name: "object_key", type: "string", required: true, description: "对象键" },
                { name: "offset", type: "integer", description: "起始字节，默认 0" },
                {
                  name: "length",
                  type: "integer",
                  description: "读取长度；0 表示读到末尾（流式）",
                },
              ]}
            />
          }
          right={
            <DocCodeBlock
              language="bash"
              title="Example"
              code={`curl -OJ -H "x-api-key: $API_KEY" \\
  "$BASE_URL/api/files/object/download?object_key=path/to/file.bin&offset=0&length=0"`}
            />
          }
        />
      </ApiEndpoint>

      <ApiEndpoint id="object-locate" method="GET" path="/api/files/object/locate" summary="定位对象所在节点">
        <DocSplit
          left={
            <p className="mt-3 text-sm text-muted-foreground">
              扫描各服务点，返回对象存在位置及对应 stat/download 指引 URL，便于就近下载。可能有频控。
            </p>
          }
          right={
            <DocCodeBlock
              language="bash"
              title="Example"
              code={`curl -H "x-api-key: $API_KEY" \\
  "$BASE_URL/api/files/object/locate?object_key=path/to/file.bin"`}
            />
          }
        />
      </ApiEndpoint>
    </div>
  )
}
