import { NavLink, Outlet } from "react-router-dom"
import { useAuth } from "../auth/AuthContext"

export default function AppLayout() {
  const { user, logout } = useAuth()

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <aside className="hidden w-64 flex-shrink-0 border-r border-slate-200 bg-white/80 px-4 py-6 backdrop-blur md:block">
        <div className="mb-8">
          <div className="text-xs font-semibold uppercase tracking-wide text-sky-500">
            Cross Storage
          </div>
          <div className="mt-1 text-base font-semibold text-slate-900">
            跨区域存储系统
          </div>
        </div>

        <nav className="space-y-6 text-sm">
          <div>
            <div className="mb-2 text-xs font-semibold text-slate-500">
              基础数据管理
            </div>
            <NavLink
              to="/data/basic/region"
              className={({ isActive }) =>
                [
                  "flex items-center rounded-lg px-3 py-2 transition-colors",
                  isActive
                    ? "bg-sky-50 text-sky-600"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                ].join(" ")
              }
            >
              <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-md bg-sky-100 text-xs text-sky-600">
                R
              </span>
              区域管理
            </NavLink>
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold text-slate-500">
              存储服务
            </div>
            <NavLink
              to="/data/minio"
              className={({ isActive }) =>
                [
                  "flex items-center rounded-lg px-3 py-2 transition-colors",
                  isActive
                    ? "bg-sky-50 text-sky-600"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                ].join(" ")
              }
            >
              <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-100 text-xs text-emerald-600">
                M
              </span>
              MinIO 服务管理
            </NavLink>
          </div>
        </nav>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 px-4 backdrop-blur md:px-6">
          <div className="flex items-center gap-3 md:hidden">
            <div className="text-base font-semibold text-slate-900">Cross Storage</div>
          </div>
          <div className="flex flex-1 items-center justify-end gap-4">
            {user && (
              <div className="hidden items-center gap-3 text-sm text-slate-700 md:flex">
                <div className="flex flex-col text-right">
                  <span className="font-medium">{user.name || user.username}</span>
                  <span className="text-xs text-slate-400">
                    {user.roles && user.roles.length > 0
                      ? user.roles.join(" / ")
                      : "未分配角色"}
                  </span>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                void logout()
              }}
              className="inline-flex items-center rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-slate-800"
            >
              退出登录
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 pb-8 pt-4 md:px-8 md:pt-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

