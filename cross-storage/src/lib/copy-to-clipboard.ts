// 兼容性复制工具函数
// 说明: 在非 https 场景下无法保证安全上下文, 不能依赖 navigator.clipboard,
// 因此统一使用 textarea + document.execCommand("copy") 的方式做回退复制。

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false

  try {
    const textArea = document.createElement("textarea")
    textArea.value = text

    // 确保不可见但存在于 DOM 中
    textArea.style.position = "fixed"
    textArea.style.left = "-9999px"
    textArea.style.top = "0"

    document.body.appendChild(textArea)

    textArea.focus()
    textArea.select()

    const successful = document.execCommand("copy")
    document.body.removeChild(textArea)

    return successful
  } catch {
    return false
  }
}

