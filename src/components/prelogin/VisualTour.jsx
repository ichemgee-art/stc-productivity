import { useCallback, useState } from 'react'
import TourCard from './TourCard'
import TourLightbox from './TourLightbox'

// Demo-only assets. Replace with fully anonymized WebP/AVIF product imagery when approved.
const tourItems = [
  {
    id: 'dashboard',
    title: 'لوحة التحكم التشغيلية',
    description: 'ملخص واضح للدورة والإنتاجية والمؤشرات التشغيلية المهمة.',
    image: '/tour/dashboard.svg',
    alt: 'موك أب توضيحي للوحة تحكم iChem Productivity ببيانات وهمية',
  },
  {
    id: 'teams',
    title: 'متابعة الفرق والحضور',
    description: 'قراءة سريعة للحضور والغياب وأداء فرق التنفيذ دون كشف بيانات حقيقية.',
    image: '/tour/teams-attendance.svg',
    alt: 'موك أب توضيحي لمتابعة الفرق والحضور ببيانات وأسماء وهمية',
  },
  {
    id: 'projects',
    title: 'المشاريع والقطاعات',
    description: 'تنظيم المشاريع والقطاعات والأسعار التشغيلية في مساحة واحدة.',
    image: '/tour/projects-sectors.svg',
    alt: 'موك أب توضيحي لإدارة المشاريع والقطاعات ببيانات وهمية',
  },
  {
    id: 'reports',
    title: 'مؤشرات الإنتاجية والتقارير',
    description: 'عرض منظم للعمليات والمستحقات والتقارير حسب الصلاحية.',
    image: '/tour/reports.svg',
    alt: 'موك أب توضيحي لمؤشرات الإنتاجية والتقارير ببيانات وهمية',
  },
]

export default function VisualTour() {
  const [activeItem, setActiveItem] = useState(null)
  const [restoreFocusTo, setRestoreFocusTo] = useState(null)

  const openItem = (item, trigger) => {
    setRestoreFocusTo(trigger)
    setActiveItem(item)
  }

  const close = useCallback(() => setActiveItem(null), [])

  return (
    <section className="visual-tour" aria-labelledby="visual-tour-title">
      <div className="prelogin-section-heading">
        <span>واجهة المنتج</span>
        <h2 id="visual-tour-title">شاهد المنصة قبل الدخول</h2>
        <p>جولة سريعة على أهم واجهات iChem Productivity. جميع البيانات المعروضة توضيحية وليست بيانات تشغيل حقيقية.</p>
      </div>

      <div className="tour-grid">
        {tourItems.map((item) => <TourCard key={item.id} item={item} onOpen={openItem} />)}
      </div>

      <div className="visual-tour__cta">
        <a className="btn btn-primary" href="#account-access">تعرّف على طريقة الحصول على حساب</a>
      </div>

      {activeItem ? <TourLightbox item={activeItem} onClose={close} restoreFocusTo={restoreFocusTo} /> : null}
    </section>
  )
}
