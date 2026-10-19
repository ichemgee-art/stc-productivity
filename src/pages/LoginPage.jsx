import { useState } from 'react'
import { BarChart3, Eye, EyeOff, LockKeyhole, ShieldCheck, Sparkles, UsersRound } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import PreLoginGuide from '../components/prelogin/PreLoginGuide'
import VisualTour from '../components/prelogin/VisualTour'

const GENERIC_LOGIN_ERROR = 'تعذر تسجيل الدخول. تحقق من البيانات أو تواصل مع مسؤول النظام.'

export default function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showPasswordHelp, setShowPasswordHelp] = useState(false)

  const canSubmit = Boolean(email.trim() && password && !submitting)

  const submit = async (event) => {
    event.preventDefault()
    if (!canSubmit) return

    setError('')
    setSubmitting(true)
    try {
      await signIn(email.trim(), password)
    } catch {
      setError(GENERIC_LOGIN_ERROR)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="prelogin-page">
      <section className="prelogin-hero-shell" aria-label="iChem Productivity">
        <section className="login-visual prelogin-hero">
          <div className="login-brand-row">
            <img className="login-brand-logo" src="/stc-logo-hq.jpg" alt="STC Specialized Trading & Construction" />
          </div>

          <div className="login-copy">
            <span className="eyebrow"><Sparkles size={15} /> iChem Productivity</span>
            <h1>إدارة العمليات الهندسية والإنتاجية في مساحة عمل واحدة.</h1>
            <p>منصة داخلية تساعد الفريق على متابعة التشغيل، الحضور، الفرق، المشاريع والقطاعات مع وصول منظم حسب صلاحية كل مستخدم.</p>

            <div className="login-feature-grid" aria-label="مزايا المنصة">
              <div><BarChart3 /><strong>رؤية تشغيلية</strong><span>ملخصات واضحة للدورة والإنتاجية.</span></div>
              <div><UsersRound /><strong>متابعة الفريق</strong><span>الحضور والغياب وأداء فرق التنفيذ.</span></div>
              <div><ShieldCheck /><strong>وصول محمي</strong><span>الحسابات والصلاحيات تُدار داخليًا.</span></div>
            </div>

            <div className="prelogin-hero-actions">
              <a className="btn prelogin-hero-primary" href="#login-form">تسجيل الدخول</a>
              <a className="btn prelogin-hero-secondary" href="#visual-tour-title">شاهد المنصة قبل الدخول</a>
            </div>
          </div>

          <div className="prelogin-hero-footnote">
            <LockKeyhole size={15} />
            <span>نظام داخلي للمستخدمين المصرح لهم فقط · دورة التشغيل 26 → 25</span>
          </div>
        </section>

        <section className="login-form-side prelogin-access-panel">
          <div className="prelogin-access-stack">
            <form className="login-card prelogin-login-card" id="login-form" onSubmit={submit} noValidate>
              <div className="mobile-brand"><img className="login-brand-logo mobile" src="/stc-logo-hq.jpg" alt="STC Specialized Trading & Construction" /></div>
              <span className="login-overline">دخول آمن</span>
              <h2>تسجيل الدخول</h2>
              <p>استخدم حساب العمل المفعّل لك. لا يوجد تسجيل عام في المنصة.</p>

              <label className="field" htmlFor="login-email">
                <span>البريد الإلكتروني</span>
                <input
                  id="login-email"
                  type="email"
                  inputMode="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value)
                    if (error) setError('')
                  }}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'login-error' : undefined}
                />
              </label>

              <label className="field" htmlFor="login-password">
                <span>كلمة المرور</span>
                <div className="password-field">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value)
                      if (error) setError('')
                    }}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? 'login-error' : undefined}
                  />
                  <button
                    className="password-toggle"
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                  </button>
                </div>
              </label>

              <button
                className="forgot-password-help"
                type="button"
                aria-expanded={showPasswordHelp}
                aria-controls="password-reset-guidance"
                onClick={() => setShowPasswordHelp((current) => !current)}
              >
                نسيت كلمة المرور؟
              </button>

              {showPasswordHelp ? (
                <div className="password-reset-guidance" id="password-reset-guidance" role="note">
                  تواصل مع مسؤول النظام لإعادة تعيين كلمة المرور. لا يوجد تدفق إعادة تعيين عام من هذه الصفحة.
                </div>
              ) : null}

              {error ? <div className="form-error login-safe-error" id="login-error" role="alert">{error}</div> : null}

              <button className="btn btn-primary btn-wide login-submit" type="submit" disabled={!canSubmit} aria-busy={submitting}>
                {submitting ? <><span className="login-spinner" aria-hidden="true" /> جاري تسجيل الدخول...</> : 'دخول للنظام'}
              </button>

              <div className="login-security-note">
                <ShieldCheck size={16} />
                <span>الدخول مخصص للمستخدمين المصرح لهم فقط. لا تشارك بيانات الدخول مع أي شخص.</span>
              </div>
            </form>

            <PreLoginGuide />
          </div>
        </section>
      </section>

      <VisualTour />

      <footer className="prelogin-footer">
        <img src="/stc-logo-hq.jpg" alt="" width="118" height="42" loading="lazy" decoding="async" />
        <p>iChem Productivity · نظام داخلي لإدارة العمليات الهندسية والإنتاجية.</p>
      </footer>
    </main>
  )
}
