export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin)
}

export function isValidFamilyCode(code: string): boolean {
  return /^[A-Z0-9]{6}$/.test(code.toUpperCase())
}

export function isPositiveAmount(amount: number): boolean {
  return amount > 0 && isFinite(amount)
}

export function isValidPassword(password: string): boolean {
  return password.length >= 6
}
