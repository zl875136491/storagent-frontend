import { createElement } from "react"
import { toast as sonnerToast } from "sonner"
import { ApiErrorToast } from "../components/ApiErrorToast"

const TOAST_OPTIONS = { duration: 5000 } as const
const TOAST_OPTIONS_WITH_TRACEBACK = { duration: 600_000 } as const // traceback / 长 data 模态存活更久

/** data 超过此长度且无 traceback 时，toast 内缩略展示并提供「更多」查看全文 */
const LONG_ERROR_DATA_THRESHOLD = 120

function truncateForToastPreview(text: string, maxChars: number): string {
  const t = text.trim()
  if (t.length <= maxChars) return t
  return `${t.slice(0, maxChars)}…`
}

/** 成功响应格式: { message: string } */
export function showSuccessToast(message: string): void {
  if (message?.trim()) {
    sonnerToast.success(message, TOAST_OPTIONS)
  }
}

/** 错误响应格式: { msg: string, data?: object | string } */
function formatErrorData(data: unknown): string {
  if (data == null) return ""
  if (typeof data === "string") return data
  if (typeof data !== "object") return String(data)
  const obj = data as Record<string, unknown>
  if (Array.isArray(obj.errors)) {
    return obj.errors
      .map(
        (e: { field?: string; message?: string }) =>
          `${e.field ?? ""}: ${e.message ?? ""}`.trim(),
      )
      .filter(Boolean)
      .join("；")
  }
  if (obj.headers && typeof obj.headers === "object") {
    return "" // WWW-Authenticate 等无需展示给用户
  }
  return JSON.stringify(data)
}

export function showErrorToast(msg: string, data?: unknown): void {
  const extra = formatErrorData(data)
  const text = extra ? `${msg}\n${extra}` : msg
  sonnerToast.error(text, TOAST_OPTIONS)
}

/** 根据接口错误响应体解析并展示错误 toast，返回解析出的 msg */
export function showApiErrorToast(body: string, fallbackMessage: string): void {
  const raw = body?.trim() || ""

  function firstLine(text: string): string {
    const normalized = text.replace(/\r\n/g, "\n")
    const idx = normalized.indexOf("\n")
    return idx >= 0 ? normalized.slice(0, idx) : normalized
  }

  function getString(obj: unknown, key: string): string | undefined {
    if (!obj || typeof obj !== "object") return undefined
    const v = (obj as Record<string, unknown>)[key]
    return typeof v === "string" ? v : undefined
  }

  function extractTraceback(obj: unknown): string | undefined {
    if (!obj || typeof obj !== "object") return undefined
    const candidates = [
      "traceback",
      "stacktrace",
      "stackTrace",
      "stack_trace",
      "stack",
      "trace",
      "detail_traceback",
      "error_traceback",
    ]

    for (const k of candidates) {
      const v = getString(obj, k)
      if (v && v.trim()) return v
    }

    // 部分后端可能把它放在 data 里
    const data = (obj as Record<string, unknown>)["data"]
    for (const k of candidates) {
      const v = getString(data, k)
      if (v && v.trim()) return v
    }

    return undefined
  }

  function extractDescription(obj: unknown): string | undefined {
    const candidates = ["reason", "detail", "description", "error_description", "message"]
    for (const k of candidates) {
      const v = getString(obj, k)
      if (v && v.trim()) return v
    }
    if (obj && typeof obj === "object") {
      const data = (obj as Record<string, unknown>)["data"]
      for (const k of candidates) {
        const v = getString(data, k)
        if (v && v.trim()) return v
      }
    }
    return undefined
  }

  try {
    const json = JSON.parse(raw) as unknown

    const fullDataFormatted =
      json && typeof json === "object" && "data" in json
        ? formatErrorData((json as Record<string, unknown>)["data"]).trim()
        : ""

    const msg = getString(json, "msg") ?? getString(json, "message") ?? fallbackMessage
    const type =
      getString(json, "type") ??
      getString(json, "error_type") ??
      getString(json, "name") ??
      "error"

    // 适配后端错误格式：{ msg: string, data?: object | string }
    // 若同时存在 msg 和 data，则 data 优先作为内容展示
    let description: string | undefined
    // 但若存在 reason（含 data.reason），则优先以 reason 作为描述展示
    const reason =
      getString(json, "reason") ??
      (json && typeof json === "object"
        ? getString((json as Record<string, unknown>)["data"], "reason")
        : undefined)
    if (reason && reason.trim()) {
      description = reason
    } else if (json && typeof json === "object" && "msg" in json && "data" in json) {
      const data = (json as Record<string, unknown>)["data"]
      const formatted = formatErrorData(data)
      if (formatted.trim()) {
        description = formatted
      }
    }
    description = description ?? extractDescription(json) ?? firstLine(raw) ?? msg

    let traceback = extractTraceback(json)
    if (!traceback) {
      // 字段名可能不标准，但如果响应里明显是堆栈文本，则兜底把整段放到 modal 里
      const looksLikeStack =
        /traceback|stacktrace|stack/i.test(raw)
        || /Exception/i.test(raw)
        || /\n\s*File\s+/i.test(raw)
        || /\n\s*at\s+/i.test(raw)
        || /Caused by:/i.test(raw)
      if (looksLikeStack) traceback = raw
    }
    // 生产环境不向终端用户展示堆栈
    if (import.meta.env.PROD) {
      traceback = undefined
    }

    let dataForModal: string | undefined
    if (!traceback && fullDataFormatted.length > LONG_ERROR_DATA_THRESHOLD) {
      dataForModal = fullDataFormatted
      const reasonTrimmed = reason?.trim()
      if (!reasonTrimmed && (description?.trim() ?? "") === fullDataFormatted) {
        description = truncateForToastPreview(fullDataFormatted, 200)
      }
    }

    // toast：msg + type + 描述；traceback 或过长 data 通过按钮弹出模态框
    const node = createElement(ApiErrorToast, {
      msg,
      type,
      description,
      traceback,
      dataForModal,
    })
    sonnerToast.error(
      node,
      traceback || dataForModal ? TOAST_OPTIONS_WITH_TRACEBACK : TOAST_OPTIONS,
    )
    return
  } catch {
    // 非 JSON，用原始文本兜底
  }

  const msg = fallbackMessage
  const description = firstLine(raw) || fallbackMessage
  const node = createElement(ApiErrorToast, {
    msg,
    type: "error",
    description,
    traceback: import.meta.env.PROD ? undefined : (raw || undefined),
  })
  sonnerToast.error(
    node,
    !import.meta.env.PROD && raw ? TOAST_OPTIONS_WITH_TRACEBACK : TOAST_OPTIONS,
  )
}

/** 网络/请求失败（如 fetch 抛错） */
export function showNetworkErrorToast(): void {
  sonnerToast.error("网络请求失败，请检查网络连接", TOAST_OPTIONS)
}
