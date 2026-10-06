import { httpsCallable } from 'firebase/functions'
import { functions } from '@/config/firebase'

// Pays any allowance or interest that came due since the daily server job last ran
export async function syncWallet(userId: string): Promise<boolean> {
  const sync = httpsCallable<{ userId: string }, { allowances: number; interest: number }>(functions, 'syncWallet')
  const { data } = await sync({ userId })
  return data.allowances > 0 || data.interest > 0
}
