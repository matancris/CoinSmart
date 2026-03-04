import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores'
import { Spinner } from '@/components/ui'

export function AuthGuard() {
  const appUser = useAuthStore(s => s.appUser)
  const isLoading = useAuthStore(s => s.isLoading)
  const isInitialized = useAuthStore(s => s.isInitialized)
  const { initialize } = useAuthStore(s => s.actions)

  useEffect(() => {
    initialize()
  }, [initialize])

  if (!isInitialized || isLoading) {
    return <Spinner size="lg" fullPage />
  }

  if (!appUser) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
