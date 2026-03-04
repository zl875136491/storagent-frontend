import type { HTMLAttributes, ReactNode } from "react"
import { createContext, useContext, useState } from "react"
import { cn } from "../../lib/utils"

interface SidebarContextValue {
  collapsed: boolean
  toggle: () => void
}

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined)

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <SidebarContext.Provider
      value={{
        collapsed,
        toggle: () => setCollapsed((prev) => !prev),
      }}
    >
      {children}
    </SidebarContext.Provider>
  )
}

function useSidebar() {
  const ctx = useContext(SidebarContext)
  if (!ctx) {
    throw new Error("Sidebar 组件必须在 SidebarProvider 中使用")
  }
  return ctx
}

export function Sidebar({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const { collapsed } = useSidebar()

  return (
    <aside
      data-collapsed={collapsed ? "true" : "false"}
      className={cn(
        "hidden md:flex md:w-64 md:flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground/90 px-4 py-6",
        "data-[collapsed=true]:md:w-[4.25rem]",
        className,
      )}
      {...props}
    >
      {children}
    </aside>
  )
}

export function SidebarHeader({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("mb-6 space-y-1.5", className)} {...props}>
      {children}
    </div>
  )
}

export function SidebarContent({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex flex-1 flex-col space-y-6 text-xs", className)} {...props}>
      {children}
    </div>
  )
}

export function SidebarSectionTitle({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mb-2 text-[11px] font-semibold text-muted-foreground", className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function SidebarMenu({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <nav className={cn("space-y-1", className)} {...props}>
      {children}
    </nav>
  )
}

export interface SidebarMenuButtonProps
  extends HTMLAttributes<HTMLButtonElement> {
  active?: boolean
  icon?: ReactNode
}

export function SidebarMenuButton({
  className,
  active,
  icon,
  children,
  ...props
}: SidebarMenuButtonProps) {
  return (
    <button
      type="button"
      data-active={active ? "true" : "false"}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors",
        "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        "data-[active=true]:bg-sidebar-primary/10 data-[active=true]:text-sidebar-primary",
        className,
      )}
      {...props}
    >
      {icon && (
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-sidebar-accent/60 text-[11px]">
          {icon}
        </span>
      )}
      <span className="truncate">{children}</span>
    </button>
  )
}

export function SidebarTrigger({
  className,
  ...props
}: HTMLAttributes<HTMLButtonElement>) {
  const { collapsed, toggle } = useSidebar()
  return (
    <button
      type="button"
      aria-label="切换侧边栏"
      data-collapsed={collapsed ? "true" : "false"}
      onClick={toggle}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-background/80 text-xs text-muted-foreground shadow-sm hover:bg-accent hover:text-accent-foreground",
        className,
      )}
      {...props}
    >
      {collapsed ? "›" : "‹"}
    </button>
  )
}

