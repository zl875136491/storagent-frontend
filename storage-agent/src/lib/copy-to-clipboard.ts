// 兼容性复制工具函数。HTTPS 页面优先使用现代 Clipboard API；
// 通过 HTTP 网关访问时没有安全上下文，再回退为 textarea + execCommand。

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // HTTP 或受限 iframe 中 Clipboard API 不可用，继续使用同步回退方案。
  }

  try {
    const textArea = document.createElement("textarea")
    textArea.value = text
    textArea.readOnly = true
    textArea.setAttribute("aria-hidden", "true")

    // 保持元素存在且可选中，避免某些浏览器忽略 display:none 的复制源。
    textArea.style.position = "fixed"
    textArea.style.left = "-9999px"
    textArea.style.top = "0"
    textArea.style.opacity = "0"

    document.body.appendChild(textArea)

    textArea.focus()
    textArea.select()
    textArea.setSelectionRange(0, textArea.value.length)

    const successful = document.execCommand("copy")
    document.body.removeChild(textArea)

    return successful
  } catch {
    return false
  }
}
