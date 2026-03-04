import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores'
import { AuthGuard, RoleGuard } from '@/guards'
import { KidLayout } from '@/layouts/KidLayout'
import { ParentLayout } from '@/layouts/ParentLayout'
import { LoginPage, RegisterPage, ChildLoginPage } from '@/features/auth'
import { KidDashboard, KidTransactions, KidSavings, KidTransfer } from '@/features/kid'
import { ParentDashboard, ParentChildren, ChildDetail } from '@/features/parent'

function RootRedirect() {
  const appUser = useAuthStore(s => s.appUser)
  if (!appUser) return <Navigate to="/login" replace />
  return <Navigate to={appUser.role === 'parent' ? '/manage' : '/wallet'} replace />
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/child-login" element={<ChildLoginPage />} />
      <Route path="/join/:code" element={<ChildLoginPage />} />

      <Route element={<AuthGuard />}>
        <Route element={<RoleGuard role="child" />}>
          <Route element={<KidLayout />}>
            <Route path="/wallet" element={<KidDashboard />} />
            <Route path="/wallet/transactions" element={<KidTransactions />} />
            <Route path="/wallet/savings" element={<KidSavings />} />
            <Route path="/wallet/transfer" element={<KidTransfer />} />
          </Route>
        </Route>

        <Route element={<RoleGuard role="parent" />}>
          <Route element={<ParentLayout />}>
            <Route path="/manage" element={<ParentDashboard />} />
            <Route path="/manage/children" element={<ParentChildren />} />
            <Route path="/manage/children/:id" element={<ChildDetail />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<RootRedirect />} />
    </Routes>
  )
}
