import { useEffect, useState } from "react"
import { Navigate } from "react-router-dom"
import { Shield, Users } from "lucide-react"

import {
  fetchAdminUsersApi,
  updateUserRoleApi,
  type AdminUserItem,
} from "../../api/client"
import { showSuccessToast } from "../../api/toast"
import { useAuth } from "../../auth/AuthContext"
import { Button } from "../../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card"

type RoleName = "用户" | "管理员"

export default function UserRolePage() {
  const { accessToken, user } = useAuth()
  const [users, setUsers] = useState<AdminUserItem[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  const loadUsers = async () => {
    setLoading(true)
    try {
      const resp = await fetchAdminUsersApi(accessToken ?? undefined)
      setUsers(resp.data)
    } catch {
      // toast 已由 client 处理
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!user?.is_admin) return
    void loadUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, user?.is_admin])

  if (!user?.is_admin) {
    return <Navigate to="/data/basic/region" replace />
  }

  const setRole = async (item: AdminUserItem, role: RoleName) => {
    if (item.role_name === role) return
    setSavingId(item.id)
    try {
      const updated = await updateUserRoleApi(item.id, role, accessToken ?? undefined)
      setUsers((prev) =>
        prev.map((row) =>
          row.id === item.id
            ? {
                ...row,
                is_admin: updated.is_admin,
                role_name: updated.role_name,
              }
            : row,
        ),
      )
      showSuccessToast(`已将 ${item.username} 设为「${role}」`)
    } catch {
      // toast 已由 client 处理
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-foreground">角色管理</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          为系统中已存在的用户分配「用户」或「管理员」角色。管理员拥有系统管理、复制拓扑编辑、吊销他人
          APIKey 等能力。
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" aria-hidden />
            用户列表
          </CardTitle>
          <CardDescription>角色变更立即生效；不能取消系统中唯一的管理员。</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex min-h-[160px] items-center justify-center text-xs text-muted-foreground">
              正在加载用户...
            </div>
          ) : users.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/70 px-4 py-10 text-center text-xs text-muted-foreground">
              暂无可管理用户
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-border/70 text-muted-foreground">
                    <th className="px-2 py-2 font-medium">用户名</th>
                    <th className="px-2 py-2 font-medium">显示名</th>
                    <th className="px-2 py-2 font-medium">当前角色</th>
                    <th className="px-2 py-2 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((item) => (
                    <tr key={item.id} className="border-b border-border/40">
                      <td className="px-2 py-3 font-medium text-foreground">{item.username}</td>
                      <td className="px-2 py-3 text-muted-foreground">{item.name || "—"}</td>
                      <td className="px-2 py-3">
                        <span
                          className={
                            item.is_admin
                              ? "inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-100"
                              : "inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                          }
                        >
                          {item.is_admin ? <Shield className="h-3 w-3" aria-hidden /> : null}
                          {item.role_name}
                        </span>
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={item.role_name === "用户" ? "default" : "outline"}
                            disabled={savingId === item.id || item.role_name === "用户"}
                            onClick={() => void setRole(item, "用户")}
                          >
                            设为用户
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={item.role_name === "管理员" ? "default" : "outline"}
                            disabled={savingId === item.id || item.role_name === "管理员"}
                            onClick={() => void setRole(item, "管理员")}
                          >
                            设为管理员
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
