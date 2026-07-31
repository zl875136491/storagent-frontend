import { useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { Eye, EyeOff, MessageSquareText } from "lucide-react"
import { useAuth } from "../auth/AuthContext"
import { requestLoginLinkApi } from "../api/client"
import { showErrorToast } from "../api/toast"
import { AuthShell } from "../components/auth/AuthShell"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { Button } from "../components/ui/button"

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation() as { state?: { from?: Location } }

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [sendingLink, setSendingLink] = useState(false)
  const [oaMessage, setOaMessage] = useState("")

  const handleSubmit = async (e?: React.SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    if (submitting) return
    e?.preventDefault()
    if (!username || !password) {
      showErrorToast("请输入用户名和密码")
      return
    }

    setSubmitting(true)
    try {
      await login({ username, password })
      const redirectTo = location.state?.from?.pathname || "/data/basic/region"
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
      description="使用系统密码，或通过 OA 消息快捷认证"
      footer={
        <div className="flex items-center justify-center gap-4">
          <Link className="font-medium text-primary hover:underline" to="/register">注册账号</Link>
          <Link className="font-medium text-primary hover:underline" to="/forgot-password">忘记密码</Link>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">用户名</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入用户名"
                autoComplete="username"
              />
            </div>

            <div className="space-y-1.5">
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
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="mt-1 w-full"
              size="lg"
            >
              {submitting ? "正在登录..." : "登录"}
            </Button>
        <div className="flex items-center gap-3 py-1 text-[11px] text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          OA 快捷认证
          <span className="h-px flex-1 bg-border" />
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={sendingLink || submitting}
          onClick={() => void requestOALogin()}
        >
          <MessageSquareText className="mr-2 h-4 w-4" aria-hidden />
          {sendingLink ? "正在发送..." : "发送快捷登录链接到 OA"}
        </Button>

        {oaMessage ? (
          <p className="rounded-md border border-primary/25 bg-primary/5 px-3 py-2 text-xs leading-5 text-foreground">
            {oaMessage}
          </p>
        ) : null}
      </form>
    </AuthShell>
  )
}
