import { useCallback, type MouseEvent } from "react"
import {
  BookOpen,
  Boxes,
  Database,
  FileStack,
  FolderKanban,
  Globe2,
  KeyRound,
  Sparkles,
} from "lucide-react"
import { NavLink, Outlet } from "react-router-dom"
import { useAuth } from "../auth/AuthContext"
import { useNavigationLeaveBlock } from "../contexts/NavigationLeaveBlockContext"
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
import { PageAgent } from 'page-agent'
import { showErrorToast } from "../api/toast"

export default function AppLayout() {
  return (
    <SidebarProvider>
      <AppShell />
    </SidebarProvider>
  )
}

type EnvKey =
  | "VITE_PAGE_AGENT_MODEL"
  | "VITE_PAGE_AGENT_BASE_URL"
  | "VITE_PAGE_AGENT_API_KEY"

function getEnvVar(key: EnvKey): string {
  const value = import.meta.env[key]
  if (!value) {
    console.warn(`[pageAgentConfig] 环境变量 ${key} 未设置`)
    return ""
  }
  return value
}

function AppShell() {
  const { user, logout } = useAuth()
  const { confirmIfBlocking } = useNavigationLeaveBlock()
  const { closeMobileDrawer } = useSidebar()

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

  const page_agent = new PageAgent({
      model: getEnvVar("VITE_PAGE_AGENT_MODEL"),
      baseURL: getEnvVar("VITE_PAGE_AGENT_BASE_URL"),
      apiKey: getEnvVar("VITE_PAGE_AGENT_API_KEY"),
      language: "zh-CN"
    }
  )

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
          </div>

          <div className="mt-auto border-t border-sidebar-border/60 pt-6">
            <SidebarSectionTitle>文档中心</SidebarSectionTitle>
            <SidebarMenu>
              <SidebarMenuButton
                icon={<Sparkles aria-hidden />}
                onClick={() => {
                  if (!page_agent) {
                    showErrorToast("PageAgent 未初始化，无法打开 AI 助手面板")
                    console.error("PageAgent 未初始化，无法打开 AI 助手面板")
                    return
                  }
                  void page_agent.panel.show()
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
            {user && (
              <div className="hidden items-center gap-3 text-xs text-muted-foreground md:flex">
                <div className="flex flex-col text-right">
                  <span className="text-sm font-medium text-foreground">
                    {user.name || user.username}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {user.roles && user.roles.length > 0
                      ? user.roles.map(role => role.name).join(" / ")
                      : "未分配角色"}
                  </span>
                </div>
              </div>
            )}
            <Button
              size="md"
              variant="default"
              className="shrink-0 px-3 text-xs sm:text-sm"
              onClick={() => {
                if (!confirmIfBlocking()) return
                void logout()
              }}
            >
              退出登录
            </Button>
          </div>
        </header>

        <main className="docs-scroll flex-1 overflow-y-auto px-4 pb-8 pt-4 md:px-8 md:pt-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

