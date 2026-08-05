import type { UserProfile } from "../api/client"

export const PERMISSIONS = {
  applicationManage: "application_manage",
  applicationQuotaManage: "application_quota_manage",
  regionManage: "region_manage",
  storageOperationsManage: "storage_operations_manage",
  userManage: "user_manage",
} as const

export function hasPermission(
  user: UserProfile | null | undefined,
  permission: string,
): boolean {
  return user?.is_admin === true || Boolean(user?.permissions?.includes(permission))
}
