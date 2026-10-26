import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Database, FolderKanban, Search, Settings2, UserRound, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useCycle } from '../context/CycleContext'
import { appService } from '../services/appService'
import { date, roleLabels } from '../lib/format'
import { smartIncludes } from '../lib/smartSearch'

const resultIcons = {
  operation: Database,
  person: UserRound,
  project: FolderKanban,
  section: Settings2,
}

export default function GlobalSearch() {
  const { monthKey, selectedCycle } = useCycle()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    const handler = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen(true)
      }
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const refsQuery = useQuery({
    queryKey: ['references'],
    queryFn: appService.references,
    enabled: open,
    staleTime: 60_000,
  })

  const rowsQuery = useQuery({
    queryKey: ['cycle-data', 'global-search', monthKey],
    queryFn: () => appService.productivityRows(selectedCycle.cycle_start, selectedCycle.cycle_end),
    enabled: Boolean(open && selectedCycle),
    staleTime: 30_000,
  })

  const results = useMemo(() => {
    const term = query.trim()
    if (term.length < 2) return []

    const refs = refsQuery.data || { people: [], projects: [], sections: [] }
    const rows = rowsQuery.data || []
    const output = []

    rows.forEach((row) => {
      if (!smartIncludes(
        term,
        row.project,
        row.section,
        row.engineers,
        row.technicians,
        row.assistants,
        row.workers,
        row.work_date,
        row.meters,
        row.total,
        row.note,
      )) return

      output.push({
        key: `operation-${row.id}`,
        type: 'operation',
        label: 'عملية',
        title: `${row.project || 'بدون مشروع'} · ${row.section || 'بدون قطاع'}`,
        subtitle: `${date(row.work_date)} · ${row.meters || 0} م · ${row.engineers || row.technicians || row.assistants || 'بدون فريق'}`,
        to: `/productivity?q=${encodeURIComponent(term)}`,
      })
    })

    ;(refs.people || []).forEach((person) => {
      if (!smartIncludes(term, person.name, roleLabels[person.role], person.role)) return
      output.push({
        key: `person-${person.id}`,
        type: 'person',
        label: roleLabels[person.role] || 'فرد',
        title: person.name,
        subtitle: person.active ? 'نشط في النظام' : 'غير نشط',
        to: `/people/${person.role}?q=${encodeURIComponent(person.name)}`,
      })
    })

    ;(refs.projects || []).forEach((project) => {
      if (!smartIncludes(term, project.name)) return
      output.push({
        key: `project-${project.id}`,
        type: 'project',
        label: 'مشروع',
        title: project.name,
        subtitle: project.active ? 'مشروع نشط' : 'مشروع غير نشط',
        to: `/productivity?q=${encodeURIComponent(project.name)}`,
      })
    })

    ;(refs.sections || []).forEach((section) => {
      if (!smartIncludes(term, section.name, section.price_per_meter)) return
      output.push({
        key: `section-${section.id}`,
        type: 'section',
        label: 'قطاع',
        title: section.name,
        subtitle: `سعر المتر الحالي: ${section.price_per_meter ?? 0}`,
        to: `/productivity?q=${encodeURIComponent(section.name)}`,
      })
    })

    return output.slice(0, 18)
  }, [query, refsQuery.data, rowsQuery.data])

  const go = (to) => {
    setOpen(false)
    setQuery('')
    navigate(to)
  }

  return (
    <>
      <button
        className="icon-btn global-search-trigger"
        type="button"
        onClick={() => setOpen(true)}
        title="بحث شامل (Ctrl + K)"
        aria-label="بحث شامل"
      >
        <Search size={18} />
      </button>

      {open ? (
        <div className="global-search-overlay" role="dialog" aria-modal="true">
          <button className="floating-backdrop" type="button" aria-label="إغلاق البحث" onClick={() => setOpen(false)} />
          <section className="global-search-panel">
            <header className="global-search-head">
              <div className="global-search-input">
                <Search size={19} />
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="ابحث عن مشروع، شخص، عملية، قطاع أو تاريخ..."
                />
                <kbd>Ctrl K</kbd>
              </div>
              <button className="icon-btn small" type="button" onClick={() => setOpen(false)}><X size={17} /></button>
            </header>

            <div className="global-search-results">
              {query.trim().length < 2 ? (
                <div className="global-search-empty">اكتب حرفين على الأقل للبحث في الدورة الحالية والبيانات الأساسية.</div>
              ) : refsQuery.isLoading || rowsQuery.isLoading ? (
                <div className="global-search-empty">جاري البحث...</div>
              ) : results.length ? (
                results.map((result) => {
                  const Icon = resultIcons[result.type] || Search
                  return (
                    <button key={result.key} className="global-search-result" type="button" onClick={() => go(result.to)}>
                      <span className="global-search-result__icon"><Icon size={17} /></span>
                      <div><strong>{result.title}</strong><small>{result.subtitle}</small></div>
                      <span>{result.label}</span>
                    </button>
                  )
                })
              ) : (
                <div className="global-search-empty">لا توجد نتائج مطابقة.</div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
