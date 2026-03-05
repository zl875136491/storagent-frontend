import type { HTMLAttributes } from "react"
import { cn } from "@/lib/utils"
import { getHeadings } from "./markdown-doc"

interface TableOfContentsProps extends HTMLAttributes<HTMLDivElement> {
  content: string
}

export function TableOfContents({
  content,
  className,
  ...props
}: TableOfContentsProps) {
  const headings = getHeadings(content)

  if (headings.length === 0) {
    return null
  }

  return (
    <nav
      className={cn(
        "sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto text-xs text-muted-foreground",
        className,
      )}
      {...props}
    >
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        本页导航
      </div>
      <ul className="space-y-1">
        {headings.map((heading) => (
          <li key={heading.id}>
            <a
              href={`#${heading.id}`}
              className={cn(
                "inline-block rounded px-1.5 py-1 hover:bg-accent hover:text-accent-foreground",
                heading.level === 1 && "font-medium",
                heading.level === 2 && "ml-1",
                heading.level === 3 && "ml-4 text-[11px]",
              )}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

