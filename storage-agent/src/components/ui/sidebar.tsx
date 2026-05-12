import type { HTMLAttributes, ReactNode } from "react"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react"
import { Menu, X } from "lucide-react"
import { cn } from "../../lib/utils"

interface SidebarContextValue {
  collapsed: boolean
  mobileOpen: boolean
  setCollapsed: (next: boolean | ((prev: boolean) => boolean)) => void
  setMobileOpen: (next: boolean | ((prev: boolean) => boolean)) => void
  closeMobileDrawer: () => void
}

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined)

function subscribeMediaQuery(query: string, onChange: () => void) {
  if (typeof window === "undefined") return () => {}
  const mq = window.matchMedia(query)
  mq.addEventListener("change", onChange)
  return () => mq.removeEventListener("change", onChange)
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onStoreChange) => subscribeMediaQuery(query, onStoreChange),
    () => (typeof window !== "undefined" ? window.matchMedia(query).matches : false),
    () => false,
  )
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const closeMobileDrawer = useCallback(() => setMobileOpen(false), [])

  const isMdUp = useMediaQuery("(min-width: 768px)")

  useEffect(() => {
    if (isMdUp) setMobileOpen(false)
  }, [isMdUp])

  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [mobileOpen])

  useEffect(() => {
    if (!mobileOpen || isMdUp) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [mobileOpen, isMdUp])

  return (
    <SidebarContext.Provider
      value={{
        collapsed,
        mobileOpen,
        setCollapsed,
        setMobileOpen,
        closeMobileDrawer,
      }}
    >
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  const ctx = useContext(SidebarContext)
  if (!ctx) {
    throw new Error("Sidebar 组件必须在 SidebarProvider 中使用")
  }
  return ctx
}

export function SidebarMobileBackdrop({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const { mobileOpen, closeMobileDrawer } = useSidebar()
  if (!mobileOpen) return null

  return (
    <div
      role="presentation"
      aria-hidden
      className={cn(
        "fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px] md:hidden",
        className,
      )}
      onClick={closeMobileDrawer}
      {...props}
    />
  )
}

export function Sidebar({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const { collapsed, mobileOpen } = useSidebar()

  return (
    <aside
      data-collapsed={collapsed ? "true" : "false"}
      data-mobile-open={mobileOpen ? "true" : "false"}
      className={cn(
        "group/sidebar flex flex-col border-r border-sidebar-border bg-sidebar px-4 py-6 text-sidebar-foreground/90",
        /* 移动端：抽屉 */
        "fixed inset-y-0 left-0 z-50 w-[min(18rem,88vw)] max-w-[100vw] transition-transform duration-200 ease-out",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
        /* 桌面端：静态侧栏 */
        "md:relative md:inset-y-auto md:left-auto md:z-auto md:w-64 md:max-w-none md:translate-x-0 md:transition-none",
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
    <div className={cn("mb-6 min-w-0 space-y-1.5 md:group-data-[collapsed=true]/sidebar:mb-2", className)} {...props}>
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
  const { collapsed } = useSidebar()
  const isMdUp = useMediaQuery("(min-width: 768px)")
  const railMode = isMdUp && collapsed

  return (
    <div
      className={cn(
        "mb-2 text-[11px] font-semibold text-sidebar-foreground/65",
        railMode && "sr-only",
        className,
      )}
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
  const { collapsed } = useSidebar()
  const isMdUp = useMediaQuery("(min-width: 768px)")
  const railMode = isMdUp && collapsed

  return (
    <button
      type="button"
      data-active={active ? "true" : "false"}
      className={cn(
        "my-2 flex w-full min-w-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors",
        "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        "data-[active=true]:bg-sidebar-primary/10 data-[active=true]:text-sidebar-primary",
        railMode && "justify-center px-2",
        className,
      )}
      {...props}
    >
      {icon && (
        <span
          className={cn(
            "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-sidebar-primary/15 text-sidebar-primary [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:shrink-0",
            railMode && "bg-sidebar-primary/20",
          )}
        >
          {icon}
        </span>
      )}
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          railMode && "sr-only w-0 flex-none overflow-hidden p-0",
        )}
      >
        {children}
      </span>
    </button>
  )
}

export function SidebarTrigger({
  className,
  ...props
}: HTMLAttributes<HTMLButtonElement>) {
  const { collapsed, mobileOpen, setCollapsed, setMobileOpen } = useSidebar()
  const isMdUp = useMediaQuery("(min-width: 768px)")

  return (
    <button
      type="button"
      aria-label={isMdUp ? "切换侧边栏折叠" : mobileOpen ? "关闭导航菜单" : "打开导航菜单"}
      aria-expanded={!isMdUp ? mobileOpen : undefined}
      data-collapsed={collapsed ? "true" : "false"}
      onClick={() => {
        if (isMdUp) {
          setCollapsed((c) => !c)
        } else {
          setMobileOpen((o) => !o)
        }
      }}
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground shadow-sm hover:bg-accent hover:text-accent-foreground",
        className,
      )}
      {...props}
    >
      {isMdUp ? (
        <span className="text-sm leading-none" aria-hidden>
          {collapsed ? "›" : "‹"}
        </span>
      ) : mobileOpen ? (
        <X className="h-4 w-4" strokeWidth={2} aria-hidden />
      ) : (
        <Menu className="h-4 w-4" strokeWidth={2} aria-hidden />
      )}
    </button>
  )
}
