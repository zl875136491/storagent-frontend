import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  fetchProfileApi,
  loginApi,
  logoutApi,
  refreshTokenApi,
  type LoginRequest,
  type TokenResponse,
  type UserProfile,
} from "../api/client"

const ACCESS_TOKEN_KEY = "cross_storage_access_token"
const REFRESH_TOKEN_KEY = "cross_storage_refresh_token"

interface AuthContextValue {
  accessToken: string | null
  refreshToken: string | null
  user: UserProfile | null
  initializing: boolean
  login: (payload: LoginRequest) => Promise<void>
  logout: () => Promise<void>
  /** 使用 refresh_token 换取新 token；失败则清空登录态 */
  refreshSession: () => Promise<boolean>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function persistTokens(tokens: TokenResponse) {
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token)
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState<string | null>(null)
  const [user, setUser] = useState<UserProfile | null>(null)
  const [initializing, setInitializing] = useState(true)
  const refreshTokenRef = useRef<string | null>(null)
  const refreshingRef = useRef<Promise<boolean> | null>(null)

  useEffect(() => {
    refreshTokenRef.current = refreshToken
  }, [refreshToken])

  const clearAuthState = useCallback(() => {
    setAccessToken(null)
    setRefreshToken(null)
    setUser(null)
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
  }, [])

  const applyTokens = useCallback(async (tokens: TokenResponse) => {
    setAccessToken(tokens.access_token)
    setRefreshToken(tokens.refresh_token)
    persistTokens(tokens)
    const profile = await fetchProfileApi(tokens.access_token)
    setUser(profile)
  }, [])

  const refreshSession = useCallback(async (): Promise<boolean> => {
    if (refreshingRef.current) {
      return refreshingRef.current
    }
    const rt = refreshTokenRef.current ?? localStorage.getItem(REFRESH_TOKEN_KEY)
    if (!rt) {
      clearAuthState()
      return false
    }
    const job = (async () => {
      try {
        const tokens = await refreshTokenApi(rt)
        await applyTokens(tokens)
        return true
      } catch {
        clearAuthState()
        return false
      } finally {
        refreshingRef.current = null
      }
    })()
    refreshingRef.current = job
    return job
  }, [applyTokens, clearAuthState])

  useEffect(() => {
    const storedAccessToken = localStorage.getItem(ACCESS_TOKEN_KEY)
    const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)

    if (!storedAccessToken && !storedRefreshToken) {
      setInitializing(false)
      return
    }

    if (storedAccessToken) {
      setAccessToken(storedAccessToken)
    }
    if (storedRefreshToken) {
      setRefreshToken(storedRefreshToken)
      refreshTokenRef.current = storedRefreshToken
    }

    const bootstrap = async () => {
      if (storedAccessToken) {
        try {
          const profile = await fetchProfileApi(storedAccessToken)
          setUser(profile)
          return
        } catch {
          // access 失效则尝试 refresh
        }
      }
      if (storedRefreshToken) {
        const ok = await refreshSession()
        if (!ok) clearAuthState()
        return
      }
      clearAuthState()
    }

    void bootstrap().finally(() => setInitializing(false))
  }, [clearAuthState, refreshSession])

  const login = useCallback(
    async (payload: LoginRequest) => {
      const tokens = await loginApi(payload)
      await applyTokens(tokens)
    },
    [applyTokens],
  )

  const logout = useCallback(async () => {
    if (accessToken) {
      await logoutApi(accessToken)
    }
    clearAuthState()
  }, [accessToken, clearAuthState])

  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken,
      refreshToken,
      user,
      initializing,
      login,
      logout,
      refreshSession,
    }),
    [accessToken, refreshToken, user, initializing, login, logout, refreshSession],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error("useAuth 必须在 AuthProvider 中使用")
  }
  return ctx
}
