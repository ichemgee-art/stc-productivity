import { useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  ArrowLeftRight, BarChart3, CalendarDays, CalendarRange, ChevronDown, ClipboardPlus,
  Database, FileText, FolderKanban, Gauge, History, Home, LogOut, Menu, Moon,
  MoreHorizontal, RefreshCw, Settings2, ShieldCheck, Sun, UserRoundCog, Users, Wrench, X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useCycle } from '../context/CycleContext'
import { date, monthName, roleLabels } from '../lib/format'
import { appService } from '../services/appService'
import { useQueryClient } from '@tanstack/react-query'
import PageErrorBoundary from '../components/PageErrorBoundary'
import GlobalSearch from '../components/GlobalSearch'
import NotificationCenter from '../components/NotificationCenter'
import AIAssistant from '../components/AIAssistant'
import { useTheme } from '../context/ThemeContext'

const pageTitles = {
  '/': ['لوحة الإنتاجية', 'ملخص الدورة والفرق والمشاريع.'],
  '/productivity': ['البيانات المحسوبة', 'كل عمليات الدورة مع البحث والمراجعة والإدارة.'],
  '/productivity/new': ['تسجيل إنتاجية', 'إضافة عملية جديدة وحساب الأنصبة تلقائيًا.'],
  '/attendance': ['الحضور والغياب', 'متابعة الحضور والغياب والملاحظات داخل الدورة.'],
  '/projects': ['المشاريع', 'قائمة المشاريع واستخدامها داخل التشغيل.'],
  '/sections': ['القطاعات والأسعار', 'القطاعات وأسعار المتر الحالية والتاريخ التشغيلي.'],
  '/comparison': ['مقارنة الشهور', 'مقارنة شاملة بين دورتين من حيث التشغيل والحضور والأداء.'],
  '/report': ['التقرير التنفيذي', 'حصر تاريخي كامل لأي مشروع من أول عملية لآخر عملية.'],
  '/quarter': ['حساب الكوارتر', 'اختيار 3 دورات وتحليلها في تقرير واحد.'],
  '/audit': ['سجل التعديلات', 'كل التغييرات ومن نفذها مع إمكانية الاسترجاع الآمن.'],
}

const peopleLabels = { engineer: 'المهندسين', technician: 'الفنيين', assistant: 'المساعدين', worker: 'العمال' }

