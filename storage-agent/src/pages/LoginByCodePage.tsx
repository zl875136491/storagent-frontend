import { useCallback, useEffect, useRef, useState } from "react"
import { ShieldCheck, XCircle } from "lucide-react"
import { Link, useNavigate } from "react-router-dom"

import { loginByCodeAcrossBackends } from "../api/client"
import { useAuth } from "../auth/AuthContext"
import { AuthShell } from "../components/auth/AuthShell"
import { Button } from "../components/ui/button"
import { BrandLoading } from "../components/BrandLoading"
import { useDocumentTitle } from "../lib/useDocumentTitle"

type VerifyState = "waiting" | "verifying" | "success" | "error"

export default function LoginByCodePage() {
  useDocumentTitle("OA 登录")
  const navigate = useNavigate()
  const { initializing, loginWithTokens } = useAuth()
  const paramsRef = useRef(new URLSearchParams(window.location.search))
  const startedRef = useRef(false)
  const [state, setState] = useState<VerifyState>("waiting")
  const [error, setError] = useState("")

  const verify = useCallback(async () => {
    const username = paramsRef.current.get("username")?.trim() ?? ""
    const code = paramsRef.current.get("code")?.trim() ?? ""
    window.history.replaceState(window.history.state, "", "/login_by_code")
    if (!username || !code) {
      setError("链接缺少必要的认证参数")
      setState("error")
      return
    }

    setState("verifying")
    setError("")
    try {
      const tokens = await loginByCodeAcrossBackends({ username, code })
      await loginWithTokens(tokens)
      setState("success")
      navigate("/docs/overview", { replace: true })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法完成 OA 认证")
      setState("error")
    }
  }, [loginWithTokens, navigate])

  useEffect(() => {
    if (initializing || startedRef.current) return
    startedRef.current = true
    const timer = window.setTimeout(() => void verify(), 0)
    return () => window.clearTimeout(timer)
  }, [initializing, verify])

  return (
    <AuthShell
      title="OA 身份认证"
      description="正在从可用服务点确认这条一次性链接"
      footer={<Link className="font-medium text-primary hover:underline" to="/login">返回登录</Link>}
    >
      <div className="space-y-4 text-center">
        {state === "waiting" || state === "verifying" ? (
          <>
            <BrandLoading label="正在验证，请稍候..." compact iconClassName="h-10 w-10" />
          </>
        ) : state === "success" ? (
          <>
            <ShieldCheck className="mx-auto h-9 w-9 text-emerald-600" aria-hidden />
            <p className="text-sm text-foreground">认证成功，正在进入系统...</p>
          </>
        ) : (
          <>
            <XCircle className="mx-auto h-9 w-9 text-destructive" aria-hidden />
            <div>
              <p className="text-sm font-medium text-foreground">认证未完成</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{error}</p>
            </div>
            <Button type="button" variant="outline" className="w-full" onClick={() => void verify()}>
              重新验证
            </Button>
          </>
        )}
      </div>
    </AuthShell>
  )
}
