import { Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import useAuthStore from '../store/authStore'

interface PrivateRouteProps {
  children: React.ReactNode
}

export default function PrivateRoute({ children }: PrivateRouteProps) {
  const { isAuthenticated, loadFromStorage } = useAuthStore()

  useEffect(() => {
    loadFromStorage()
  }, [loadFromStorage])

  const token = localStorage.getItem('accessToken')

  if (!isAuthenticated && !token) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
