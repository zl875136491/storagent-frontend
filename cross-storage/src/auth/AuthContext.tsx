import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  fetchProfileApi,
  loginApi,
  logoutApi,
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
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState<string | null>(null)
  const [user, setUser] = useState<UserProfile | null>(null)
  const [initializing, setInitializing] = useState(true)

  const clearAuthState = useCallback(() => {
    setAccessToken(null)
    setRefreshToken(null)
    setUser(null)
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
  }, [])

  useEffect(() => {
    const storedAccessToken = localStorage.getItem(ACCESS_TOKEN_KEY)
    const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)

    if (!storedAccessToken) {
      setInitializing(false)
      return
    }

    setAccessToken(storedAccessToken)
    if (storedRefreshToken) {
      setRefreshToken(storedRefreshToken)
    }

    fetchProfileApi(storedAccessToken)
      .then((profile) => {
        setUser(profile)
      })
      .catch(() => {
        clearAuthState()
      })
      .finally(() => {
        setInitializing(false)
      })
  }, [clearAuthState])

  const login = useCallback(async (payload: LoginRequest) => {
    const tokens: TokenResponse = await loginApi(payload)
    setAccessToken(tokens.access_token)
    setRefreshToken(tokens.refresh_token)
    localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token)
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token)

    const profile = await fetchProfileApi(tokens.access_token)
    setUser(profile)
  }, [])

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
    }),
    [accessToken, refreshToken, user, initializing, login, logout],
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

