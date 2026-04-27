import type { ReactNode } from "react"
import { useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeHighlight from "rehype-highlight"
import { copyTextToClipboard } from "@/lib/copy-to-clipboard"
import { cn } from "@/lib/utils"

interface MarkdownDocProps {
  content: string
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[\s]+/g, "-")
    .replace(/[^a-z0-9\-\u4e00-\u9fa5]/g, "")
}

export function getHeadings(content: string) {
  const lines = content.split("\n")
  const headings: { id: string; level: number; text: string }[] = []

  for (const line of lines) {
    const match = /^(#{1,6})\s+(.*)$/.exec(line)
    if (match) {
      const level = match[1].length
      const text = match[2].trim()
      if (level <= 3) {
        headings.push({
          id: slugify(text),
          level,
          text,
        })
      }
    }
  }

  return headings
}

interface CodeProps {
  inline?: boolean
  className?: string
  children: ReactNode
}

function normalizeLanguageLabel(lang: string) {
  const l = (lang || "").toLowerCase()
  if (l === "js" || l === "mjs" || l === "cjs") return "javascript"
  if (l === "ts") return "typescript"
  if (l === "jsx") return "javascript"
  if (l === "tsx") return "typescript"
  return l
}

function CodeBlock({ className, children }: CodeProps) {
  const [copied, setCopied] = useState(false)

  const languageMatch = /language-(\w+)/.exec(className || "")
  const language = normalizeLanguageLabel(languageMatch?.[1] ?? "")
  const text = String(children ?? "").replace(/\n$/, "")

  const handleCopy = async () => {
    if (!text) return
    const ok = await copyTextToClipboard(text)
    if (ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="my-4 overflow-hidden rounded-md border border-border/70 bg-muted/60">
      <div className="flex items-center justify-between border-b border-border/60 bg-muted/80 px-3 py-1.5 text-[11px] text-muted-foreground">
        <span className="uppercase tracking-[0.12em]">
          {language || "code"}
        </span>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="rounded-md border border-border/70 bg-background/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <pre className="overflow-x-auto bg-muted/40 p-4">
        <code className={cn("hljs font-mono text-sm", className)}>
          {children}
        </code>
      </pre>
    </div>
  )
}

export function MarkdownDoc({ content }: MarkdownDocProps) {
  const components = {
    h1: ({ children, ...props }: { children: ReactNode }) => {
      const text = String(children)
      const id = slugify(text)
      return (
        <h1
          id={id}
          className="scroll-m-20 text-3xl font-bold tracking-tight lg:text-4xl"
          {...props}
        >
          {children}
        </h1>
      )
    },
    h2: ({ children, ...props }: { children: ReactNode }) => {
      const text = String(children)
      const id = slugify(text)
      return (
        <h2
          id={id}
          className="mt-10 scroll-m-20 border-b pb-2 text-2xl font-semibold tracking-tight first:mt-0"
          {...props}
        >
          {children}
        </h2>
      )
    },
    h3: ({ children, ...props }: { children: ReactNode }) => {
      const text = String(children)
      const id = slugify(text)
      return (
        <h3
          id={id}
          className="mt-8 scroll-m-20 text-xl font-semibold tracking-tight"
          {...props}
        >
          {children}
        </h3>
      )
    },
    p: ({ children, ...props }: { children: ReactNode }) => (
      <p className="leading-7 [&:not(:first-child)]:mt-6" {...props}>
        {children}
      </p>
    ),
    ul: ({ children, ...props }: { children: ReactNode }) => (
      <ul className="my-6 ml-6 list-disc" {...props}>
        {children}
      </ul>
    ),
    ol: ({ children, ...props }: { children: ReactNode }) => (
      <ol className="my-6 ml-6 list-decimal" {...props}>
        {children}
      </ol>
    ),
    li: ({ children, ...props }: { children: ReactNode }) => (
      <li className="mt-2" {...props}>
        {children}
      </li>
    ),
    a: ({ children, ...props }: { children: ReactNode }) => (
      <a
        className="font-medium text-primary underline-offset-4 hover:underline"
        {...props}
      >
        {children}
      </a>
    ),
    code: ({ inline, className, children, ...props }: CodeProps) => {
      if (inline) {
        return (
          <code
            className="rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm"
            {...props}
          >
            {children}
          </code>
        )
      }

      return <CodeBlock className={className} {...props}>{children}</CodeBlock>
    },
  }

  return (
    <div className="prose max-w-none prose-slate dark:prose-invert">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components as any}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

