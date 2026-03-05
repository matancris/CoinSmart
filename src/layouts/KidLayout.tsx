import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores'
import { Avatar } from '@/components/ui'
import { CHILD_SESSION_KEY } from '@/utils'
import styles from './KidLayout.module.scss'

export function KidLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const appUser = useAuthStore(s => s.appUser)
  const { logout } = useAuthStore(s => s.actions)

  const handleLogout = async () => {
    localStorage.removeItem(CHILD_SESSION_KEY)
    await logout()
    navigate('/child-login')
  }

  const navItems = [
    { to: '/wallet', icon: '🏠', label: t('kid.myWallet') },
    { to: '/wallet/transactions', icon: '📋', label: t('kid.transactions') },
    { to: '/wallet/savings', icon: '🚀', label: t('kid.savings') },
    { to: '/wallet/transfer', icon: '💸', label: t('kid.transfer') },
  ]

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.greeting}>
          <Avatar emoji={appUser?.avatarEmoji ?? '😊'} size="sm" />
          <span className={styles.name}>{appUser?.displayName}</span>
        </div>
        <button className={styles.logoutBtn} onClick={handleLogout}>
          {t('auth.logout')}
        </button>
      </header>

      <main className={styles.main}>
        <Outlet />
      </main>

      <nav className={styles.bottomNav}>
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/wallet'}
            className={({ isActive }) =>
              [styles.navItem, isActive ? styles.active : ''].filter(Boolean).join(' ')
            }
          >
            <span className={styles.navIcon}>{item.icon}</span>
            <span className={styles.navLabel}>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
