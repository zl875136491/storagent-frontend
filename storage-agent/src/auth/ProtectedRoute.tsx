import { Navigate, Outlet, useLocation } from "react-router-dom"
import { BrandLoading } from "@/components/BrandLoading"
import { useAuth } from "./AuthContext"

export default function ProtectedRoute() {
  const { accessToken, initializing } = useAuth()
  const location = useLocation()

  if (initializing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <BrandLoading label="正在加载用户信息..." iconClassName="h-12 w-12" />
      </div>
    )
  }

  if (!accessToken) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}
