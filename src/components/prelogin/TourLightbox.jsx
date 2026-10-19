import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

const focusableSelector = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export default function TourLightbox({ item, onClose, restoreFocusTo }) {
  const dialogRef = useRef(null)
  const closeRef = useRef(null)

  useEffect(() => {
    closeRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = [...dialogRef.current.querySelectorAll(focusableSelector)]
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      restoreFocusTo?.focus?.()
    }
  }, [onClose, restoreFocusTo])

  if (!item) return null

  return (
    <div
      className="tour-lightbox"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={dialogRef}
        className="tour-lightbox__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-lightbox-title"
        aria-describedby="tour-lightbox-description"
      >
        <header className="tour-lightbox__header">
          <div>
            <span className="tour-data-badge">بيانات توضيحية</span>
            <h2 id="tour-lightbox-title">{item.title}</h2>
            <p id="tour-lightbox-description">{item.description}</p>
          </div>
          <button ref={closeRef} className="icon-btn tour-lightbox__close" type="button" onClick={onClose} aria-label="إغلاق المعاينة">
            <X size={20} />
          </button>
        </header>
        <figure className="tour-lightbox__figure">
          <img src={item.image} alt={item.alt} width="1200" height="760" decoding="async" />
        </figure>
      </section>
    </div>
  )
}
