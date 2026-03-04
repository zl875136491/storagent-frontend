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
import { ModeToggle } from "../components/mode-toggle"

export default function AppLayout() {
  return (
    <SidebarProvider>
      <AppShell />
    </SidebarProvider>
  )
}

function AppShell() {
  const { user, logout } = useAuth()

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar className="backdrop-blur">
        <SidebarHeader>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            Cross Storage
          </div>
          <div className="text-sm font-semibold text-sidebar-foreground">
            跨区域存储系统
          </div>
        </SidebarHeader>

        <SidebarContent>
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
              <NavLink to="/data/storage/buckets">
                {({ isActive }) => (
                  <SidebarMenuButton active={isActive} icon="B">
                    存储桶文件详情
                  </SidebarMenuButton>
                )}
              </NavLink>
            </SidebarMenu>
          </div>
        </SidebarContent>
      </Sidebar>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-border/70 bg-background/80 px-4 backdrop-blur md:px-6">
          <div className="flex items-center gap-3 md:hidden">
            <SidebarTrigger />
            <div className="text-base font-semibold">Cross Storage</div>
          </div>
          <div className="flex flex-1 items-center justify-end gap-3">
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

        <main className="flex-1 px-4 pb-8 pt-4 md:px-8 md:pt-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