export default function AppLayout() {
  const { profile, user, permissions, signOut } = useAuth()
  const { monthKey, selectedCycle, cycles, loading: cyclesLoading, error: cyclesError, selectCycle, refreshCycles } = useCycle()
  const queryClient = useQueryClient()
  const location = useLocation()
  const { isDark, toggleTheme } = useTheme()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [settingActive, setSettingActive] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [openNavGroups, setOpenNavGroups] = useState({ operations: true, team: false, reports: false, admin: false })

  const meta = useMemo(() => {
    if (location.pathname.startsWith('/people/')) {
      const role = location.pathname.split('/').pop()
      return [peopleLabels[role] || 'الأفراد', 'الإنتاجية والحضور ومستحقات كل شخص في الدورة.']
    }
    return pageTitles[location.pathname] || ['STC Productivity', 'Engineering Operations System']
  }, [location.pathname])

  const setAsActive = async () => {
    if (!permissions.canSetActiveCycle || !monthKey) return
    setSettingActive(true)
    try {
      await appService.setActiveCycle(monthKey)
      await refreshCycles()
      await queryClient.invalidateQueries()
    } finally {
      setSettingActive(false)
    }
  }

  const refreshSystem = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await refreshCycles()
      await queryClient.invalidateQueries()
      await queryClient.refetchQueries({ type: 'active' })
    } finally {
      setRefreshing(false)
    }
  }

  const navGroups = [
    {
      key: 'operations',
      label: 'التشغيل',
      items: [
        { to: '/', label: 'لوحة الإنتاجية', icon: Gauge, end: true },
        ...(permissions.canCreateSubmission ? [{ to: '/productivity/new', label: 'تسجيل إنتاجية', icon: ClipboardPlus, accent: true }] : []),
        { to: '/productivity', label: 'البيانات المحسوبة', icon: Database },
        { to: '/attendance', label: 'الحضور والغياب', icon: CalendarDays },
      ],
    },
    {
      key: 'team',
      label: 'الفريق',
      items: [
        { to: '/people/engineer', label: 'المهندسين', icon: UserRoundCog },
        { to: '/people/technician', label: 'الفنيين', icon: Wrench },
        { to: '/people/assistant', label: 'المساعدين', icon: Users },
        { to: '/people/worker', label: 'العمال', icon: Users },
      ],
    },
    {
      key: 'reports',
      label: 'التقارير والتحليل',
      items: [
        { to: '/comparison', label: 'مقارنة الشهور', icon: ArrowLeftRight },
        { to: '/quarter', label: 'حساب الكوارتر', icon: CalendarRange },
        { to: '/report', label: 'التقرير التنفيذي', icon: FileText },
      ],
    },
    {
      key: 'admin',
      label: 'الإدارة',
      items: [
        { to: '/projects', label: 'المشاريع', icon: FolderKanban },
        { to: '/sections', label: 'القطاعات والأسعار', icon: Settings2 },
        ...(permissions.canViewAudit ? [{ to: '/audit', label: 'سجل التعديلات', icon: History }] : []),
      ],
    },
  ]

  const toggleGroup = (key) => setOpenNavGroups((current) => ({ ...current, [key]: !current[key] }))
  const isPathActive = (item) => item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)

  const sidebar = (
    <>
      <div className="sidebar-brand">
        <img className="sidebar-brand-logo" src="/stc-logo-hq.jpg" alt="STC Specialized Trading & Construction" />
      </div>
      <nav className="sidebar-nav sidebar-nav-grouped">
        {navGroups.map((group) => {
          const groupActive = group.items.some(isPathActive)
          const open = groupActive || openNavGroups[group.key]
          return (
            <section className={`sidebar-nav-group ${groupActive ? 'is-active' : ''}`} key={group.key}>
              <button className="sidebar-group-trigger" type="button" onClick={() => toggleGroup(group.key)} aria-expanded={open}>
                <span>{group.label}</span>
                <ChevronDown size={14} className={open ? 'is-open' : ''} />
              </button>
              {open ? (
                <div className="sidebar-group-items">
                  {group.items.map(({ to, label, icon: Icon, end, accent }) => (
                    <NavLink key={to} to={to} end={end} onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''} ${accent ? 'accent' : ''}`}>
                      <Icon size={18} /><span>{label}</span>
                    </NavLink>
                  ))}
                </div>
              ) : null}
            </section>
          )
        })}
      </nav>
      <div className="sidebar-footer">
        <div className="sidebar-role"><ShieldCheck size={17} /><div><strong>{roleLabels[profile?.app_role] || profile?.app_role}</strong><small>{profile?.app_role === 'admin' ? 'إدارة كاملة' : profile?.app_role === 'data_entry' ? 'تشغيل وإدخال' : 'قراءة فقط'}</small></div></div>
      </div>
    </>
  )

  return (
    <div className="app-shell">
      <aside className="sidebar desktop-sidebar">{sidebar}</aside>
      {mobileOpen ? <div className="mobile-sidebar-backdrop" onClick={() => setMobileOpen(false)}><aside className="sidebar mobile-sidebar" onClick={(e) => e.stopPropagation()}><button className="mobile-close icon-btn" onClick={() => setMobileOpen(false)}><X size={18} /></button>{sidebar}</aside></div> : null}

      <div className="app-main">
        <header className="topbar">
          <button className="menu-btn icon-btn" onClick={() => setMobileOpen(true)}><Menu size={20} /></button>
          <div className="topbar-title"><h1>{meta[0]}</h1><p>{meta[1]}</p></div>

          <div className="topbar-actions">
            {permissions.canCreateSubmission ? <Link className="btn btn-primary top-entry-btn" to="/productivity/new"><ClipboardPlus size={16} /> إدخال إنتاجية</Link> : null}

            <div className="cycle-control">
              <BarChart3 size={17} />
              <div className="cycle-select-wrap">
                <small>الدورة المعروضة</small>
                <select disabled={cyclesLoading || !cycles.length} value={monthKey || ''} onChange={(e) => selectCycle(e.target.value)}>
                  {cycles.map((cycle) => <option key={cycle.month_key} value={cycle.month_key}>{monthName(cycle.month_key)} · {cycle.submission_count} عملية</option>)}
                </select>
              </div>
              {selectedCycle ? <span className="cycle-dates">{date(selectedCycle.cycle_start)} → {date(selectedCycle.cycle_end)}</span> : null}
              {selectedCycle?.is_active ? <span className="status-pill success">الحالية</span> : permissions.canSetActiveCycle ? <button className="btn btn-ghost btn-sm" disabled={settingActive} onClick={setAsActive}>{settingActive ? '...' : 'اعتماد'}</button> : null}
            </div>

            <div className="topbar-utility-actions">
              <GlobalSearch />
              <NotificationCenter />
            </div>

            <div className="user-menu-wrap">
              <button className="user-menu-trigger" type="button" onClick={() => setUserMenuOpen((value) => !value)} aria-expanded={userMenuOpen}>
                <div className="user-avatar">{(profile?.display_name || user?.email || 'U').slice(0, 1).toUpperCase()}</div>
                <div className="user-menu-trigger__copy"><strong>{profile?.display_name || 'مستخدم'}</strong><small>{roleLabels[profile?.app_role] || profile?.app_role}</small></div>
                <ChevronDown size={14} className={userMenuOpen ? 'is-open' : ''} />
              </button>

              {userMenuOpen ? (
                <>
                  <button className="floating-backdrop" type="button" aria-label="إغلاق قائمة المستخدم" onClick={() => setUserMenuOpen(false)} />
                  <section className="user-menu-popover">
                    <header><strong>{profile?.display_name || 'مستخدم'}</strong><small>{user?.email}</small></header>
                    <button type="button" onClick={() => { toggleTheme(); setUserMenuOpen(false) }}>{isDark ? <Sun size={17} /> : <Moon size={17} />}<span>{isDark ? 'الوضع الفاتح' : 'الوضع الداكن'}</span></button>
                    <button type="button" disabled={refreshing} onClick={async () => { await refreshSystem(); setUserMenuOpen(false) }}><RefreshCw size={17} className={refreshing ? 'is-spinning' : ''} /><span>{refreshing ? 'جاري التحديث...' : 'تحديث بيانات النظام'}</span></button>
                    <button className="danger" type="button" onClick={signOut}><LogOut size={17} /><span>تسجيل الخروج</span></button>
                  </section>
                </>
              ) : null}
            </div>
          </div>
        </header>

        <main className="page-content">
          {cyclesError ? <div className="page-error">{cyclesError.message || 'تعذر تحميل دورات النظام'}</div> : <PageErrorBoundary resetKey={location.pathname}><Outlet /></PageErrorBoundary>}
        </main>
      </div>

      <nav className="mobile-bottom-nav" aria-label="التنقل الرئيسي للموبايل">
        <NavLink to="/" end className={({ isActive }) => `mobile-bottom-nav__item ${isActive ? 'active' : ''}`}>
          <Home size={20} /><span>الرئيسية</span>
        </NavLink>
        <NavLink to="/productivity" className={({ isActive }) => `mobile-bottom-nav__item ${isActive ? 'active' : ''}`}>
          <Database size={20} /><span>البيانات</span>
        </NavLink>
        {permissions.canCreateSubmission ? (
          <NavLink to="/productivity/new" className={({ isActive }) => `mobile-bottom-nav__item mobile-bottom-nav__create ${isActive ? 'active' : ''}`}>
            <span className="mobile-bottom-nav__create-icon"><ClipboardPlus size={22} /></span>
            <span>إضافة</span>
          </NavLink>
        ) : (
          <NavLink to="/report" className={({ isActive }) => `mobile-bottom-nav__item mobile-bottom-nav__create ${isActive ? 'active' : ''}`}>
            <span className="mobile-bottom-nav__create-icon"><FileText size={22} /></span>
            <span>تقرير</span>
          </NavLink>
        )}
        <NavLink to="/attendance" className={({ isActive }) => `mobile-bottom-nav__item ${isActive ? 'active' : ''}`}>
          <CalendarDays size={20} /><span>الحضور</span>
        </NavLink>
        <button className={`mobile-bottom-nav__item ${mobileOpen ? 'active' : ''}`} type="button" onClick={() => setMobileOpen(true)}>
          <MoreHorizontal size={20} /><span>المزيد</span>
        </button>
      </nav>
      <AIAssistant />
    </div>
  )
}
