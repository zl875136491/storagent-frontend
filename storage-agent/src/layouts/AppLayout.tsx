import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react"
import {
  BookOpen,
  Boxes,
  ChartScatter,
  ChevronDown,
  Database,
  FileStack,
  FolderKanban,
  Globe2,
  KeyRound,
  LogOut,
  Settings2,
  Sparkles,
  UserRound,
  Users,
  Wrench,
} from "lucide-react"
import { NavLink, Outlet, useLocation } from "react-router-dom"
import { useAuth } from "../auth/AuthContext"
import { hasPermission, PERMISSIONS } from "../auth/permissions"
import { useNavigationLeaveBlock } from "../contexts/NavigationLeaveBlockContext"
import {
  fetchAIChatCompletionProxy,
  fetchAIRuntimeConfigApi,
  type AIRuntimeConfig,
  type UserProfile,
} from "../api/client"
import { Button } from "../components/ui/button"
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarSectionTitle,
  SidebarMenu,
  SidebarMenuButton,
  SidebarTrigger,
  SidebarMobileBackdrop,
  useSidebar,
} from "../components/ui/sidebar"
import { BackendEndpointSwitcher } from "../components/BackendEndpointSwitcher"
import { ModeToggle } from "../components/mode-toggle"
import { PageAgent } from "page-agent"
import { showErrorToast } from "../api/toast"
import { cn } from "../lib/utils"

export default function AppLayout() {
  return (
    <SidebarProvider>
      <AppShell />
    </SidebarProvider>
  )
}

