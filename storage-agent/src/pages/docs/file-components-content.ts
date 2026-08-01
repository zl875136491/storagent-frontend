import {
  API_GUIDE_LANGUAGES,
  getApiGuideLanguage,
  type ApiGuideLanguage,
} from "./api-guide-content"

export type ComponentGuideLanguage = ApiGuideLanguage

export const COMPONENT_GUIDE_LANGUAGES = API_GUIDE_LANGUAGES

export const COMPONENT_GUIDE_CODE: Record<
  ComponentGuideLanguage,
  { upload: string; download: string }
> = {
  typescript: {
    upload: `import { readFile } from "node:fs/promises"
import { basename } from "node:path"

const BASE_URL = (process.env.STORAGENT_BASE_URL ?? "").replace(/\\/+$/, "")
const API_KEY = process.env.STORAGENT_API_KEY ?? ""
const CHUNK_SIZE = 5 * 1024 * 1024

type InitResponse = { upload_id: string; object_key: string }
type PartResponse = { part_number: number; etag: string }
type CompleteResponse = { bucket: string; object_key: string; etag?: string | null }

async function storagentJson<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(BASE_URL + path, {
    ...init,
    headers: { "x-api-key": API_KEY, ...(init.headers ?? {}) },
  })
  const text = await response.text()
  if (!response.ok) throw new Error(text || \`Storagent HTTP \${response.status}\`)
  return JSON.parse(text) as T
}

export async function uploadFile(filePath: string, contentType = "application/octet-stream") {
  const file = await readFile(filePath)
  const init = await storagentJson<InitResponse>("/api/files/multipart/init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content_type: contentType }),
  })

  const parts: PartResponse[] = []
  try {
    for (let partNumber = 1, offset = 0; ; partNumber += 1) {
      const end = Math.min(offset + CHUNK_SIZE, file.byteLength)
      const form = new FormData()
      form.set("upload_id", init.upload_id)
      form.set("object_key", init.object_key)
      form.set("part_number", String(partNumber))
      form.set("file", new Blob([new Uint8Array(file.subarray(offset, end))], { type: contentType }), basename(filePath))
      parts.push(await storagentJson<PartResponse>("/api/files/multipart/part", {
        method: "POST",
        body: form,
      }))
      offset = end
      if (offset >= file.byteLength) break
    }

    return await storagentJson<CompleteResponse>("/api/files/multipart/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        upload_id: init.upload_id,
        object_key: init.object_key,
        parts: parts.map(({ part_number, etag }) => ({
          part_number,
          etag: etag.replace(/^"+|"+$/g, ""),
        })),
      }),
    })
  } catch (error) {
    await fetch(BASE_URL + "/api/files/multipart/abort", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify({ upload_id: init.upload_id, object_key: init.object_key }),
    }).catch(() => undefined)
    throw error
  }
}`,
    download: `import { writeFile } from "node:fs/promises"

const BASE_URL = (process.env.STORAGENT_BASE_URL ?? "").replace(/\\/+$/, "")
const API_KEY = process.env.STORAGENT_API_KEY ?? ""

type Stat = { object_key: string; size: number; etag: string; content_type?: string | null }
type Location = { download_url: string; region: string; shown_name: string }

async function storagentFetch(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { "x-api-key": API_KEY, ...(init.headers ?? {}) },
  })
  if (!response.ok) {
    const text = await response.text()
    const body = JSON.parse(text || "null") as { code?: number; data?: { available_at?: Location[] } } | null
    const error = new Error(text || \`Storagent HTTP \${response.status}\`) as Error & { body?: typeof body }
    error.body = body
    throw error
  }
  return response
}

export async function downloadObject(objectKey: string, outputPath: string) {
  let downloadUrl = \`\${BASE_URL}/api/files/object/download?\${new URLSearchParams({ object_key: objectKey })}\`
  try {
    await storagentFetch(\`\${BASE_URL}/api/files/object/stat\`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ object_key: objectKey }),
    })
  } catch (error) {
    const body = (error as Error & { body?: { code?: number; data?: { available_at?: Location[] } } }).body
    if (body?.code !== 404032) throw error
    const locate = await storagentFetch(\`\${BASE_URL}/api/files/object/locate?\${new URLSearchParams({ object_key: objectKey })}\`)
    const locations = (await locate.json() as { available_at: Location[] }).available_at
    if (!locations[0]) throw new Error("对象在所有服务点均不可用")
    downloadUrl = locations[0].download_url
  }

  const response = await storagentFetch(downloadUrl)
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()))
}`,
  },
  python: {
    upload: `import os
from pathlib import Path

import requests

BASE_URL = os.environ["STORAGENT_BASE_URL"].rstrip("/")
API_KEY = os.environ["STORAGENT_API_KEY"]
CHUNK_SIZE = 5 * 1024 * 1024


class StoragentFilesClient:
    def __init__(self, base_url: str = BASE_URL, api_key: str = API_KEY):
        self.base_url = base_url.rstrip("/")
        self.headers = {"x-api-key": api_key}

    def _json(self, method: str, path: str, **kwargs):
        response = requests.request(method, self.base_url + path, headers=self.headers, timeout=30, **kwargs)
        if not response.ok:
            raise RuntimeError(response.text or f"Storagent HTTP {response.status_code}")
        return response.json()

    def upload_file(self, file_path: str, content_type: str = "application/octet-stream"):
        init = self._json("POST", "/api/files/multipart/init", json={"content_type": content_type})
        parts = []
        try:
            with Path(file_path).open("rb") as source:
                part_number = 1
                while True:
                    chunk = source.read(CHUNK_SIZE)
                    if not chunk and part_number > 1:
                        break
                    response = requests.post(
                        self.base_url + "/api/files/multipart/part",
                        headers=self.headers,
                        files={"file": (Path(file_path).name, chunk, content_type)},
                        data={
                            "upload_id": init["upload_id"],
                            "object_key": init["object_key"],
                            "part_number": str(part_number),
                        },
                        timeout=30,
                    )
                    if not response.ok:
                        raise RuntimeError(response.text or f"Storagent HTTP {response.status_code}")
                    item = response.json()
                    parts.append({"part_number": item["part_number"], "etag": item["etag"].strip('"')})
                    part_number += 1
            return self._json("POST", "/api/files/multipart/complete", json={
                "upload_id": init["upload_id"],
                "object_key": init["object_key"],
                "parts": parts,
            })
        except Exception:
            requests.post(
                self.base_url + "/api/files/multipart/abort",
                headers=self.headers,
                json={"upload_id": init["upload_id"], "object_key": init["object_key"]},
                timeout=30,
            )
            raise


client = StoragentFilesClient()
print(client.upload_file("./example.bin"))`,
    download: `import os
from pathlib import Path

import requests

BASE_URL = os.environ["STORAGENT_BASE_URL"].rstrip("/")
API_KEY = os.environ["STORAGENT_API_KEY"]


def download_object(object_key: str, output_path: str):
    headers = {"x-api-key": API_KEY}
    stat = requests.post(
        f"{BASE_URL}/api/files/object/stat",
        headers={**headers, "Content-Type": "application/json"},
        json={"object_key": object_key},
        timeout=30,
    )
    if stat.status_code == 404 and stat.json().get("code") == 404032:
        locate = requests.get(
            f"{BASE_URL}/api/files/object/locate",
            headers=headers,
            params={"object_key": object_key},
            timeout=30,
        )
        locate.raise_for_status()
        locations = locate.json().get("available_at", [])
        if not locations:
            raise FileNotFoundError(object_key)
        download_url = locations[0]["download_url"]
    else:
        stat.raise_for_status()
        download_url = f"{BASE_URL}/api/files/object/download"

    response = requests.get(
        download_url,
        headers=headers,
        params=None if download_url.startswith("http") and "?" in download_url else {
            "object_key": object_key,
            "offset": 0,
            "length": 0,
        },
        stream=True,
        timeout=60,
    )
    response.raise_for_status()
    with Path(output_path).open("wb") as target:
        for chunk in response.iter_content(chunk_size=1024 * 1024):
            if chunk:
                target.write(chunk)


download_object("path/to/file.bin", "./file.bin")`,
  },
}

