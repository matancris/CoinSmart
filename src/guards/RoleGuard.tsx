import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores'
import type { UserRole } from '@/types'

interface RoleGuardProps {
  role: UserRole
}

export function RoleGuard({ role }: RoleGuardProps) {
  const appUser = useAuthStore(s => s.appUser)

  if (!appUser) {
    return <Navigate to="/login" replace />
  }

  if (appUser.role !== role) {
    const redirect = appUser.role === 'parent' ? '/manage' : '/wallet'
    return <Navigate to={redirect} replace />
  }

  return <Outlet />
}
