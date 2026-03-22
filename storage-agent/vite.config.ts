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

function loadServerList(): string[] {
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
