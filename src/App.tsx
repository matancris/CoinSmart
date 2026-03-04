import { BrowserRouter } from 'react-router-dom'
import { AppRouter } from '@/AppRouter'
import { ToastContainer } from '@/components/ui/Toast'

export function App() {
  return (
    <BrowserRouter>
      <AppRouter />
      <ToastContainer />
    </BrowserRouter>
  )
}
