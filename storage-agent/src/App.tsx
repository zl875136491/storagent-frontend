import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { AuthProvider } from "./auth/AuthContext"
import { NavigationLeaveBlockProvider } from "./contexts/NavigationLeaveBlockContext"
import ProtectedRoute from "./auth/ProtectedRoute"
import AppLayout from "./layouts/AppLayout"
import LoginPage from "./pages/LoginPage"
import RegionPage from "./pages/data/RegionPage"
import MinioPage from "./pages/data/MinioPage"
import APIKeyPage from "./pages/data/APIKeyPage"
import ApplicationPage from "./pages/data/ApplicationPage"
import BucketPage from "./pages/data/BucketPage"
import StorageBucketManagePage from "./pages/data/StorageBucketManagePage"
import DocsPage from "./pages/docs/DocsPage"
import AIConfigPage from "./pages/admin/AIConfigPage"

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <NavigationLeaveBlockProvider>
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
                  <Route path="bucket-manage" element={<StorageBucketManagePage />} />
                </Route>
              </Route>
              <Route path="docs" element={<DocsPage />} />
              <Route path="admin/ai" element={<AIConfigPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/data/basic/region" replace />} />
        </Routes>
        </NavigationLeaveBlockProvider>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
