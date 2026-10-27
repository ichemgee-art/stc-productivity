import { useEffect, useId } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export default function Modal({ open, title, children, onClose, width = 'md' }) {
  const titleId = useId()

  useEffect(() => {
    if (!open) return undefined
    const previousOverflow = document.body.style.overflow
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <section className={`modal-card modal-${width}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="modal-header">
          <h3 id={titleId}>{title}</h3>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="إغلاق"><X size={18} /></button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>,
    document.body,
  )
}
