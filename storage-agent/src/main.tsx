import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { BackendGate } from "./components/BackendGate"
import { ThemeProvider } from "./components/theme-provider"
import { Toaster } from "./components/ui/sonner"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <BackendGate>
        <App />
        <Toaster />
      </BackendGate>
    </ThemeProvider>
  </StrictMode>,
)
