import { lazy, Suspense, type ReactNode } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { NavigationLeaveBlockProvider } from "./contexts/NavigationLeaveBlockContext";
import ProtectedRoute from "./auth/ProtectedRoute";
import AppLayout from "./layouts/AppLayout";
import { BrandLoading } from "./components/BrandLoading";
import LoginPage from "./pages/LoginPage";
import LoginByCodePage from "./pages/LoginByCodePage";
import OAPasswordRequestPage from "./pages/OAPasswordRequestPage";
import NotFoundPage from "./pages/NotFoundPage";

// 数据/管理/文档页体积较大（含 echarts、代码高亮、图表库），按路由懒加载，
// 避免登录页与首屏一次性下载全部代码。
const RegionPage = lazy(() => import("./pages/data/RegionPage"));
const MinioPage = lazy(() => import("./pages/data/MinioPage"));
const APIKeyPage = lazy(() => import("./pages/data/APIKeyPage"));
const ApplicationPage = lazy(() => import("./pages/data/ApplicationPage"));
const BucketPage = lazy(() => import("./pages/data/BucketPage"));
const StorageBucketManagePage = lazy(() => import("./pages/data/StorageBucketManagePage"));
const DocsPage = lazy(() => import("./pages/docs/DocsPage"));
const UserRolePage = lazy(() => import("./pages/admin/UserRolePage"));
const UsagePage = lazy(() => import("./pages/admin/UsagePage"));
const AuditLogPage = lazy(() => import("./pages/admin/AuditLogPage"));
const StorageOperationsPage = lazy(() => import("./pages/admin/StorageOperationsPage"));
const ServiceOperationsPage = lazy(() => import("./pages/admin/ServiceOperationsPage"));
const EtcdOperationsPage = lazy(() => import("./pages/admin/EtcdOperationsPage"));

/** 懒加载页面的统一加载占位；AppLayout 保持挂载，仅内容区显示加载态 */
function lazyElement(node: ReactNode): ReactNode {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center p-6">
          <BrandLoading compact label="正在加载页面..." />
        </div>
      }
    >
      {node}
    </Suspense>
  );
}

const legacyDocsSlugs: Record<string, string> = {
  "usage-overview": "overview",
  "developer-usage": "overview",
  "getting-started": "quick-start",
  "api-guide": "api-guide",
  components: "components",
  "file-components": "components",
};

// Keep links generated before the path-based document navigation available.
function LegacyDocsRedirect() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const slug = legacyDocsSlugs[searchParams.get("doc") ?? ""] ?? "overview";
  searchParams.delete("doc");
  const search = searchParams.toString();

  return <Navigate to={`/docs/${slug}${search ? `?${search}` : ""}`} replace />;
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
            <Route
              path="/register"
              element={<OAPasswordRequestPage mode="register" />}
            />
            <Route
              path="/forgot-password"
              element={<OAPasswordRequestPage mode="reset" />}
            />
            <Route path="/login_by_code" element={<LoginByCodePage />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route
                  index
                  element={<Navigate to="/docs/overview" replace />}
                />
                <Route path="data">
                  <Route path="basic">
                    <Route path="region" element={lazyElement(<RegionPage />)} />
                    <Route path="application" element={lazyElement(<ApplicationPage />)} />
                    <Route path="api-key" element={lazyElement(<APIKeyPage />)} />
                  </Route>
                  <Route path="minio" element={lazyElement(<MinioPage />)} />
                  <Route path="storage">
                    <Route path="buckets">
                      <Route
                        index
                        element={<Navigate to="treemap" replace />}
                      />
                      <Route
                        path="treemap"
                        element={lazyElement(<BucketPage view="treemap" />)}
                      />
                      <Route
                        path="files"
                        element={lazyElement(<BucketPage view="files" />)}
                      />
                    </Route>
                    <Route
                      path="bucket-manage"
                      element={lazyElement(<StorageBucketManagePage />)}
                    />
                  </Route>
                </Route>
                <Route path="docs">
                  <Route index element={<LegacyDocsRedirect />} />
                  <Route
                    path="overview"
                    element={lazyElement(<DocsPage section="overview" />)}
                  />
                  <Route
                    path="quick-start"
                    element={lazyElement(<DocsPage section="quick-start" />)}
                  />
                  <Route
                    path="api-guide"
                    element={lazyElement(<DocsPage section="api-guide" />)}
                  />
                  <Route
                    path="components"
                    element={lazyElement(<DocsPage section="components" />)}
                  />
                </Route>
                <Route path="admin/users" element={lazyElement(<UserRolePage />)} />
                <Route path="admin/usage" element={lazyElement(<UsagePage />)} />
                <Route path="admin/audit" element={lazyElement(<AuditLogPage />)} />
                <Route path="admin/storage-operations">
                  <Route
                    index
                    element={<Navigate to="replication" replace />}
                  />
                  <Route
                    path="replication"
                    element={lazyElement(<StorageOperationsPage view="replication" />)}
                  />
                  <Route
                    path="clusters"
                    element={lazyElement(<StorageOperationsPage view="clusters" />)}
                  />
                </Route>
                <Route path="admin/service-operations">
                  <Route
                    index
                    element={<Navigate to="verification" replace />}
                  />
                  <Route
                    path="verification"
                    element={lazyElement(<ServiceOperationsPage view="verification" />)}
                  />
                  <Route
                    path="diagnostics"
                    element={lazyElement(<ServiceOperationsPage view="diagnostics" />)}
                  />
                </Route>
                <Route path="admin/etcd-operations">
                  <Route index element={<Navigate to="status" replace />} />
                  <Route
                    path="status"
                    element={lazyElement(<EtcdOperationsPage view="status" />)}
                  />
                  <Route path="maintenance">
                    <Route index element={<Navigate to="trend" replace />} />
                    <Route
                      path="trend"
                      element={lazyElement(<EtcdOperationsPage view="trend" />)}
                    />
                    <Route
                      path="operations"
                      element={lazyElement(<EtcdOperationsPage view="operations" />)}
                    />
                    <Route
                      path="tasks"
                      element={lazyElement(<EtcdOperationsPage view="tasks" />)}
                    />
                    <Route
                      path="events"
                      element={lazyElement(<EtcdOperationsPage view="events" />)}
                    />
                  </Route>
                </Route>
                <Route
                  path="admin/sync-storage-operations"
                  element={
                    <Navigate to="/admin/etcd-operations/status" replace />
                  }
                />
              </Route>
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </NavigationLeaveBlockProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
