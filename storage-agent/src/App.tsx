import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
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
              <Route index element={<Navigate to="/docs" replace />} />
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
              <Route path="admin/users" element={<UserRolePage />} />
              <Route path="admin/usage" element={<UsagePage />} />
              <Route path="admin/audit" element={<AuditLogPage />} />
              <Route path="admin/storage-operations" element={<StorageOperationsPage />} />
              <Route path="admin/service-operations" element={<ServiceOperationsPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/docs" replace />} />
        </Routes>
        </NavigationLeaveBlockProvider>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
