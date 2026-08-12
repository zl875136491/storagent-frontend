import { useEffect, useMemo, useState } from "react"
import { Navigate } from "react-router-dom"
import { Users } from "lucide-react"

import {
  fetchAdminUsersApi,
  updateUserRoleApi,
  type AdminUserItem,
} from "../../api/client"
import { showSuccessToast } from "../../api/toast"
import { useAuth } from "../../auth/AuthContext"
import { hasPermission, PERMISSIONS } from "../../auth/permissions"
import { Modal } from "../../components/Modal"
import { Button } from "../../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card"
import { DialogFooter } from "../../components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table"
import { cn } from "../../lib/utils"
import { BrandLoading } from "../../components/BrandLoading"

const BASE_ROLE = "用户"
const ROLE_ORDER = [BASE_ROLE, "应用管理员", "运维管理员", "用户管理员", "管理员"] as const

const ROLE_OPTIONS = [
  {
    name: "应用管理员",
    description: "审批应用授权并调整应用存储配额",
  },
  {
    name: "运维管理员",
    description: "管理复制运维、集群健康和应急文件操作",
  },
  {
    name: "用户管理员",
    description: "查看用户并分配专项角色",
  },
  {
    name: "管理员",
    description: "系统超级管理员，拥有全部权限",
  },
] as const

function roleNames(item: AdminUserItem): string[] {
  const names = item.roles?.map((role) => role.name).filter(Boolean) ?? []
  const unique = [...new Set(names.length > 0 ? names : item.role_name ? [item.role_name] : [BASE_ROLE])]
  return unique.sort((left, right) => {
    const leftIndex = ROLE_ORDER.indexOf(left as typeof ROLE_ORDER[number])
    const rightIndex = ROLE_ORDER.indexOf(right as typeof ROLE_ORDER[number])
    return (leftIndex < 0 ? ROLE_ORDER.length : leftIndex) - (rightIndex < 0 ? ROLE_ORDER.length : rightIndex) || left.localeCompare(right, "zh-CN")
  })
}

function roleBadge(name: string) {
  return (
    <span
      key={name}
      className="inline-flex items-center rounded border border-border/70 bg-muted/40 px-2 py-1 text-[10px] font-medium text-muted-foreground"
    >
      {name}
    </span>
  )
}

export default function UserRolePage() {
  const { accessToken, user, refreshSession } = useAuth()
  const canManageUsers = hasPermission(user, PERMISSIONS.userManage)
  const [users, setUsers] = useState<AdminUserItem[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<AdminUserItem | null>(null)
  const [selectedRoles, setSelectedRoles] = useState<string[]>([BASE_ROLE])

  const visibleRoleOptions = useMemo(
    () => ROLE_OPTIONS.filter((role) => role.name !== "管理员" || user?.is_admin),
    [user?.is_admin],
  )

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
    if (!canManageUsers) return
    void loadUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, canManageUsers])

  if (!canManageUsers) {
    return <Navigate to="/data/basic/region" replace />
  }

  const openEditor = (item: AdminUserItem) => {
    setEditing(item)
    setSelectedRoles([...new Set([BASE_ROLE, ...roleNames(item)])])
  }

  const toggleRole = (role: string) => {
    if (role === BASE_ROLE) return
    setSelectedRoles((previous) => (
      previous.includes(role)
        ? previous.filter((item) => item !== role)
        : [...previous, role]
    ))
  }

  const saveRoles = async () => {
    if (!editing) return
    const updatingCurrentUser = editing.id === user?.id
    setSavingId(editing.id)
    try {
      const updated = await updateUserRoleApi(
        editing.id,
        [...new Set([BASE_ROLE, ...selectedRoles])],
        accessToken ?? undefined,
      )
      setUsers((previous) => previous.map((item) => (
        item.id === updated.id ? { ...item, ...updated } : item
      )))
      setEditing(null)
      showSuccessToast(`已更新 ${editing.username} 的角色`)
      if (updatingCurrentUser) {
        await refreshSession()
      }
    } catch {
      // toast 已由 client 处理
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-foreground">角色管理</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          每位用户保留基础用户角色，并可叠加应用、运维或用户管理能力。
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" aria-hidden />
            用户与角色
          </CardTitle>
          <CardDescription>角色变更会同步到全部区域并在下一次鉴权时立即生效。</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <BrandLoading label="正在加载用户..." className="min-h-[180px]" compact />
          ) : users.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/70 px-4 py-10 text-center text-xs text-muted-foreground">
              暂无可管理用户
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[680px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>用户名</TableHead>
                    <TableHead>显示名</TableHead>
                    <TableHead>角色</TableHead>
                    <TableHead className="w-24 text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium text-foreground">{item.username}</TableCell>
                      <TableCell className="text-muted-foreground">{item.name || "-"}</TableCell>
                      <TableCell>
                        <div className="flex max-w-xl flex-wrap gap-1.5">
                          {roleNames(item).map(roleBadge)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button type="button" size="sm" variant="outline" onClick={() => openEditor(item)}>
                          管理角色
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {editing ? (
        <Modal title="管理用户角色" onClose={() => !savingId && setEditing(null)}>
          <div className="space-y-4 p-1">
            <div className="text-sm font-medium text-foreground">{editing.name || editing.username}</div>
            <div className="space-y-2">
              <label className="flex cursor-not-allowed items-start gap-3 rounded-md border border-border/70 bg-muted/30 p-3 opacity-80">
                <input type="checkbox" checked readOnly disabled className="mt-0.5 h-4 w-4" />
                <span>
                  <span className="block text-xs font-medium text-foreground">基础用户</span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">登录、查看区域及管理本人应用和 APIKey</span>
                </span>
              </label>
              {visibleRoleOptions.map((role) => {
                const checked = selectedRoles.includes(role.name)
                const selfElevationBlocked = (
                  !user?.is_admin
                  && editing.id === user?.id
                  && !roleNames(editing).includes(role.name)
                )
                return (
                  <label
                    key={role.name}
                    className={cn(
                      "flex items-start gap-3 rounded-md border p-3 transition-colors",
                      selfElevationBlocked ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                      checked ? "border-primary/40 bg-primary/5" : "border-border/70 hover:bg-muted/40",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-primary"
                      checked={checked}
                      disabled={savingId === editing.id || selfElevationBlocked}
                      onChange={() => toggleRole(role.name)}
                    />
                    <span>
                      <span className="block text-xs font-medium text-foreground">{role.name}</span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">{role.description}</span>
                      {selfElevationBlocked ? (
                        <span className="mt-1 block text-[10px] text-muted-foreground">不能为自己新增系统角色</span>
                      ) : null}
                    </span>
                  </label>
                )
              })}
            </div>
            <DialogFooter>
              <Button type="button" size="sm" variant="outline" disabled={Boolean(savingId)} onClick={() => setEditing(null)}>
                取消
              </Button>
              <Button type="button" size="sm" disabled={Boolean(savingId)} onClick={() => void saveRoles()}>
                保存角色
              </Button>
            </DialogFooter>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
