import { create } from 'zustand'
import api from '../lib/api'

interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  role: string
  tenantId: string
}

interface AuthState {
  user: User | null
  accessToken: string | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  register: (data: {
    email: string
    password: string
    firstName: string
    lastName: string
    orgName: string
  }) => Promise<void>
  logout: () => void
  refreshToken: () => Promise<void>
  loadFromStorage: () => void
}

const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,

  loadFromStorage: () => {
    const token = localStorage.getItem('accessToken')
    const userRaw = localStorage.getItem('user')
    if (token && userRaw) {
      try {
        const user = JSON.parse(userRaw) as User
        set({ user, accessToken: token, isAuthenticated: true })
      } catch {
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        localStorage.removeItem('user')
      }
    }
  },

  login: async (email, password) => {
    const { data } = await api.post('/api/v1/auth/login', { email, password })
    localStorage.setItem('accessToken', data.accessToken)
    localStorage.setItem('refreshToken', data.refreshToken)
    localStorage.setItem('user', JSON.stringify(data.user))
    set({ user: data.user, accessToken: data.accessToken, isAuthenticated: true })
  },

  register: async (registerData) => {
    const { data } = await api.post('/api/v1/auth/register', registerData)
    localStorage.setItem('accessToken', data.accessToken)
    localStorage.setItem('refreshToken', data.refreshToken)
    localStorage.setItem('user', JSON.stringify(data.user))
    set({ user: data.user, accessToken: data.accessToken, isAuthenticated: true })
  },

  logout: () => {
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('user')
    set({ user: null, accessToken: null, isAuthenticated: false })
    window.location.href = '/login'
  },

  refreshToken: async () => {
    const refreshToken = localStorage.getItem('refreshToken')
    if (!refreshToken) throw new Error('No refresh token')
    const { data } = await api.post('/api/v1/auth/refresh', { refreshToken })
    localStorage.setItem('accessToken', data.accessToken)
    if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken)
    set({ accessToken: data.accessToken })
  },
}))

export default useAuthStore
