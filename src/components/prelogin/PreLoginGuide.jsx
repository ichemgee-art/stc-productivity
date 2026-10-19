import { LockKeyhole, ShieldCheck, UserRoundCog, UsersRound } from 'lucide-react'
import AccountRequestCta from './AccountRequestCta'

export default function PreLoginGuide() {
  return (
    <details className="prelogin-guide" id="account-access" open>
      <summary>
        <span>
          <strong>كيف أحصل على حساب؟</strong>
          <small>الوصول متاح للحسابات الداخلية المصرح لها فقط.</small>
        </span>
        <span className="prelogin-guide__summary-icon" aria-hidden="true">+</span>
      </summary>

      <div className="prelogin-guide__content">
        <ol className="account-steps">
          <li>هذا نظام داخلي مخصص لفريق iChem Productivity.</li>
          <li>لطلب الوصول، تواصل مع مسؤول النظام أو مديرك المباشر.</li>
          <li>بعد إنشاء الحساب وتفعيله، ستصلك بيانات الدخول أو رابط التفعيل.</li>
          <li>إذا نسيت كلمة المرور، تواصل مع مسؤول النظام لإعادة تعيينها.</li>
          <li>لا تشارك بيانات الدخول مع أي شخص.</li>
        </ol>

        <div className="prelogin-role-grid" aria-label="الأدوار المتاحة">
          <div><UserRoundCog size={17} /><span><strong>Admin</strong><small>إدارة النظام والصلاحيات.</small></span></div>
          <div><UsersRound size={17} /><span><strong>User</strong><small>الوصول لمساحة العمل حسب الصلاحية.</small></span></div>
        </div>

        <div className="prelogin-security-note">
          <LockKeyhole size={17} />
          <p><strong>لماذا تسجيل الدخول إلزامي؟</strong> لأن المنصة تحتوي على بيانات تشغيلية داخلية، ويتم إظهار كل جزء حسب صلاحية الحساب.</p>
        </div>

        <AccountRequestCta />

        <div className="prelogin-trust-line">
          <ShieldCheck size={15} />
          <span>الدخول مخصص للمستخدمين المصرح لهم فقط. لا تشارك بيانات الدخول مع أي شخص.</span>
        </div>
      </div>
    </details>
  )
}
