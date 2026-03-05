import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore, useFamilyStore } from '@/stores'
import { Button, Avatar, Modal, Input, Spinner, EmptyState } from '@/components/ui'
import { isValidPin } from '@/utils'
import { toast } from '@/components/ui/Toast'
import { formatCurrency } from '@/utils'
import styles from './ParentChildren.module.scss'

const EMOJI_OPTIONS = ['😊', '😎', '🦁', '🐱', '🦊', '🐸', '🐵', '🦄', '🐶', '🐰', '🐼', '🚀', '🦋', '🐢', '🐠', '🦖', '⭐', '🌈']

export function ParentChildren() {
  const { t } = useTranslation()
  const family = useAuthStore(s => s.family)
  const children = useFamilyStore(s => s.children)
  const isLoading = useFamilyStore(s => s.isLoading)
  const { fetchChildren, addChild, removeChild } = useFamilyStore(s => s.actions)

  const [showAddModal, setShowAddModal] = useState(false)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('😊')
  const [pin, setPin] = useState('')
  const [initialBalance, setInitialBalance] = useState('0')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (family?.id) fetchChildren(family.id)
  }, [family?.id, fetchChildren])

  const resetForm = useCallback(() => {
    setName('')
    setEmoji('😊')
    setPin('')
    setInitialBalance('0')
  }, [])

  const handleAdd = async () => {
    if (!family?.id || !name.trim()) return
    if (!isValidPin(pin)) {
      toast(t('errors.invalidPin'), 'error')
      return
    }

    setSubmitting(true)
    const success = await addChild({
      familyId: family.id,
      displayName: name.trim(),
      avatarEmoji: emoji,
      pin,
      initialBalance: parseFloat(initialBalance) || 0,
    })
    setSubmitting(false)

    if (success) {
      setShowAddModal(false)
      resetForm()
    }
  }

  const handleRemove = async (childId: string) => {
    if (!confirm(t('parent.confirmDelete'))) return
    await removeChild(childId)
  }

  if (isLoading) return <Spinner size="lg" fullPage />

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('parent.children')}</h1>
        <Button onClick={() => setShowAddModal(true)}>{t('parent.addChild')}</Button>
      </div>

      <div className={styles.childrenList}>
        {children.map(child => (
          <div key={child.id} className={styles.childRow}>
            <Link to={`/manage/children/${child.id}`} className={styles.childInfo}>
              <Avatar emoji={child.avatarEmoji} size="md" />
              <div className={styles.details}>
                <span className={styles.name}>{child.displayName}</span>
                <span className={styles.balance}>{formatCurrency(child.balance)}</span>
              </div>
            </Link>
            <div className={styles.actions}>
              <Link to={`/manage/children/${child.id}`}>
                <Button variant="secondary" size="sm">{t('common.edit')}</Button>
              </Link>
              <Button variant="danger" size="sm" onClick={() => handleRemove(child.id)}>
                {t('common.delete')}
              </Button>
            </div>
          </div>
        ))}
      </div>

      {children.length === 0 && (
        <EmptyState
          emoji="👶"
          title={t('common.noData')}
          action={<Button onClick={() => setShowAddModal(true)}>{t('parent.addChild')}</Button>}
        />
      )}

      <Modal
        isOpen={showAddModal}
        onClose={() => { setShowAddModal(false); resetForm() }}
        title={t('parent.addChild')}
        footer={
          <>
            <Button variant="ghost" onClick={() => { setShowAddModal(false); resetForm() }}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleAdd} disabled={submitting || !name.trim()}>
              {submitting ? t('common.loading') : t('common.save')}
            </Button>
          </>
        }
      >
        <div className={styles.modalBody}>
          <Input
            label={t('parent.childName')}
            value={name}
            onChange={e => setName(e.target.value)}
            required
          />
          <div>
            <label className={styles.fieldLabel}>
              {t('parent.avatar')}
            </label>
            <div className={styles.emojiGrid}>
              {EMOJI_OPTIONS.map(e => (
                <button
                  key={e}
                  className={[styles.emojiBtn, e === emoji ? styles.selected : ''].filter(Boolean).join(' ')}
                  onClick={() => setEmoji(e)}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <Input
            label={t('auth.pin')}
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="1234"
            dir="ltr"
          />
          <Input
            label={t('parent.initialBalance')}
            type="number"
            value={initialBalance}
            onChange={e => setInitialBalance(e.target.value)}
            min="0"
            dir="ltr"
          />
        </div>
      </Modal>
    </div>
  )
}