function markdownFence(language: string, code: string) {
  return "```" + language + "\\n" + code.trim() + "\\n```"
}

export function generateComponentGuideMarkdown(language: ComponentGuideLanguage) {
  const meta = getApiGuideLanguage(language)
  const snippets = COMPONENT_GUIDE_CODE[language]
  return [
    "# Storagent 文件组件接入指南",
    "",
    `> 示例语言：${meta.label}；运行环境：${meta.runtime}。本文由 Storagent 控制台的结构化组件定义生成。`,
    "",
    "## 给开发者与 AI 的实施目标",
    "",
    "为业务系统实现可恢复的分片上传、元信息校验、跨区域定位和流式下载。保留本文给出的 HTTP 方法、路径、鉴权位置和字段名，不要把 APIKey 放进 URL。",
    "",
    "## 安全约束",
    "",
    "- APIKey 只通过服务端环境变量注入，并使用 `x-api-key` 请求头。",
    "- 不要在浏览器前端、移动端包、日志、异常信息或 query 参数中保存 APIKey。",
    "- `object_key` 是不透明字符串；stat 使用 POST JSON，download/locate 使用标准 URL 编码。",
    "- 上传失败、取消或不可恢复时调用 multipart abort，避免遗留分片。",
    "- 分片上传完成前不要把对象当作可下载文件；下载大文件必须流式写入。",
    "",
    "## 运行环境与依赖",
    "",
    `- 运行环境：${meta.runtime}`,
    `- 依赖：${meta.dependency}`,
    "- 环境变量：`STORAGENT_BASE_URL`、`STORAGENT_API_KEY`",
    "",
    "## 上传实现",
    "",
    "初始化 multipart 后按 5 MiB 分片上传，保存每片 ETag，最后按 part_number 升序完成。发生异常时必须 abort。",
    "",
    markdownFence(meta.fence, snippets.upload),
    "",
    "## 下载实现",
    "",
    "先用 POST stat 校验对象；如果返回业务码 `404032`，调用 locate 并选择 `available_at` 中的 download_url。下载响应以流式方式写入目标文件。",
    "",
    markdownFence(meta.fence, snippets.download),
    "",
    "## 接入验收清单",
    "",
    "- [ ] APIKey 只存在服务端环境变量和 `x-api-key` 请求头。",
    "- [ ] 上传保存 upload_id、object_key、part_number 和 ETag，并能重试单片。",
    "- [ ] 刷新或进程重启后可以查询 multipart/parts 恢复上传。",
    "- [ ] 取消或不可恢复失败会调用 multipart/abort。",
    "- [ ] stat 使用 POST JSON，不把 object_key 或 APIKey 放入 stat URL。",
    "- [ ] 能处理 404032 并从 available_at 选择可用节点。",
    "- [ ] 下载采用流式处理并校验文件大小或 ETag。",
    "- [ ] 日志会脱敏 APIKey，并覆盖成功、密钥失效、断点续传和跨区域回退场景。",
    "",
  ].join("\n")
}
