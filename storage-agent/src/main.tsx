import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { BackendGate } from "./components/BackendGate"
import { ErrorBoundary } from "./components/ErrorBoundary"
import { ThemeProvider } from "./components/theme-provider"
import { Toaster } from "./components/ui/sonner"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <ErrorBoundary>
        <BackendGate>
          <App />
          <Toaster />
        </BackendGate>
      </ErrorBoundary>
    </ThemeProvider>
  </StrictMode>,
)
