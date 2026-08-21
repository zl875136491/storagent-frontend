import { useEffect } from "react"

const APP_NAME = "Storagent"

/** 设置页面标题为「{title} - Storagent」；title 为空时回退为应用名 */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} - ${APP_NAME}` : APP_NAME
  }, [title])
}
