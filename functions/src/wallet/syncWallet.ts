import { onCall } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { authorizeForChild } from '../shared/access'
import { loadFamilyPins } from '../shared/pins'
import { processChild } from '../scheduled/processRecurring'

// Pays anything due right away when the wallet opens, instead of waiting for the daily job
export const syncWallet = onCall<{ userId?: unknown }>(async (request) => {
  const { userId } = request.data ?? {}
  const { caller } = await authorizeForChild(request.auth, userId)

  if (caller.role === 'parent') {
    // Moves PIN hashes left by the old web app out of client-readable docs
    await loadFamilyPins(caller.familyId).catch((error: unknown) => {
      logger.warn('PIN migration failed', { familyId: caller.familyId, error: String(error) })
    })
  }

  return processChild(userId as string, new Date())
})
