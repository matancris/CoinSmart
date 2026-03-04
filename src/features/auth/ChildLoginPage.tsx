import { useState, useRef, useCallback, useEffect, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores'
import { authService } from '@/services'
import { Button, Input } from '@/components/ui'
import { toast } from '@/components/ui/Toast'
import { isValidFamilyCode } from '@/utils'
import layoutStyles from './AuthLayout.module.scss'
import styles from './ChildLoginPage.module.scss'

const FAMILY_CODE_KEY = 'coinsmart_family_code'

type Step = 'code' | 'pin'

export function ChildLoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { code: urlCode } = useParams<{ code: string }>()
  const isLoading = useAuthStore(s => s.isLoading)
  const { loginChildWithPin } = useAuthStore(s => s.actions)

  const savedCode = localStorage.getItem(FAMILY_CODE_KEY)
  const [step, setStep] = useState<Step>(savedCode ? 'pin' : 'code')
  const [familyCode, setFamilyCode] = useState(savedCode ?? '')
  const [pin, setPin] = useState(['', '', '', ''])
  const [loading, setLoading] = useState(false)
  const pinRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (!urlCode) return
    const code = urlCode.trim().toUpperCase()
    if (!isValidFamilyCode(code)) {
      toast(t('errors.invalidFamilyCode'), 'error')
      return
    }
    setFamilyCode(code)
    localStorage.setItem(FAMILY_CODE_KEY, code)
    setStep('pin')
  }, [urlCode, t])

  useEffect(() => {
    if (step === 'pin') {
      setTimeout(() => pinRefs.current[0]?.focus(), 100)
    }
  }, [step])

  const handleCodeSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const code = familyCode.trim().toUpperCase()
    if (!isValidFamilyCode(code)) {
      toast(t('errors.invalidFamilyCode'), 'error')
      return
    }
    setLoading(true)
    try {
      const valid = await authService.validateFamilyCode(code)
      if (!valid) {
        toast(t('errors.invalidFamilyCode'), 'error')
        return
      }
      setFamilyCode(code)
      localStorage.setItem(FAMILY_CODE_KEY, code)
      setStep('pin')
    } catch {
      toast(t('errors.invalidFamilyCode'), 'error')
    } finally {
      setLoading(false)
    }
  }

  const handlePinChange = useCallback((index: number, value: string) => {
    if (!/^\d*$/.test(value)) return
    const newPin = [...pin]
    newPin[index] = value.slice(-1)
    setPin(newPin)
    if (value && index < 3) {
      pinRefs.current[index + 1]?.focus()
    }
  }, [pin])

  const handlePinKeyDown = useCallback((index: number, key: string) => {
    if (key === 'Backspace' && !pin[index] && index > 0) {
      pinRefs.current[index - 1]?.focus()
    }
  }, [pin])

  const handlePinSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const fullPin = pin.join('')
    if (fullPin.length !== 4) return

    const success = await loginChildWithPin(familyCode, fullPin)
    if (success) {
      navigate('/wallet')
    } else {
      setPin(['', '', '', ''])
      pinRefs.current[0]?.focus()
    }
  }

  const handleChangeFamily = () => {
    localStorage.removeItem(FAMILY_CODE_KEY)
    setFamilyCode('')
    setPin(['', '', '', ''])
    setStep('code')
  }

  return (
    <div className={layoutStyles.layout}>
      <div className={layoutStyles.container}>
        <div className={layoutStyles.logo}>
          <span className={layoutStyles.emoji}>🪙</span>
          <h1 className={layoutStyles.title}>{t('app.name')}</h1>
          <p className={layoutStyles.tagline}>{t('auth.childLogin')}</p>
        </div>

        <div className={layoutStyles.card}>
          {step === 'code' && (
            <form className={layoutStyles.form} onSubmit={handleCodeSubmit}>
              <Input
                label={t('auth.familyCode')}
                value={familyCode}
                onChange={e => setFamilyCode(e.target.value.toUpperCase().trim())}
                placeholder={t('auth.enterFamilyCode')}
                maxLength={6}
                dir="ltr"
                required
              />
              <Button type="submit" fullWidth disabled={loading}>
                {loading ? t('common.loading') : t('common.next')}
              </Button>
            </form>
          )}

          {step === 'pin' && (
            <form className={styles.steps} onSubmit={handlePinSubmit}>
              <p className={styles.pinLabel}>{t('auth.enterPin')}</p>
              <div className={styles.pinInput} dir="ltr">
                {pin.map((digit, i) => (
                  <input
                    key={i}
                    ref={el => { pinRefs.current[i] = el }}
                    type="password"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handlePinChange(i, e.target.value)}
                    onKeyDown={e => handlePinKeyDown(i, e.key)}
                  />
                ))}
              </div>
              <Button type="submit" fullWidth disabled={isLoading || pin.join('').length !== 4}>
                {isLoading ? t('common.loading') : t('auth.login')}
              </Button>
              <button
                type="button"
                className={styles.backLink}
                onClick={handleChangeFamily}
              >
                {t('auth.changeFamily')}
              </button>
            </form>
          )}
        </div>

        <div className={layoutStyles.switchMode}>
          <Link to="/login" className={layoutStyles.link}>{t('auth.parentLogin')}</Link>
        </div>
      </div>
    </div>
  )
}
