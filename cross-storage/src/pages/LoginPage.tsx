import { useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { useAuth } from "../auth/AuthContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { Button } from "../components/ui/button"
import { Alert } from "../components/ui/alert"

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation() as { state?: { from?: Location } }

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    e.preventDefault()
    setError(null)
    if (!username || !password) {
      setError("请输入用户名和密码")
      return
    }

    setSubmitting(true)
    try {
      await login({ username, password })
      const redirectTo = location.state?.from?.pathname || "/data/basic/region"
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "登录失败，请检查用户名和密码是否正确",
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            Cross Storage
          </div>
          <CardTitle className="text-lg">跨区域存储系统登录</CardTitle>
          <CardDescription>
            首次登录时，您输入的密码将自动设置为登录密码。
          </CardDescription>
        </CardHeader>
        <CardContent>
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
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <span>{error}</span>
              </Alert>
            )}

            <Button
              type="submit"
              disabled={submitting}
              className="mt-1 w-full"
              size="lg"
            >
              {submitting ? "正在登录..." : "登录"}
            </Button>
          </form>

          <div className="mt-4 text-center text-[11px] text-muted-foreground">
            登录后，系统将把访问令牌保存在浏览器 LocalStorage 中，
            在令牌有效期内无需重复登录。
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

