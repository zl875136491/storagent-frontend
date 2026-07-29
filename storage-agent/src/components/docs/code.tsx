import { useState, type ReactNode } from "react"
import { Check, Copy } from "lucide-react"
import { copyTextToClipboard } from "@/lib/copy-to-clipboard"
import { cn } from "@/lib/utils"

export function DocCodeBlock({
  code,
  language = "bash",
  title,
  className,
}: {
  code: string
  language?: string
  title?: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  const text = code.replace(/\n$/, "")

  const onCopy = async () => {
    const ok = await copyTextToClipboard(text)
    if (!ok) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border/80 bg-muted/50", className)}>
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {title || language}
        </span>
        <button
          type="button"
          onClick={() => void onCopy()}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-background/60 hover:text-foreground"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <pre className="docs-scroll max-h-[28rem] overflow-auto p-3 text-[11px] leading-relaxed text-foreground">
        <code className="font-mono whitespace-pre">{text}</code>
      </pre>
    </div>
  )
}

export function DocCodeTabs({
  tabs,
  className,
}: {
  tabs: Array<{ id: string; label: string; language?: string; code: string }>
  className?: string
}) {
  const [active, setActive] = useState(tabs[0]?.id ?? "")
  const current = tabs.find((t) => t.id === active) ?? tabs[0]
  if (!current) return null

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap gap-1 rounded-lg border border-border/70 bg-muted/30 p-0.5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            className={cn(
              "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
              active === tab.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <DocCodeBlock code={current.code} language={current.language ?? current.id} title={current.label} />
    </div>
  )
}

export function DocSplit({
  left,
  right,
}: {
  left: ReactNode
  right: ReactNode
}) {
  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.95fr)] xl:items-start">
      <div className="min-w-0">{left}</div>
      <div className="min-w-0 xl:sticky xl:top-4">{right}</div>
    </div>
  )
}
