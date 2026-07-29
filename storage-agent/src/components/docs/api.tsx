import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { DocCodeBlock } from "./code"
import { DocHeading, DocP } from "./primitives"

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH"

const methodClass: Record<HttpMethod, string> = {
  GET: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
  POST: "bg-sky-500/15 text-sky-900 dark:text-sky-200",
  PUT: "bg-amber-500/15 text-amber-900 dark:text-amber-100",
  PATCH: "bg-amber-500/15 text-amber-900 dark:text-amber-100",
  DELETE: "bg-rose-500/15 text-rose-800 dark:text-rose-200",
}

export function MethodBadge({ method }: { method: HttpMethod }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-[3.25rem] items-center justify-center rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wide",
        methodClass[method],
      )}
    >
      {method}
    </span>
  )
}

export function ApiEndpoint({
  id,
  method,
  path,
  summary,
  children,
}: {
  id: string
  method: HttpMethod
  path: string
  summary: string
  children?: ReactNode
}) {
  return (
    <section className="mt-10 scroll-m-24 border-t border-border/70 pt-8 first:mt-0 first:border-t-0 first:pt-0">
      <DocHeading id={id} level={2}>
        {summary}
      </DocHeading>
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border/80 bg-muted/30 px-3 py-2.5">
        <MethodBadge method={method} />
        <code className="font-mono text-xs text-foreground break-all">{path}</code>
      </div>
      {children}
    </section>
  )
}

export function ApiParamTable({
  title,
  rows,
}: {
  title: string
  rows: Array<{
    name: string
    type?: string
    required?: boolean
    description: ReactNode
  }>
}) {
  return (
    <div className="mt-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <div className="mt-2 overflow-hidden rounded-xl border border-border/70">
        <table className="w-full text-left text-xs">
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-b border-border/50 last:border-b-0">
                <td className="w-[34%] align-top px-3 py-2.5">
                  <div className="font-mono text-[11px] font-medium text-foreground">{row.name}</div>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {row.type ? (
                      <span className="text-[10px] text-muted-foreground">{row.type}</span>
                    ) : null}
                    {row.required ? (
                      <span className="text-[10px] font-medium text-rose-600 dark:text-rose-300">required</span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">optional</span>
                    )}
                  </div>
                </td>
                <td className="align-top px-3 py-2.5 text-muted-foreground leading-relaxed">{row.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function ApiExamples({
  request,
  response,
  requestTitle = "Example",
  responseTitle = "Response",
}: {
  request: string
  response?: string
  requestTitle?: string
  responseTitle?: string
}) {
  return (
    <div className="space-y-3">
      <DocCodeBlock code={request} language="bash" title={requestTitle} />
      {response ? <DocCodeBlock code={response} language="json" title={responseTitle} /> : null}
    </div>
  )
}

export function ApiIntro({ children }: { children: ReactNode }) {
  return <DocP>{children}</DocP>
}
