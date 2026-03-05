import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores'
import { Button, Input } from '@/components/ui'
import { isValidEmail, isValidPassword } from '@/utils'
import { toast } from '@/components/ui/Toast'
import styles from './AuthLayout.module.scss'

export function RegisterPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { register } = useAuthStore(s => s.actions)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [familyName, setFamilyName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (!isValidEmail(email)) {
      toast(t('errors.invalidEmail'), 'error')
      return
    }
    if (!isValidPassword(password)) {
      toast(t('errors.weakPassword'), 'error')
      return
    }
    if (password !== confirmPassword) {
      toast(t('errors.passwordMismatch'), 'error')
      return
    }

    setLoading(true)
    const success = await register(email, password, familyName, displayName)
    setLoading(false)
    if (success) navigate('/manage')
  }

  return (
    <div className={styles.layout}>
      <div className={styles.container}>
        <div className={styles.logo}>
          <span className={styles.emoji}>🪙</span>
          <h1 className={styles.title}>{t('app.name')}</h1>
          <p className={styles.tagline}>{t('app.tagline')}</p>
        </div>

        <div className={styles.card}>
          <form className={styles.form} onSubmit={handleSubmit}>
            <Input
              label={t('auth.familyName')}
              value={familyName}
              onChange={e => setFamilyName(e.target.value)}
              required
            />
            <Input
              label={t('auth.displayName')}
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              required
            />
            <Input
              label={t('auth.email')}
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              dir="ltr"
            />
            <Input
              label={t('auth.password')}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              dir="ltr"
            />
            <Input
              label={t('auth.confirmPassword')}
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              dir="ltr"
            />
            <Button type="submit" fullWidth disabled={loading}>
              {loading ? t('common.loading') : t('auth.register')}
            </Button>
          </form>
        </div>

        <div className={styles.switchMode}>
          {t('auth.hasAccount')}{' '}
          <Link to="/login" className={styles.link}>{t('auth.loginNow')}</Link>
        </div>
      </div>
    </div>
  )
}
