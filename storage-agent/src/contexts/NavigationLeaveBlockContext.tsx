/* Context 模块同时导出 Provider 与 hook，符合 React 惯例 */
/* eslint-disable react-refresh/only-export-components -- 非仅组件导出 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"

export type NavigationLeaveBlockContextValue = {
  isBlocking: boolean
  message: string
  beginBlock: (message: string) => void
  endBlock: () => void
  /** 若当前存在拦截，弹出确认；返回 true 表示允许继续导航或操作 */
  confirmIfBlocking: () => boolean
}

const NavigationLeaveBlockContext = createContext<NavigationLeaveBlockContextValue | null>(
  null,
)

export function NavigationLeaveBlockProvider({ children }: { children: ReactNode }) {
  const [isBlocking, setIsBlocking] = useState(false)
  const [message, setMessage] = useState("")

  const beginBlock = useCallback((msg: string) => {
    setMessage(msg)
    setIsBlocking(true)
  }, [])

  const endBlock = useCallback(() => {
    setIsBlocking(false)
    setMessage("")
  }, [])

  const confirmIfBlocking = useCallback(() => {
    if (!isBlocking) return true
    return window.confirm(message)
  }, [isBlocking, message])

  const value = useMemo(
    () => ({ isBlocking, message, beginBlock, endBlock, confirmIfBlocking }),
    [isBlocking, message, beginBlock, endBlock, confirmIfBlocking],
  )

  return (
    <NavigationLeaveBlockContext.Provider value={value}>
      {children}
    </NavigationLeaveBlockContext.Provider>
  )
}

export function useNavigationLeaveBlock(): NavigationLeaveBlockContextValue {
  const ctx = useContext(NavigationLeaveBlockContext)
  if (!ctx) {
    throw new Error("useNavigationLeaveBlock 必须在 NavigationLeaveBlockProvider 内使用")
  }
  return ctx
}
