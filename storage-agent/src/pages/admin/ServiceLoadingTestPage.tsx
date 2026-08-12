import { DatabaseZap, ServerCog } from "lucide-react"
import { Navigate, NavLink } from "react-router-dom"

import { useAuth } from "@/auth/AuthContext"
import { DocVersionSwitcher } from "@/components/docs/version-switcher"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

function canOperateService(user: ReturnType<typeof useAuth>["user"]) {
  return user?.is_admin === true || user?.roles.some((role) => role.name === "运维管理员") === true
}

function ServiceOperationsTabs() {
  return (
    <nav className="inline-flex rounded-md border border-border bg-muted/40 p-0.5" role="tablist" aria-label="服务运维视图">
      <NavLink
        to="/admin/service-operations"
        end
        className={({ isActive }) => cn(
          "inline-flex h-8 items-center gap-1.5 rounded px-3 text-xs transition-colors",
          isActive ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <DatabaseZap className="h-3.5 w-3.5" aria-hidden />
        接口验证
      </NavLink>
      <NavLink
        to="/admin/service-operations/loading-test"
        className={({ isActive }) => cn(
          "inline-flex h-8 items-center gap-1.5 rounded px-3 text-xs transition-colors",
          isActive ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <ServerCog className="h-3.5 w-3.5" aria-hidden />
        加载测试
      </NavLink>
    </nav>
  )
}

export default function ServiceLoadingTestPage() {
  const { user } = useAuth()
  if (!canOperateService(user)) return <Navigate to="/data/basic/region" replace />

  return (
    <div className="mx-auto flex h-full min-h-[680px] max-w-8xl flex-col pb-10">
      <header className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">服务运维</h1>
          <p className="mt-1 text-xs text-muted-foreground">
          系统加载动画的独立预览页。此页不发起存储服务请求，仅用于确认图标在不同界面尺寸下的动效表现。
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <DocVersionSwitcher className="shrink-0" />
          <ServiceOperationsTabs />
        </div>
      </header>

      <section className="min-h-0 flex-1" aria-label="加载动画预览">
        <Card className="h-full min-h-80 max-w-2xl rounded-lg shadow-none">
          <CardContent className="flex min-h-80 flex-col items-center justify-center p-8 text-center">
            <div className="flex h-32 w-32 items-center justify-center" aria-hidden>
              <img
                src="/brand-mark.png"
                alt=""
                className="brand-mark-loading h-24 w-24 object-contain"
              />
            </div>
            <h2 className="mt-5 text-base font-semibold text-foreground">正在加载存储服务</h2>
            <p className="mt-2 text-sm text-muted-foreground">Storagent 正在准备所需资源</p>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