function HeaderUserMenu({
  user,
  logout,
  confirmIfBlocking,
}: {
  user: UserProfile
  logout: () => Promise<void>
  confirmIfBlocking: () => boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [logoutInlineConfirm, setLogoutInlineConfirm] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const displayName = user.name || user.username

  useEffect(() => {
    if (!menuOpen) setLogoutInlineConfirm(false)
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    return () => document.removeEventListener("pointerdown", onPointerDown, true)
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [menuOpen])

  const confirmLogout = useCallback(() => {
    if (!confirmIfBlocking()) return
    setMenuOpen(false)
    void logout()
  }, [confirmIfBlocking, logout])

  return (
    <div ref={rootRef} className="relative shrink-0">
      <Button
        type="button"
        variant="ghost"
        size="md"
        className="h-9 max-w-[min(100%,14rem)] gap-1.5 px-2 text-muted-foreground hover:bg-accent/80 hover:text-foreground sm:max-w-[18rem] sm:gap-2 sm:px-3"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <UserRound className="h-4 w-4 shrink-0 text-foreground/90" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-left text-sm font-medium text-foreground">
          {displayName}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 opacity-70 transition-transform ${menuOpen ? "rotate-180" : ""}`}
          aria-hidden
        />
      </Button>

      {menuOpen ? (
        <div
          role="menu"
          aria-label="用户菜单"
          className="absolute right-0 top-full z-50 mt-1.5 w-[min(calc(100vw-1.5rem),15rem)] rounded-xl border border-border/80 bg-popover py-1 text-popover-foreground shadow-lg ring-1 ring-black/5 dark:ring-white/10"
        >
          <div className="p-1">
            {logoutInlineConfirm ? (
              <div className="flex gap-1.5" role="group" aria-label="确认退出登录">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 min-w-0 flex-1 rounded-lg px-2 text-xs"
                  onClick={() => setLogoutInlineConfirm(false)}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-8 min-w-0 flex-1 rounded-lg px-2 text-xs"
                  onClick={confirmLogout}
                >
                  退出
                </Button>
              </div>
            ) : (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setLogoutInlineConfirm(true)}
              >
                <LogOut className="h-4 w-4 shrink-0" aria-hidden />
                退出登录
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function AppShell() {
  const { user, logout, accessToken } = useAuth()
  const canManageUsers = hasPermission(user, PERMISSIONS.userManage)
  const canOperateStorage = hasPermission(user, PERMISSIONS.storageOperationsManage)
  const showSystemManagement = Boolean(user?.is_admin || canManageUsers || canOperateStorage)
  const location = useLocation()
  const { confirmIfBlocking } = useNavigationLeaveBlock()
  const { closeMobileDrawer } = useSidebar()
  const [aiConfig, setAIConfig] = useState<AIRuntimeConfig | null>(null)
  const [aiConfigLoading, setAIConfigLoading] = useState(true)
  const [backendRevision, setBackendRevision] = useState(0)
  const isDocsRoute = location.pathname === "/docs"

  useEffect(() => {
    const onBackendChanged = () => setBackendRevision((revision) => revision + 1)
    window.addEventListener("storagent:backend-changed", onBackendChanged)
    return () => window.removeEventListener("storagent:backend-changed", onBackendChanged)
  }, [])

  const handleNavClick = useCallback(
    (e: MouseEvent) => {
      if (!confirmIfBlocking()) {
        e.preventDefault()
        return
      }
      closeMobileDrawer()
    },
    [confirmIfBlocking, closeMobileDrawer],
  )

  const loadAIConfig = useCallback(async () => {
    if (!accessToken) {
      setAIConfig(null)
      setAIConfigLoading(false)
      return
    }
    setAIConfigLoading(true)
    try {
      setAIConfig(await fetchAIRuntimeConfigApi(accessToken))
    } catch {
      setAIConfig(null)
    } finally {
      setAIConfigLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    void loadAIConfig()
    const reload = () => void loadAIConfig()
    window.addEventListener("storagent:ai-config-updated", reload)
    return () => window.removeEventListener("storagent:ai-config-updated", reload)
  }, [loadAIConfig])

  const pageAgent = useMemo(() => {
    if (!aiConfig?.enabled || !aiConfig.configured) return null
    try {
      return new PageAgent({
        model: aiConfig.model,
        baseURL: "/api/ai/openai/v1",
        customFetch: fetchAIChatCompletionProxy,
        language: "zh-CN",
        maxSteps: aiConfig.max_steps,
      })
    } catch {
      return null
    }
  }, [aiConfig])

  useEffect(() => {
    return () => pageAgent?.dispose()
  }, [pageAgent])

  return (
    <div className="flex h-screen min-w-0 overflow-hidden bg-background text-foreground">
      <SidebarMobileBackdrop />
      <Sidebar className="backdrop-blur">
        <SidebarHeader>
          <div className="break-words text-[11px] font-semibold uppercase tracking-[0.14em] text-sidebar-primary-foreground/95 md:group-data-[collapsed=true]/sidebar:sr-only">
            Storage Agent
          </div>
          <div className="text-sm font-semibold leading-snug text-sidebar-foreground md:group-data-[collapsed=true]/sidebar:sr-only">
            跨区域存储系统
          </div>
        </SidebarHeader>

        <SidebarContent>
          <div className="space-y-6">
            <div>
              <SidebarSectionTitle>基础数据管理</SidebarSectionTitle>
              <SidebarMenu>
                <NavLink to="/data/basic/region" onClick={handleNavClick}>
                  {({ isActive }) => (
                    <SidebarMenuButton active={isActive} icon={<Globe2 aria-hidden />}>
                      区域管理
                    </SidebarMenuButton>
                  )}
                </NavLink>
                <NavLink to="/data/basic/application" onClick={handleNavClick}>
                  {({ isActive }) => (
                    <SidebarMenuButton active={isActive} icon={<Boxes aria-hidden />}>
                      应用管理
                    </SidebarMenuButton>
                  )}
                </NavLink>
                <NavLink to="/data/basic/api-key" onClick={handleNavClick}>
                  {({ isActive }) => (
                    <SidebarMenuButton active={isActive} icon={<KeyRound aria-hidden />}>
                      APIKey 管理
                    </SidebarMenuButton>
                  )}
                </NavLink>
              </SidebarMenu>
            </div>

            <div>
              <SidebarSectionTitle>存储服务</SidebarSectionTitle>
              <SidebarMenu>
                <NavLink to="/data/minio" onClick={handleNavClick}>
                  {({ isActive }) => (
                    <SidebarMenuButton active={isActive} icon={<Database aria-hidden />}>
                      MinIO 服务管理
                    </SidebarMenuButton>
                  )}
                </NavLink>
                <NavLink to="/data/storage/bucket-manage" onClick={handleNavClick}>
                  {({ isActive }) => (
                    <SidebarMenuButton active={isActive} icon={<FolderKanban aria-hidden />}>
                      存储桶管理
                    </SidebarMenuButton>
                  )}
                </NavLink>
                <NavLink to="/data/storage/buckets" onClick={handleNavClick}>
                  {({ isActive }) => (
                    <SidebarMenuButton active={isActive} icon={<FileStack aria-hidden />}>
                      服务器文件详情
                    </SidebarMenuButton>
                  )}
                </NavLink>
              </SidebarMenu>
            </div>

            {showSystemManagement ? (
              <div>
                <SidebarSectionTitle>系统管理</SidebarSectionTitle>
                <SidebarMenu>
                  {canManageUsers ? (
                    <NavLink to="/admin/users" onClick={handleNavClick}>
                      {({ isActive }) => (
                        <SidebarMenuButton active={isActive} icon={<Users aria-hidden />}>
                          角色管理
                        </SidebarMenuButton>
                      )}
                    </NavLink>
                  ) : null}
                  {user?.is_admin ? (
                    <NavLink to="/admin/usage" onClick={handleNavClick}>
                      {({ isActive }) => (
                        <SidebarMenuButton active={isActive} icon={<ChartScatter aria-hidden />}>
                          用量统计
                        </SidebarMenuButton>
                      )}
                    </NavLink>
                  ) : null}
                  {canOperateStorage ? (
                    <NavLink to="/admin/storage-operations" onClick={handleNavClick}>
                      {({ isActive }) => (
                        <SidebarMenuButton active={isActive} icon={<Wrench aria-hidden />}>
                          存储运维
                        </SidebarMenuButton>
                      )}
                    </NavLink>
                  ) : null}
                  {user?.is_admin ? (
                    <NavLink to="/admin/ai" onClick={handleNavClick}>
                      {({ isActive }) => (
                        <SidebarMenuButton active={isActive} icon={<Settings2 aria-hidden />}>
                          AI 助手配置
                        </SidebarMenuButton>
                      )}
                    </NavLink>
                  ) : null}
                </SidebarMenu>
              </div>
            ) : null}
          </div>

          <div className="mt-auto border-t border-sidebar-border/60 pt-6">
            <SidebarSectionTitle>文档中心</SidebarSectionTitle>
            <SidebarMenu>
              <SidebarMenuButton
                icon={<Sparkles aria-hidden />}
                onClick={() => {
                  if (aiConfigLoading) {
                    showErrorToast("AI 助手配置正在加载")
                    return
                  }
                  if (!pageAgent) {
                    showErrorToast("AI 助手尚未启用或配置不可用")
                    return
                  }
                  void pageAgent.panel.show()
                  closeMobileDrawer()
                }}
              >
                AI 助手
              </SidebarMenuButton>
            </SidebarMenu>
            <SidebarMenu>
              <NavLink to="/docs" onClick={handleNavClick}>
                {({ isActive }) => (
                  <SidebarMenuButton active={isActive} icon={<BookOpen aria-hidden />}>
                    使用文档
                  </SidebarMenuButton>
                )}
              </NavLink>
            </SidebarMenu>
          </div>
        </SidebarContent>
      </Sidebar>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="relative z-30 flex min-h-14 flex-wrap items-center gap-2 overflow-visible border-b border-border/70 bg-background/80 px-3 py-2 backdrop-blur sm:min-h-16 sm:flex-nowrap sm:gap-3 sm:px-4 md:px-6">
          <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3 md:hidden">
            <SidebarTrigger />
            <div className="truncate text-sm font-semibold sm:text-base">Storage Agent</div>
          </div>
          <div className="order-3 flex min-w-0 basis-full items-center sm:order-none sm:basis-auto sm:flex-1">
            <BackendEndpointSwitcher />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
            <ModeToggle />
            {user ? (
              <HeaderUserMenu user={user} logout={logout} confirmIfBlocking={confirmIfBlocking} />
            ) : null}
          </div>
        </header>

        <main
          className={cn(
            "min-h-0 flex-1",
            isDocsRoute
              ? "overflow-hidden"
              : "docs-scroll overflow-y-auto px-4 pb-8 pt-4 md:px-8 md:pt-6",
          )}
        >
          <div key={backendRevision} className="min-h-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
