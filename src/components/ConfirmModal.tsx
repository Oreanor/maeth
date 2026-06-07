import { useAnimatedClose } from './useAnimatedClose'

/** Generic in-app confirmation dialog (replaces window.confirm). */
export function ConfirmModal({
  message,
  confirmLabel,
  cancelLabel,
  busy,
  onConfirm,
  onClose,
}: {
  message: string
  confirmLabel: string
  cancelLabel: string
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const { closing, close } = useAnimatedClose(onClose)
  return (
    <div className={`modal-backdrop ${closing ? 'modal-backdrop--out' : ''}`} onClick={close}>
      <div className={`modal confirm-modal ${closing ? 'modal--out' : ''}`} onClick={(e) => e.stopPropagation()}>
        <p className="confirm-modal__message">{message}</p>
        <div className="create-actions">
          <button className="btn btn--ghost" onClick={close} disabled={busy}>
            {cancelLabel}
          </button>
          <button className="btn btn--danger" onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
