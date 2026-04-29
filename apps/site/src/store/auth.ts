'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import React from 'react'

interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  role: string
}

interface AuthState {
  user: User | null
  accessToken: string | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || 'Login failed')
    setUser(data.user)
    setAccessToken(data.accessToken)
    if (typeof window !== 'undefined') {
      localStorage.setItem('accessToken', data.accessToken)
      document.cookie = `auth-token=${data.accessToken}; path=/; max-age=86400`
    }
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    setAccessToken(null)
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accessToken')
      document.cookie = 'auth-token=; path=/; max-age=0'
    }
  }, [])

  return React.createElement(
    AuthContext.Provider,
    { value: { user, accessToken, isAuthenticated: !!user, login, logout } },
    children
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
