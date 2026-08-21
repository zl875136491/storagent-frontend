import { useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { Eye, EyeOff, KeyRound, MessageSquareText } from "lucide-react"
import { useAuth } from "../auth/AuthContext"
import { requestLoginLinkApi } from "../api/client"
import { showErrorToast } from "../api/toast"
import { AuthShell } from "../components/auth/AuthShell"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { Button } from "../components/ui/button"
import { useDocumentTitle } from "../lib/useDocumentTitle"

export default function LoginPage() {
  useDocumentTitle("登录")
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation() as { state?: { from?: Location } }

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loginMode, setLoginMode] = useState<"password" | "oa">("password")
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [sendingLink, setSendingLink] = useState(false)
  const [oaMessage, setOaMessage] = useState("")

  const handleSubmit = async (e?: React.SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    e?.preventDefault()
    if (loginMode === "oa") {
      if (!sendingLink) void requestOALogin()
      return
    }
    if (submitting) return
    if (!username || !password) {
      showErrorToast("请输入用户名和密码")
      return
    }

    setSubmitting(true)
    try {
      await login({ username, password })
      const redirectTo = location.state?.from?.pathname || "/docs/overview"
      navigate(redirectTo, { replace: true })
    } catch {
      // 接口错误已由 api client 通过 toast 展示
    } finally {
      setSubmitting(false)
    }
  }

  const requestOALogin = async () => {
    const itcode = username.trim()
    if (!itcode) {
      showErrorToast("请先输入 itcode")
      return
    }
    setSendingLink(true)
    setOaMessage("")
    try {
      const result = await requestLoginLinkApi({ username: itcode })
      setOaMessage(result.message)
    } catch {
      // API client already displayed the error.
    } finally {
      setSendingLink(false)
    }
  }

  return (
    <AuthShell
      title="登录"
      description="请选择一种认证方式完成登录"
      footer={
        <div className="flex items-center justify-center gap-4">
          <Link className="font-medium text-primary hover:underline" to="/register">注册账号</Link>
          <Link className="font-medium text-primary hover:underline" to="/forgot-password">忘记密码</Link>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 rounded-md border border-border/70 bg-muted/30 p-1" role="group" aria-label="登录方式">
          <button
            type="button"
            aria-pressed={loginMode === "password"}
            className={`inline-flex h-9 items-center justify-center gap-1.5 rounded px-3 text-xs transition-colors ${loginMode === "password" ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => {
              setLoginMode("password")
              setOaMessage("")
            }}
          >
            <KeyRound className="h-3.5 w-3.5" aria-hidden />
            密码登录
          </button>
          <button
            type="button"
            aria-pressed={loginMode === "oa"}
            className={`inline-flex h-9 items-center justify-center gap-1.5 rounded px-3 text-xs transition-colors ${loginMode === "oa" ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => {
              setLoginMode("oa")
              setPassword("")
            }}
          >
            <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
            OA 登录
          </button>
        </div>
            <div className="space-y-1.5">
              <Label htmlFor="username">{loginMode === "oa" ? "itcode" : "用户名"}</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={loginMode === "oa" ? "请输入 itcode" : "请输入用户名"}
                autoComplete="username"
              />
            </div>

            {loginMode === "password" ? <div className="space-y-1.5">
              <Label htmlFor="password">密码</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  autoComplete="current-password"
                  className="pr-10"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      void handleSubmit()
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 inline-flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div> : null}

        {loginMode === "password" ? (
          <Button type="submit" disabled={submitting} className="mt-1 w-full" size="lg">
            {submitting ? "正在登录..." : "使用密码登录"}
          </Button>
        ) : (
          <>
            <p className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
              OA 登录不会要求输入系统密码。输入 itcode 后，系统会向你的 OA 发送一次性认证链接。
            </p>
            <Button type="button" variant="outline" className="w-full" disabled={sendingLink} onClick={() => void requestOALogin()}>
              <MessageSquareText className="mr-2 h-4 w-4" aria-hidden />
              {sendingLink ? "正在发送..." : "发送 OA 登录链接"}
            </Button>
          </>
        )}

        {oaMessage ? (
          <p className="rounded-md border border-primary/25 bg-primary/5 px-3 py-2 text-xs leading-5 text-foreground">
            {oaMessage}
          </p>
        ) : null}
      </form>
    </AuthShell>
  )
}
