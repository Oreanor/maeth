import { useMemo, useState, type ReactNode } from 'react'
import { useI18n } from '@/i18n'
import { pickLoginIllustration } from '@/login/illustrations'
import { useModalDismiss } from './useModalDismiss'

export function LoginIllustration({ overlay }: { overlay?: ReactNode }) {
  const { t } = useI18n()
  const src = useMemo(() => pickLoginIllustration(), [])
  const [open, setOpen] = useState(false)
  useModalDismiss(open ? () => setOpen(false) : undefined)

  return (
    <>
      <div className="login-hero">
        <button
          type="button"
          className="login-illustration"
          onClick={() => setOpen(true)}
          aria-label={t('login.viewIllustration')}
        >
          <img src={src} alt="" draggable={false} />
        </button>
        {overlay}
      </div>

      {open && (
        <div
          className="modal-backdrop login-illustration-backdrop"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={t('login.viewIllustration')}
        >
          <button
            type="button"
            className="login-illustration-close btn btn--ghost"
            onClick={() => setOpen(false)}
          >
            {t('common.close')}
          </button>
          <img
            className="login-illustration-full"
            src={src}
            alt=""
            draggable={false}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
