import { toast as sonnerToast } from "sonner"

const TOAST_OPTIONS = { duration: 5000 } as const

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
  let msg = fallbackMessage
  try {
    const json = JSON.parse(body) as { msg?: string; data?: unknown }
    if (typeof json.msg === "string") {
      msg = json.msg
      showErrorToast(msg, json.data)
      return
    }
  } catch {
    // 非 JSON，用原始文本或 fallback
  }
  sonnerToast.error(body?.trim() || msg, TOAST_OPTIONS)
}

/** 网络/请求失败（如 fetch 抛错） */
export function showNetworkErrorToast(): void {
  sonnerToast.error("网络请求失败，请检查网络连接", TOAST_OPTIONS)
}
