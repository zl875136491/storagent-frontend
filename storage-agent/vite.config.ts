import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function parseServerListFromApiConfig(raw: string): string[] {
  const block = raw.match(/server_list\s*=\s*\[([\s\S]*?)\]/)
  if (!block) return []
  const inner = block[1]
  const urls: string[] = []
  for (const m of inner.matchAll(/"([^"]+)"/g)) {
    urls.push(m[1])
  }
  return urls
}

function normalizeEnvironmentServerList(values: unknown[]): string[] {
  if (values.length === 0) {
    throw new Error("STORAGENT_API_SERVERS must contain at least one URL")
  }

  const urls = values.map((value) => {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error("STORAGENT_API_SERVERS entries must be non-empty strings")
    }

    const url = value.trim()
    if (!/^https?:\/\//i.test(url) && !/^\/server\/[a-z0-9-]+$/i.test(url)) {
      throw new Error(`STORAGENT_API_SERVERS entry must use http(s) or a /server/{region} gateway path: ${url}`)
    }
    return url
  })

  return [...new Set(urls)]
}

function parseServerListFromEnvironment(raw: string | undefined): string[] | null {
  const value = raw?.trim()
  if (!value) return null

  if (value.startsWith("[")) {
    let parsed: unknown
    try {
      parsed = JSON.parse(value)
    } catch {
      throw new Error("STORAGENT_API_SERVERS is not a valid JSON array")
    }

    if (!Array.isArray(parsed)) {
      throw new Error("STORAGENT_API_SERVERS JSON value must be an array")
    }
    return normalizeEnvironmentServerList(parsed)
  }

  return normalizeEnvironmentServerList(value.split(","))
}

function loadServerList(): string[] {
  const environmentServers = parseServerListFromEnvironment(
    process.env.STORAGENT_API_SERVERS,
  )
  if (environmentServers) return environmentServers

  const configPath = path.resolve(__dirname, "../api.config")
  try {
    const raw = fs.readFileSync(configPath, "utf-8")
    return parseServerListFromApiConfig(raw)
  } catch {
    return []
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __SERVER_LIST__: JSON.stringify(loadServerList()),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
