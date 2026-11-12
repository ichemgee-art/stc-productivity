import { Database, ShieldCheck } from 'lucide-react'
import SystemUsagePanel from '../components/SystemUsagePanel'
import ActiveDevicesPanel from '../components/ActiveDevicesPanel'

export default function SystemUsagePage() {
  return (
    <div className="page-stack">
      <section className="management-hero system-usage-hero">
        <div>
          <span className="eyebrow">SYSTEM ADMINISTRATION</span>
          <h2>استهلاك النظام</h2>
          <p>متابعة مباشرة لاستهلاك Supabase وسعة قاعدة البيانات والتخزين وأعداد السجلات داخل النظام.</p>
        </div>
        <div className="audit-hero__icon">
          <Database size={29} />
        </div>
      </section>

      <div className="system-usage-admin-note">
        <ShieldCheck size={16} />
        <span>هذه الصفحة متاحة لمدير النظام فقط.</span>
      </div>

      <SystemUsagePanel />
      <ActiveDevicesPanel />
    </div>
  )
}
