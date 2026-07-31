import { useState } from "react"
import { CheckCircle2, Eye, EyeOff } from "lucide-react"
import { Link } from "react-router-dom"

import {
  requestPasswordResetApi,
  requestRegistrationApi,
  type AuthRequestResponse,
} from "../api/client"
import { showErrorToast } from "../api/toast"
import { AuthShell } from "../components/auth/AuthShell"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"

interface OAPasswordRequestPageProps {
  mode: "register" | "reset"
}

export default function OAPasswordRequestPage({ mode }: OAPasswordRequestPageProps) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<AuthRequestResponse | null>(null)

  const isRegister = mode === "register"

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!username.trim() || !password || !confirmPassword) {
      showErrorToast("请填写完整信息")
      return
    }
    if (password !== confirmPassword) {
      showErrorToast("两次输入的密码不一致")
      return
    }
    setSubmitting(true)
    try {
      const payload = {
        username: username.trim(),
        password,
        confirm_password: confirmPassword,
      }
      const next = isRegister
        ? await requestRegistrationApi(payload)
        : await requestPasswordResetApi(payload)
      setResult(next)
    } catch {
      // API client already displayed the error.
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      title={isRegister ? "注册账号" : "重置密码"}
      description={isRegister ? "设置密码后，通过 OA 确认身份" : "设置新密码后，通过 OA 确认本次变更"}
      footer={<Link className="font-medium text-primary hover:underline" to="/login">返回登录</Link>}
    >
      {result ? (
        <div className="space-y-4 text-center">
          <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-600" aria-hidden />
          <div>
            <div className="text-sm font-medium text-foreground">请打开 OA 验证链接</div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{result.message}</p>
          </div>
          <Button type="button" variant="outline" className="w-full" onClick={() => setResult(null)}>
            重新填写
          </Button>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor={`${mode}-username`}>itcode</Label>
            <Input
              id={`${mode}-username`}
              value={username}
              autoComplete="username"
              placeholder="请输入 itcode"
              onChange={(event) => setUsername(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${mode}-password`}>{isRegister ? "设置密码" : "新密码"}</Label>
            <div className="relative">
              <Input
                id={`${mode}-password`}
                type={showPassword ? "text" : "password"}
                value={password}
                autoComplete="new-password"
                className="pr-10"
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 inline-flex items-center px-3 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={showPassword ? "隐藏密码" : "显示密码"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">至少 8 位，并同时包含字母和数字</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${mode}-confirm-password`}>确认密码</Label>
            <Input
              id={`${mode}-confirm-password`}
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              autoComplete="new-password"
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={submitting}>
            {submitting ? "正在发送..." : "发送 OA 验证链接"}
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
