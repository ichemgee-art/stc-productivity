export default function PageIntro({ eyebrow, title, description, actions = null }) {
  return (
    <section className="page-intro">
      <div className="page-intro__copy">
        {eyebrow ? <span>{eyebrow}</span> : null}
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="page-intro__actions">{actions}</div> : null}
    </section>
  )
}
