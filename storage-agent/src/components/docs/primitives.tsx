import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { cn } from "@/lib/utils"

export type TocItem = { id: string; title: string; level: 2 | 3 }

type TocContextValue = {
  items: TocItem[]
  setItems: (items: TocItem[]) => void
  activeId: string | null
  setActiveId: (id: string | null) => void
}

const TocContext = createContext<TocContextValue | null>(null)

export function DocsTocProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<TocItem[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const value = useMemo(
    () => ({ items, setItems, activeId, setActiveId }),
    [items, activeId],
  )
  return <TocContext.Provider value={value}>{children}</TocContext.Provider>
}

export function useDocsToc() {
  const ctx = useContext(TocContext)
  if (!ctx) throw new Error("useDocsToc must be used within DocsTocProvider")
  return ctx
}

/** 页面挂载时注册右侧 TOC，并滚动高亮当前章节 */
export function useRegisterToc(items: TocItem[]) {
  const { setItems, setActiveId } = useDocsToc()

  useEffect(() => {
    setItems(items)
    return () => setItems([])
  }, [items, setItems])

  useEffect(() => {
    if (items.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]?.target.id) setActiveId(visible[0].target.id)
      },
      { rootMargin: "-20% 0px -65% 0px", threshold: [0, 1] },
    )
    for (const item of items) {
      const el = document.getElementById(item.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [items, setActiveId])
}

export function DocsOnThisPage({ className }: { className?: string }) {
  const { items, activeId } = useDocsToc()
  if (items.length === 0) return null
  return (
    <nav className={cn("space-y-1 text-xs", className)} aria-label="本页导航">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        本页
      </div>
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className={cn(
            "block rounded-md px-2 py-1 transition-colors",
            item.level === 3 && "pl-4",
            activeId === item.id
              ? "bg-accent/80 font-medium text-accent-foreground"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          )}
        >
          {item.title}
        </a>
      ))}
    </nav>
  )
}

export function slugifyHeading(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[\s]+/g, "-")
    .replace(/[^a-z0-9\-\u4e00-\u9fa5]/g, "")
}

export function DocHeading({
  id,
  level,
  children,
  className,
}: {
  id: string
  level: 2 | 3
  children: ReactNode
  className?: string
}) {
  const Tag = level === 2 ? "h2" : "h3"
  return (
    <Tag
      id={id}
      className={cn(
        "scroll-m-24 font-semibold tracking-tight text-foreground",
        level === 2 && "mt-10 border-b border-border/60 pb-2 text-xl first:mt-0",
        level === 3 && "mt-6 text-base",
        className,
      )}
    >
      {children}
    </Tag>
  )
}

export function DocTitle({ children }: { children: ReactNode }) {
  return (
    <h1 className="scroll-m-20 text-3xl font-semibold tracking-tight text-foreground">
      {children}
    </h1>
  )
}

export function DocLead({ children }: { children: ReactNode }) {
  return <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{children}</p>
}

export function DocP({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("mt-3 text-sm leading-relaxed text-foreground/90", className)}>{children}</p>
  )
}

export function DocNote({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 rounded-lg border border-border/80 bg-muted/40 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
      {children}
    </div>
  )
}

export function DocSteps({
  items,
}: {
  items: Array<{ title: string; body?: ReactNode }>
}) {
  return (
    <ol className="mt-4 space-y-3">
      {items.map((item, i) => (
        <li key={item.title} className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
            {i + 1}
          </span>
          <div className="min-w-0 pt-0.5">
            <div className="text-sm font-medium text-foreground">{item.title}</div>
            {item.body ? (
              <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.body}</div>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  )
}

export function DocNextCard({
  title,
  description,
  onClick,
}: {
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full flex-col rounded-xl border border-border/80 bg-card/60 p-4 text-left transition-colors hover:border-primary/40 hover:bg-accent/30"
    >
      <span className="text-sm font-semibold text-foreground group-hover:text-primary">{title}</span>
      <span className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</span>
    </button>
  )
}

export function DocExpand({
  summary,
  children,
}: {
  summary: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-3 rounded-lg border border-dashed border-border/70">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <span>{summary}</span>
        <span className="font-mono text-[10px]">{open ? "−" : "+"}</span>
      </button>
      {open ? <div className="border-t border-border/60 px-3 py-3 text-xs text-muted-foreground">{children}</div> : null}
    </div>
  )
}
