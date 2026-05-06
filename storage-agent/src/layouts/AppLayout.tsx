import { NavLink, Outlet } from "react-router-dom"
import { useAuth } from "../auth/AuthContext"
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
  const page_agent = new PageAgent({
      model: getEnvVar("VITE_PAGE_AGENT_MODEL"),
      baseURL: getEnvVar("VITE_PAGE_AGENT_BASE_URL"),
      apiKey: getEnvVar("VITE_PAGE_AGENT_API_KEY"),
      language: "zh-CN"
    }
  )

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar className="backdrop-blur">
        <SidebarHeader>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            Storage Agent
          </div>
          <div className="text-sm font-semibold text-sidebar-foreground">
            跨区域存储系统
          </div>
        </SidebarHeader>

        <SidebarContent>
          <div className="space-y-6">
            <div>
              <SidebarSectionTitle>基础数据管理</SidebarSectionTitle>
              <SidebarMenu>
                <NavLink to="/data/basic/region">
                  {({ isActive }) => (
                    <SidebarMenuButton active={isActive} icon="R">
                      区域管理
                    </SidebarMenuButton>
                  )}
                </NavLink>
                <NavLink to="/data/basic/application">
                  {({ isActive }) => (
                    <SidebarMenuButton active={isActive} icon="A">
                      应用管理
                    </SidebarMenuButton>
                  )}
                </NavLink>
                <NavLink to="/data/basic/api-key">
                  {({ isActive }) => (
                    <SidebarMenuButton active={isActive} icon="K">
                      APIKey 管理
                    </SidebarMenuButton>
                  )}
                </NavLink>
              </SidebarMenu>
            </div>

            <div>
              <SidebarSectionTitle>存储服务</SidebarSectionTitle>
              <SidebarMenu>
                <NavLink to="/data/minio">
                  {({ isActive }) => (
                    <SidebarMenuButton active={isActive} icon="M">
                      MinIO 服务管理
                    </SidebarMenuButton>
                  )}
                </NavLink>
                <NavLink to="/data/storage/bucket-manage">
                  {({ isActive }) => (
                    <SidebarMenuButton active={isActive} icon="S">
                      存储桶管理
                    </SidebarMenuButton>
                  )}
                </NavLink>
                <NavLink to="/data/storage/buckets">
                  {({ isActive }) => (
                    <SidebarMenuButton active={isActive} icon="B">
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
                icon="AI"
                onClick={() => {
                  if (!page_agent) {
                    // toast error
                    showErrorToast("PageAgent 未初始化，无法打开 AI 助手面板")
                    console.error("PageAgent 未初始化，无法打开 AI 助手面板")
                    return
                  }
                  void page_agent.panel.show()
                }}
              >
                AI 助手
              </SidebarMenuButton>
            </SidebarMenu>
            <SidebarMenu>
              <NavLink to="/docs">
                {({ isActive }) => (
                  <SidebarMenuButton active={isActive} icon="D">
                    使用文档
                  </SidebarMenuButton>
                )}
              </NavLink>
            </SidebarMenu>
          </div>
        </SidebarContent>
      </Sidebar>

      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex h-16 items-center gap-3 overflow-visible border-b border-border/70 bg-background/80 px-4 backdrop-blur md:px-6">
          <div className="flex shrink-0 items-center gap-3 md:hidden">
            <SidebarTrigger />
            <div className="text-base font-semibold">Storage Agent</div>
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-3 overflow-visible">
            <BackendEndpointSwitcher />
          </div>
          <div className="flex shrink-0 items-center gap-3">
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
              onClick={() => {
                void logout()
              }}
            >
              退出登录
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 pb-8 pt-4 md:px-8 md:pt-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

