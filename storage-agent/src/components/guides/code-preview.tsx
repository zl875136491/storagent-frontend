import { useMemo, useState } from "react"
import { copyTextToClipboard } from "@/lib/copy-to-clipboard"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import hljs from "highlight.js"

type Props = {
  title: string
  installCommands?: Record<"npm" | "pnpm" | "yarn" | "npx", string>
  code: string
  defaultOpen?: boolean
  previewLines?: number
  codeLanguage?: string
}

type PackageManager = "npm" | "pnpm" | "yarn" | "npx"

function isPackageManager(value: string): value is PackageManager {
  return value === "npm" || value === "pnpm" || value === "yarn" || value === "npx"
}

function takeFirstLines(text: string, n: number) {
  const lines = text.split("\n")
  return lines.slice(0, Math.max(1, n)).join("\n") + (lines.length > n ? "\n" : "")
}

function normalizeHljsLanguage(lang?: string) {
  const l = (lang ?? "").trim().toLowerCase()
  if (!l) return ""
  // 常见别名归一化：让业务侧按“代码类型”传入也能稳定命中 hljs
  if (l === "js" || l === "mjs" || l === "cjs") return "javascript"
  if (l === "ts") return "typescript"
  if (l === "jsx") return "javascript"
  if (l === "tsx") return "typescript"
  if (l === "shell" || l === "sh" || l === "zsh") return "bash"
  return l
}

function highlightCode(src: string, language?: string) {
  const normalizedLang = normalizeHljsLanguage(language)
  const candidates = normalizedLang
    ? // 首选用户指定语言；如果被归一化为 typescript，则再尝试 tsx（部分 hljs 构建会包含该语法）
      Array.from(new Set([normalizedLang, normalizedLang === "typescript" ? "tsx" : ""])).filter(Boolean)
    : []

  for (const lang of candidates) {
    try {
      return hljs.highlight(src, { language: lang }).value
    } catch {
      // continue
    }
  }

  try {
    return hljs.highlightAuto(src, candidates).value
  } catch {
    return hljs.highlightAuto(src).value
  }
}

export function CodePreview({
  title,
  installCommands,
  code,
  defaultOpen,
  previewLines,
  codeLanguage,
}: Props) {
  const [open, setOpen] = useState(Boolean(defaultOpen))
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedInstall, setCopiedInstall] = useState(false)
  const [pm, setPm] = useState<PackageManager>("npx")

  const normalized = useMemo(() => code.trim() + "\n", [code])
  const normalizedInstall = useMemo(
    () => {
      if (!installCommands) return ""
      const cmd = installCommands[pm] ?? ""
      return cmd ? cmd.trim() + "\n" : ""
    },
    [installCommands, pm],
  )
  const preview = useMemo(
    () => takeFirstLines(normalized, previewLines ?? 14),
    [normalized, previewLines],
  )

  const highlightedInstall = useMemo(() => {
    if (!normalizedInstall) return ""
    return highlightCode(normalizedInstall, "bash")
  }, [normalizedInstall])

  const highlightedCodePreview = useMemo(() => {
    const src = open ? normalized : preview
    return highlightCode(src, codeLanguage)
  }, [codeLanguage, normalized, open, preview])

  const onCopyCode = async () => {
    const ok = await copyTextToClipboard(normalized)
    if (ok) {
      setCopiedCode(true)
      window.setTimeout(() => setCopiedCode(false), 1500)
    }
  }

  const onCopyInstall = async () => {
    if (!normalizedInstall) return
    const ok = await copyTextToClipboard(normalizedInstall)
    if (ok) {
      setCopiedInstall(true)
      window.setTimeout(() => setCopiedInstall(false), 1500)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? "收起代码" : "展开代码"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void onCopyCode()}>
            {copiedCode ? "已复制" : "复制代码"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {installCommands ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">安装依赖</div>
              <div className="flex items-center gap-2">
                <RadioGroup
                  value={pm}
                  onValueChange={(value) => {
                    if (isPackageManager(value)) setPm(value)
                  }}
                >
                  <RadioGroupItem value="npx">npx</RadioGroupItem>
                  <RadioGroupItem value="pnpm">pnpm</RadioGroupItem>
                  <RadioGroupItem value="yarn">yarn</RadioGroupItem>
                  <RadioGroupItem value="npm">npm</RadioGroupItem>
                </RadioGroup>
                <Button variant="outline" size="sm" onClick={() => void onCopyInstall()} disabled={!normalizedInstall}>
                  {copiedInstall ? "已复制" : "复制命令"}
                </Button>
              </div>
            </div>
            <pre className="overflow-x-auto rounded-md border bg-muted/30 p-3 text-sm">
              <code className="hljs" dangerouslySetInnerHTML={{ __html: highlightedInstall }} />
            </pre>
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="text-sm font-medium">代码</div>
          <div className="relative">
            <pre className="overflow-x-auto rounded-md border bg-muted/30 p-3 text-sm">
              <code className="hljs" dangerouslySetInnerHTML={{ __html: highlightedCodePreview }} />
            </pre>
            {!open ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background to-transparent" />
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
