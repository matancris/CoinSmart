import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore, useUIStore } from '@/stores'
import { Avatar } from '@/components/ui'
import styles from './ParentLayout.module.scss'

export function ParentLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const appUser = useAuthStore(s => s.appUser)
  const family = useAuthStore(s => s.family)
  const { logout } = useAuthStore(s => s.actions)
  const sidebarOpen = useUIStore(s => s.sidebarOpen)
  const { toggleSidebar } = useUIStore(s => s.actions)
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const navItems = [
    { to: '/manage', icon: '📊', label: t('parent.dashboard'), end: true },
    { to: '/manage/children', icon: '👧', label: t('parent.children'), end: false },
  ]

  return (
    <div className={styles.layout}>
      <aside
        className={[
          styles.sidebar,
          !sidebarOpen ? styles.collapsed : '',
          mobileOpen ? styles.mobileOpen : '',
        ].filter(Boolean).join(' ')}
      >
        <div className={styles.sidebarHeader}>
          <span className={styles.sidebarTitle}>🪙 {t('app.name')}</span>
          <button className={styles.toggleBtn} onClick={toggleSidebar}>
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>

        <nav className={styles.nav}>
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                [styles.navItem, isActive ? styles.active : ''].filter(Boolean).join(' ')
              }
              onClick={() => setMobileOpen(false)}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span className={styles.navLabel}>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <button
            className={styles.navItem}
            onClick={handleLogout}
          >
            <span className={styles.navIcon}>🚪</span>
            <span className={styles.navLabel}>{t('auth.logout')}</span>
          </button>
        </div>
      </aside>

      {mobileOpen && <div className={styles.overlay} onClick={() => setMobileOpen(false)} />}

      <div className={[styles.content, !sidebarOpen ? styles.sidebarCollapsed : ''].filter(Boolean).join(' ')}>
        <header className={styles.topBar}>
          <button className={styles.menuBtn} onClick={() => setMobileOpen(prev => !prev)}>
            ☰
          </button>
          <div className={styles.userInfo}>
            <Avatar emoji={appUser?.avatarEmoji ?? '👨‍👩‍👧‍👦'} size="sm" />
            <div>
              <div className={styles.userName}>{appUser?.displayName}</div>
              <div className={styles.familyName}>{family?.name}</div>
            </div>
          </div>
        </header>

        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
