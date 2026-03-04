export class AppError extends Error {
  code: string
  context?: Record<string, unknown>

  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.context = context
  }
}

export function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) return error

  if (error instanceof Error) {
    const code = (error as { code?: string }).code ?? 'unknown'
    return new AppError(error.message, code)
  }

  if (typeof error === 'string') {
    return new AppError(error, 'unknown')
  }

  return new AppError('An unexpected error occurred', 'unknown')
}

export function handleError(
  error: unknown,
  context?: Record<string, unknown>
): AppError {
  const appError = normalizeError(error)
  if (context) appError.context = { ...appError.context, ...context }
  console.error(`[${appError.code}]`, appError.message, appError.context)
  return appError
}

export function getFirebaseErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    'auth/email-already-in-use': 'errors.emailInUse',
    'auth/invalid-email': 'errors.invalidEmail',
    'auth/weak-password': 'errors.weakPassword',
    'auth/user-not-found': 'errors.invalidCredentials',
    'auth/wrong-password': 'errors.invalidCredentials',
    'auth/invalid-credential': 'errors.invalidCredentials',
    'auth/network-request-failed': 'errors.networkError',
  }
  return messages[code] ?? 'errors.generic'
}
