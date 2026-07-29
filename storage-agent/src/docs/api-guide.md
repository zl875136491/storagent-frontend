本文面向要**自行设计前端组件**的开发者，只描述 Storage Agent **对外存储相关 HTTP 接口**的调用方式，不绑定本仓库内的 React Demo。

控制台内嵌的可运行组件见 [功能组件引导](?doc=file-components)。

## 基础约定

### Base URL

业务侧应配置一个可达的 Storagent API 根地址，例如：

```text
https://storagent.example.com
```

下文路径均相对于该根地址。多区域部署时，可通过公共端点列表挑选低时延节点（见文末）。

### 鉴权

除特别标明的公共接口外，文件接口均需：

```http
x-api-key: <APIKey>
```

- APIKey 在控制台「APIKey 管理」中创建，绑定到**已授权应用**。
- 不要使用 `Authorization: Bearer <APIKey>`。
- Key 被吊销或过期后，接口返回鉴权失败类错误。

### 统一错误体（常见）

多数失败响应为 JSON，大致形如：

```json
{ "msg": "说明", "code": 400013, "data": null }
```

客户端应按 HTTP 状态码 + `msg`/`code` 提示用户。

### 对象与桶

- 业务通常只传 **`object_key`**（对象键）。
- **桶名**一般等于应用名（授权时创建），由服务端在分片 init / stat 等响应中返回，调用方无需自选桶。

---

## 公共接口（无需 APIKey）

### 获取区域服务端点列表

```http
GET /api/public/endpoints
```

响应 `data[]` 中常见字段：`region_id`、`server_id`、`name`、`shown_name`、`master`、`endpoint`（Storagent API）、`minio_endpoint` 等。

### 探测端点可达性

```http
GET /api/public/endpoints/test
```

用于时延/健康探测（控制台组件引导亦使用）。可对候选 `endpoint` 基址发起该请求，选择最快节点作为 Base URL。

---

## 分片上传（Multipart）

适用大文件；流程：**init → 循环 part → complete**。失败时可 **abort**。

### 1. 初始化

```http
POST /api/files/multipart/init
Content-Type: application/json
x-api-key: <APIKey>

{
  "content_type": "application/octet-stream"
}
```

响应示例：

```json
{
  "upload_id": "...",
  "bucket": "<app-name>",
  "object_key": "<server-generated-key>"
}
```

请保存 `upload_id`、`object_key`（以及如需展示的 `bucket`）。

### 2. 上传分片

```http
POST /api/files/multipart/part
x-api-key: <APIKey>
Content-Type: multipart/form-data
```

表单字段：

| 字段 | 说明 |
|------|------|
| `upload_id` | init 返回 |
| `object_key` | init 返回 |
| `part_number` | 从 1 开始的整数 |
| `file` | 本分片二进制（文件字段） |

响应：

```json
{ "part_number": 1, "etag": "...." }
```

`etag` 可能带引号，完成上传前建议去掉首尾 `"`。

建议分片大小 ≥ 5MiB（末片可更小），与常见 S3 兼容实现一致。

### 3. 完成上传

```http
POST /api/files/multipart/complete
Content-Type: application/json
x-api-key: <APIKey>

{
  "upload_id": "...",
  "object_key": "...",
  "parts": [
    { "part_number": 1, "etag": "etag-without-quotes" },
    { "part_number": 2, "etag": "..." }
  ]
}
```

`parts` 需按 `part_number` 升序。响应含 `bucket`、`object_key`，以及可选 `etag`、`version_id`。

### 4. 中止上传（可选）

```http
POST /api/files/multipart/abort
Content-Type: application/json
x-api-key: <APIKey>

{
  "object_key": "...",
  "upload_id": "..."
}
```

分片失败或用户取消时应调用，避免残留未完成的 multipart。

### 5. 列出已上传分片（断点续传）

```http
GET /api/files/multipart/parts?upload_id=...&object_key=...
x-api-key: <APIKey>
```

可选查询参数：`part_number_marker`。

---

## 对象读取

### 获取元信息

```http
POST /api/files/object/stat
Content-Type: application/json
x-api-key: <APIKey>

{ "object_key": "path/to/file.bin" }
```

响应字段包括：`bucket`、`object_key`、`size`、`etag`、`content_type`、`last_modified`，以及可能的 `region`、`local`。

### 下载（支持偏移）

```http
GET /api/files/object/download?object_key=...&offset=0&length=0
x-api-key: <APIKey>
```

| 参数 | 说明 |
|------|------|
| `object_key` | 必填 |
| `offset` | 起始字节，默认 0 |
| `length` | 读取长度；**0 表示从 offset 读到末尾（流式）** |

响应为对象二进制流。可按 `size` 自行切分多次下载实现断点/并行。

### 定位对象所在节点（跨站点）

```http
GET /api/files/object/locate?object_key=...&offset=0&length=0
x-api-key: <APIKey>
```

扫描各服务点，返回对象存在位置及对应的 `stat_url` / `download_url` 指引，便于就近下载。该接口可能有频控。

---

## 调用示例

### curl：初始化分片

```bash
curl -sS -X POST "$BASE_URL/api/files/multipart/init" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"content_type":"application/pdf"}'
```

### fetch：元信息 + 整文件下载

```javascript
const headers = { "x-api-key": apiKey, "Content-Type": "application/json" }

const stat = await fetch(`${baseURL}/api/files/object/stat`, {
  method: "POST",
  headers,
  body: JSON.stringify({ object_key: objectKey }),
}).then(async (r) => {
  const t = await r.text()
  if (!r.ok) throw new Error(t || r.statusText)
  return JSON.parse(t)
})

const qs = new URLSearchParams({ object_key: objectKey, offset: "0", length: "0" })
const blob = await fetch(`${baseURL}/api/files/object/download?${qs}`, {
  headers: { "x-api-key": apiKey },
}).then(async (r) => {
  if (!r.ok) throw new Error(await r.text())
  return r.blob()
})
```

### Python：stat

```python
import os
import requests

BASE_URL = os.environ["STORAGENT_BASE_URL"].rstrip("/")
API_KEY = os.environ["STORAGENT_API_KEY"]

def object_stat(object_key: str) -> dict:
    r = requests.post(
        f"{BASE_URL}/api/files/object/stat",
        headers={"x-api-key": API_KEY, "Content-Type": "application/json"},
        json={"object_key": object_key},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()
```

---

## 接口速查表

| 方法 | 路径 | 鉴权 | 用途 |
|------|------|------|------|
| GET | `/api/public/endpoints` | 无 | 列出 API 端点 |
| GET | `/api/public/endpoints/test` | 无 | 探测端点 |
| POST | `/api/files/multipart/init` | x-api-key | 初始化分片上传 |
| POST | `/api/files/multipart/part` | x-api-key | 上传分片（multipart/form-data） |
| POST | `/api/files/multipart/complete` | x-api-key | 完成分片上传 |
| POST | `/api/files/multipart/abort` | x-api-key | 中止分片上传 |
| GET | `/api/files/multipart/parts` | x-api-key | 列出已上传分片 |
| POST | `/api/files/object/stat` | x-api-key | 对象元信息 |
| GET | `/api/files/object/download` | x-api-key | 下载对象（可 Range 语义偏移） |
| GET | `/api/files/object/locate` | x-api-key | 跨站点定位对象 |

控制台登录、区域/应用/MinIO 管理等属于**运维 JWT 接口**，不在本文展开；请使用控制台或内部 OpenAPI。
