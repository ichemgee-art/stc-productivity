import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, KeyRound, ShieldCheck, UserPlus, UsersRound } from 'lucide-react'
import { userAdminService } from '../services/userAdminService'
import { useFeedback } from '../context/FeedbackContext'
import Modal from '../components/Modal'

const roleOptions = [
  { value: 'admin', label: 'Admin', description: 'إدارة كاملة للنظام', icon: ShieldCheck },
  { value: 'viewer', label: 'Viewer', description: 'قراءة فقط', icon: Eye },
]

const roleMeta = Object.fromEntries(roleOptions.map((item) => [item.value, item]))

const formatLastSeen = (value) => {
  if (!value) return 'لم يسجل دخول بعد'
  try {
    return new Intl.DateTimeFormat('ar-EG', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}

export default function UsersAdminPage() {
  const queryClient = useQueryClient()
  const feedback = useFeedback()
  const [createOpen, setCreateOpen] = useState(false)
  const [passwordTarget, setPasswordTarget] = useState(null)
  const [passwordValue, setPasswordValue] = useState('')
  const [form, setForm] = useState({
    displayName: '',
    email: '',
    password: '',
    appRole: 'viewer',
  })

  const usersQuery = useQuery({
    queryKey: ['admin-users'],
    queryFn: userAdminService.users,
    staleTime: 15_000,
  })

  const users = usersQuery.data || []
  const counts = useMemo(() => ({
    total: users.length,
    admin: users.filter((user) => user.app_role === 'admin').length,
    viewer: users.filter((user) => user.app_role === 'viewer').length,
  }), [users])

  const createMutation = useMutation({
    mutationFn: userAdminService.createUser,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      setCreateOpen(false)
      setForm({ displayName: '', email: '', password: '', appRole: 'viewer' })
      feedback.success('تم إنشاء المستخدم بنجاح')
    },
    onError: (error) => feedback.error(error.message || 'تعذر إنشاء المستخدم'),
  })

  const roleMutation = useMutation({
    mutationFn: ({ userId, appRole }) => userAdminService.updateUserRole(userId, appRole),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      feedback.success('تم تحديث صلاحية المستخدم')
    },
    onError: (error) => feedback.error(error.message || 'تعذر تحديث الصلاحية'),
  })

  const passwordMutation = useMutation({
    mutationFn: ({ userId, password }) => userAdminService.updateUserPassword(userId, password),
    onSuccess: () => {
      setPasswordTarget(null)
      setPasswordValue('')
      feedback.success('تم تغيير كلمة المرور بنجاح')
    },
    onError: (error) => feedback.error(error.message || 'تعذر تغيير كلمة المرور'),
  })

  const submitCreate = (event) => {
    event.preventDefault()
    createMutation.mutate(form)
  }

  const submitPassword = (event) => {
    event.preventDefault()
    if (!passwordTarget) return
    passwordMutation.mutate({ userId: passwordTarget.id, password: passwordValue })
  }

  return (
    <div className="page-stack users-admin-page">
      <section className="users-admin-hero">
        <div>
          <span className="eyebrow">ACCESS CONTROL</span>
          <h2>إدارة المستخدمين والصلاحيات</h2>
          <p>إنشاء الحسابات، تغيير الدور، وتحديث كلمة المرور من داخل النظام بدون الدخول إلى Supabase.</p>
        </div>
        <button className="btn btn-primary" type="button" onClick={() => setCreateOpen(true)}>
          <UserPlus size={17} /> مستخدم جديد
        </button>
      </section>

      <section className="users-admin-stats">
        <article><UsersRound size={18} /><div><span>إجمالي الحسابات</span><strong>{counts.total}</strong></div></article>
        <article><ShieldCheck size={18} /><div><span>Admin</span><strong>{counts.admin}</strong></div></article>
        <article><Eye size={18} /><div><span>Viewer</span><strong>{counts.viewer}</strong></div></article>
      </section>

      <section className="panel users-admin-panel">
        <div className="panel-header">
          <div>
            <h3>الحسابات</h3>
            <p>الـ Viewer قراءة فقط، والـ Admin هو الوحيد اللي يقدر يسجل ويعدل ويحذف ويدير النظام.</p>
          </div>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => usersQuery.refetch()} disabled={usersQuery.isFetching}>
            {usersQuery.isFetching ? 'جاري التحديث...' : 'تحديث'}
          </button>
        </div>

        {usersQuery.isLoading ? (
          <div className="page-loader">جاري تحميل المستخدمين...</div>
        ) : usersQuery.isError ? (
          <div className="page-error">{usersQuery.error?.message || 'تعذر تحميل المستخدمين'}</div>
        ) : (
          <div className="users-admin-table-wrap">
            <table className="users-admin-table">
              <thead>
                <tr>
                  <th>المستخدم</th>
                  <th>الدور</th>
                  <th>آخر دخول</th>
                  <th>الحالة</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const meta = roleMeta[user.app_role] || { label: 'بدون صلاحية', description: 'الحساب غير مربوط بدور' }
                  return (
                    <tr key={user.id}>
                      <td>
                        <div className="users-admin-user">
                          <div className="user-avatar">{(user.display_name || user.email || 'U').slice(0, 1).toUpperCase()}</div>
                          <div>
                            <strong>{user.display_name || 'مستخدم'}</strong>
                            <span>{user.email}</span>
                          </div>
                          {user.is_current ? <span className="status-pill success">حسابك</span> : null}
                        </div>
                      </td>
                      <td>
                        <div className={`user-role-badge role-${user.app_role || 'none'}`}>
                          <strong>{meta.label}</strong>
                          <small>{meta.description}</small>
                        </div>
                      </td>
                      <td>{formatLastSeen(user.last_sign_in_at)}</td>
                      <td>{user.email_confirmed_at ? <span className="status-pill success">مؤكد</span> : <span className="status-pill warning">غير مؤكد</span>}</td>
                      <td>
                        <div className="users-admin-actions">
                          <select
                            value={user.app_role || ''}
                            disabled={roleMutation.isPending || user.is_current}
                            onChange={(event) => roleMutation.mutate({ userId: user.id, appRole: event.target.value })}
                            aria-label={`تغيير صلاحية ${user.email}`}
                          >
                            {!user.app_role ? <option value="">بدون صلاحية</option> : null}
                            {roleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                          </select>
                          <button className="icon-btn small" type="button" onClick={() => { setPasswordTarget(user); setPasswordValue('') }} title="تغيير كلمة المرور">
                            <KeyRound size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="إنشاء مستخدم جديد">
        <form className="modal-form users-admin-form" onSubmit={submitCreate}>
          <label className="field">
            <span>اسم المستخدم</span>
            <input
              value={form.displayName}
              onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))}
              placeholder="مثال: STC Viewer"
              autoComplete="off"
            />
          </label>

          <label className="field">
            <span>البريد الإلكتروني *</span>
            <input
              type="email"
              required
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              placeholder="name@example.com"
              autoComplete="off"
            />
          </label>

          <label className="field">
            <span>كلمة المرور *</span>
            <input
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              placeholder="8 أحرف على الأقل"
              autoComplete="new-password"
            />
          </label>

          <div className="field">
            <span>الصلاحية *</span>
            <div className="users-admin-role-picker">
              {roleOptions.map(({ value, label, description, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  className={form.appRole === value ? 'is-active' : ''}
                  onClick={() => setForm((current) => ({ ...current, appRole: value }))}
                >
                  <Icon size={18} />
                  <div><strong>{label}</strong><small>{description}</small></div>
                </button>
              ))}
            </div>
          </div>

          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'جاري الإنشاء...' : 'إنشاء الحساب'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setCreateOpen(false)}>إلغاء</button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(passwordTarget)} onClose={() => { setPasswordTarget(null); setPasswordValue('') }} title="تغيير كلمة المرور">
        <form className="modal-form users-admin-form" onSubmit={submitPassword}>
          <div className="users-admin-password-target">
            <KeyRound size={18} />
            <div><strong>{passwordTarget?.display_name || passwordTarget?.email}</strong><span>{passwordTarget?.email}</span></div>
          </div>
          <label className="field">
            <span>كلمة المرور الجديدة *</span>
            <input
              type="password"
              required
              minLength={8}
              value={passwordValue}
              onChange={(event) => setPasswordValue(event.target.value)}
              placeholder="8 أحرف على الأقل"
              autoComplete="new-password"
            />
          </label>
          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={passwordMutation.isPending}>
              {passwordMutation.isPending ? 'جاري الحفظ...' : 'تغيير كلمة المرور'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => { setPasswordTarget(null); setPasswordValue('') }}>إلغاء</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
