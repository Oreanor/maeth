import { Modal } from './Modal'

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
  return (
    <Modal className="confirm-modal" dismissible={!busy} onClose={onClose}>
      {(close) => (
        <>
          <p className="confirm-modal__message">{message}</p>
          <div className="create-actions">
            <button className="btn btn--ghost" onClick={close} disabled={busy}>
              {cancelLabel}
            </button>
            <button className="btn btn--danger" onClick={onConfirm} disabled={busy}>
              {confirmLabel}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
