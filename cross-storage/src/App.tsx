import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { AuthProvider } from "./auth/AuthContext"
import ProtectedRoute from "./auth/ProtectedRoute"
import AppLayout from "./layouts/AppLayout"
import LoginPage from "./pages/LoginPage"
import RegionPage from "./pages/data/RegionPage"
import MinioPage from "./pages/data/MinioPage"
import APIKeyPage from "./pages/data/APIKeyPage"
import ApplicationPage from "./pages/data/ApplicationPage"
import BucketPage from "./pages/data/BucketPage"
import DocsPage from "./pages/docs/DocsPage"

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route index element={<Navigate to="/data/basic/region" replace />} />
              <Route path="data">
                <Route path="basic">
                  <Route path="region" element={<RegionPage />} />
                  <Route path="application" element={<ApplicationPage />} />
                  <Route path="api-key" element={<APIKeyPage />} />
                </Route>
                <Route path="minio" element={<MinioPage />} />
                <Route path="storage">
                  <Route path="buckets" element={<BucketPage />} />
                </Route>
              </Route>
              <Route path="docs" element={<DocsPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/data/basic/region" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
