import { Maximize2 } from 'lucide-react'

export default function TourCard({ item, onOpen }) {
  return (
    <article className="tour-card">
      <button
        className="tour-card__preview"
        type="button"
        onClick={(event) => onOpen(item, event.currentTarget)}
        aria-label={`فتح معاينة ${item.title}`}
      >
        <img
          src={item.image}
          alt={item.alt}
          width="1200"
          height="760"
          loading="lazy"
          decoding="async"
        />
        <span className="tour-card__zoom" aria-hidden="true"><Maximize2 size={16} /></span>
      </button>
      <div className="tour-card__body">
        <div className="tour-card__meta">
          <span className="tour-data-badge">بيانات توضيحية</span>
        </div>
        <h3>{item.title}</h3>
        <p>{item.description}</p>
      </div>
    </article>
  )
}
