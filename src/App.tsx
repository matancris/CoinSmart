import { BrowserRouter } from 'react-router-dom'
import { AppRouter } from '@/AppRouter'
import { ToastContainer } from '@/components/ui/Toast'
import { useNotifications } from '@/hooks/useNotifications'

export function App() {
  useNotifications()

  return (
    <BrowserRouter>
      <AppRouter />
      <ToastContainer />
    </BrowserRouter>
  )
}
