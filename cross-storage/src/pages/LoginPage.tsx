import { useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { useAuth } from "../auth/AuthContext"

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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 px-4">
      <div className="w-full max-w-md rounded-3xl bg-white/5 p-6 shadow-2xl ring-1 ring-white/10 backdrop-blur">
        <div className="mb-6 text-center">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">
            Cross Storage
          </div>
          <h1 className="text-xl font-semibold text-white">跨区域存储系统登录</h1>
          <p className="mt-2 text-xs text-slate-300">
            首次登录时，您输入的密码将自动设置为登录密码
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-200">
              用户名
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none ring-0 placeholder:text-slate-400 focus:border-sky-400 focus:bg-slate-950/40"
              placeholder="请输入用户名"
              autoComplete="username"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-200">
              密码
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none ring-0 placeholder:text-slate-400 focus:border-sky-400 focus:bg-slate-950/40"
              placeholder="请输入密码"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-100">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 inline-flex w-full items-center justify-center rounded-xl bg-sky-500 px-3 py-2.5 text-sm font-semibold text-white shadow-lg shadow-sky-500/40 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-sky-600/50"
          >
            {submitting ? "正在登录..." : "登录"}
          </button>
        </form>

        <div className="mt-4 text-center text-[11px] text-slate-400">
          登录后，系统将把访问令牌保存在浏览器 LocalStorage 中，
          在令牌有效期内无需重复登录。
        </div>
      </div>
    </div>
  )
}

