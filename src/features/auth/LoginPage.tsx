import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores'
import { Button, Input } from '@/components/ui'
import styles from './AuthLayout.module.scss'

export function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { loginWithEmail } = useAuthStore(s => s.actions)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const success = await loginWithEmail(email, password)
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
            <Button type="submit" fullWidth disabled={loading}>
              {loading ? t('common.loading') : t('auth.login')}
            </Button>
          </form>
        </div>

        <div className={styles.switchMode}>
          {t('auth.noAccount')}{' '}
          <Link to="/register" className={styles.link}>{t('auth.registerNow')}</Link>
        </div>

        <div className={styles.switchMode}>
          <Link to="/child-login" className={styles.link}>{t('auth.childLogin')}</Link>
        </div>
      </div>
    </div>
  )
}
