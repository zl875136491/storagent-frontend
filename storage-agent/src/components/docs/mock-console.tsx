import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { ArrowUpRight } from "lucide-react"
import { cn } from "@/lib/utils"

/** 仿控制台截图的外框 */
export function MockConsole({
  title,
  children,
  className,
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border/80 bg-background shadow-sm ring-1 ring-border/40",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-border/70 bg-muted/40 px-3 py-2">
        <span className="flex gap-1" aria-hidden>
          <span className="h-2 w-2 rounded-full bg-rose-400/80" />
          <span className="h-2 w-2 rounded-full bg-amber-400/80" />
          <span className="h-2 w-2 rounded-full bg-emerald-400/80" />
        </span>
        <span className="text-[10px] font-medium text-muted-foreground">{title}</span>
      </div>
      <div className="grid min-h-[168px] grid-cols-[7.5rem_1fr]">{children}</div>
    </div>
  )
}

export function MockSidebar({ items, active }: { items: string[]; active: string }) {
  return (
    <aside className="border-r border-border/60 bg-muted/25 p-2">
      <div className="mb-2 px-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        菜单
      </div>
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li
            key={item}
            className={cn(
              "rounded-md px-1.5 py-1 text-[10px]",
              item === active
                ? "bg-primary/15 font-medium text-primary"
                : "text-muted-foreground",
            )}
          >
            {item}
          </li>
        ))}
      </ul>
    </aside>
  )
}

export function MockMain({ children }: { children: ReactNode }) {
  return <div className="space-y-2 p-3">{children}</div>
}

export function MockToolbar({ title, action }: { title: string; action?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="text-[11px] font-semibold text-foreground">{title}</div>
      {action ? (
        <span className="rounded-md bg-primary px-2 py-0.5 text-[9px] font-medium text-primary-foreground">
          {action}
        </span>
      ) : null}
    </div>
  )
}

export function MockRows({
  rows,
}: {
  rows: Array<{ primary: string; secondary?: string; badge?: string }>
}) {
  return (
    <div className="space-y-1.5">
      {rows.map((row) => (
        <div
          key={row.primary}
          className="flex items-center justify-between rounded-lg border border-border/60 bg-card/70 px-2 py-1.5"
        >
          <div className="min-w-0">
            <div className="truncate text-[10px] font-medium text-foreground">{row.primary}</div>
            {row.secondary ? (
              <div className="truncate text-[9px] text-muted-foreground">{row.secondary}</div>
            ) : null}
          </div>
          {row.badge ? (
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
              {row.badge}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  )
}

export function FeatureWalkthrough({
  title,
  description,
  to,
  cta,
  mock,
}: {
  title: string
  description: string
  to: string
  cta: string
  mock: ReactNode
}) {
  return (
    <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-center">
      <div>
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
        <Link
          to={to}
          className="mt-4 inline-flex h-8 items-center rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          {cta}
          <ArrowUpRight className="ml-1 h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
      <div>{mock}</div>
    </div>
  )
}
