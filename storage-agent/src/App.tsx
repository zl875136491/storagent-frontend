import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom"
import { AuthProvider } from "./auth/AuthContext"
import { NavigationLeaveBlockProvider } from "./contexts/NavigationLeaveBlockContext"
import ProtectedRoute from "./auth/ProtectedRoute"
import AppLayout from "./layouts/AppLayout"
import LoginPage from "./pages/LoginPage"
import LoginByCodePage from "./pages/LoginByCodePage"
import OAPasswordRequestPage from "./pages/OAPasswordRequestPage"
import RegionPage from "./pages/data/RegionPage"
import MinioPage from "./pages/data/MinioPage"
import APIKeyPage from "./pages/data/APIKeyPage"
import ApplicationPage from "./pages/data/ApplicationPage"
import BucketPage from "./pages/data/BucketPage"
import StorageBucketManagePage from "./pages/data/StorageBucketManagePage"
import DocsPage from "./pages/docs/DocsPage"
import UserRolePage from "./pages/admin/UserRolePage"
import UsagePage from "./pages/admin/UsagePage"
import AuditLogPage from "./pages/admin/AuditLogPage"
import StorageOperationsPage from "./pages/admin/StorageOperationsPage"
import ServiceOperationsPage from "./pages/admin/ServiceOperationsPage"

const legacyDocsSlugs: Record<string, string> = {
  "usage-overview": "overview",
  "developer-usage": "overview",
  "getting-started": "quick-start",
  "api-guide": "api-guide",
  components: "components",
  "file-components": "components",
}

// Keep links generated before the path-based document navigation available.
function LegacyDocsRedirect() {
  const location = useLocation()
  const searchParams = new URLSearchParams(location.search)
  const slug = legacyDocsSlugs[searchParams.get("doc") ?? ""] ?? "overview"
  searchParams.delete("doc")
  const search = searchParams.toString()

  return <Navigate to={`/docs/${slug}${search ? `?${search}` : ""}`} replace />
}

// AI configuration and assistant routes are intentionally not registered.
// Their source remains under pages/admin and features/ai for a later re-enable.

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <NavigationLeaveBlockProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<OAPasswordRequestPage mode="register" />} />
          <Route path="/forgot-password" element={<OAPasswordRequestPage mode="reset" />} />
          <Route path="/login_by_code" element={<LoginByCodePage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route index element={<Navigate to="/docs/overview" replace />} />
              <Route path="data">
                <Route path="basic">
                  <Route path="region" element={<RegionPage />} />
                  <Route path="application" element={<ApplicationPage />} />
                  <Route path="api-key" element={<APIKeyPage />} />
                </Route>
                <Route path="minio" element={<MinioPage />} />
                <Route path="storage">
                  <Route path="buckets">
                    <Route index element={<Navigate to="treemap" replace />} />
                    <Route path="treemap" element={<BucketPage view="treemap" />} />
                    <Route path="files" element={<BucketPage view="files" />} />
                  </Route>
                  <Route path="bucket-manage" element={<StorageBucketManagePage />} />
                </Route>
              </Route>
              <Route path="docs">
                <Route index element={<LegacyDocsRedirect />} />
                <Route path="overview" element={<DocsPage section="overview" />} />
                <Route path="quick-start" element={<DocsPage section="quick-start" />} />
                <Route path="api-guide" element={<DocsPage section="api-guide" />} />
                <Route path="components" element={<DocsPage section="components" />} />
              </Route>
              <Route path="admin/users" element={<UserRolePage />} />
              <Route path="admin/usage" element={<UsagePage />} />
              <Route path="admin/audit" element={<AuditLogPage />} />
              <Route path="admin/storage-operations">
                <Route index element={<Navigate to="replication" replace />} />
                <Route path="replication" element={<StorageOperationsPage view="replication" />} />
                <Route path="clusters" element={<StorageOperationsPage view="clusters" />} />
              </Route>
              <Route path="admin/service-operations">
                <Route index element={<Navigate to="verification" replace />} />
                <Route path="verification" element={<ServiceOperationsPage view="verification" />} />
                <Route path="diagnostics" element={<ServiceOperationsPage view="diagnostics" />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/docs/overview" replace />} />
        </Routes>
        </NavigationLeaveBlockProvider>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
