import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'
import { appService } from '../services/appService'
import ProjectProgressForm from '../components/ProjectProgressForm'
import { useFeedback } from '../context/FeedbackContext'

export default function NewProjectProgressPage() {
  const queryClient = useQueryClient()
  const feedback = useFeedback()

  const refsQuery = useQuery({ queryKey: ['references'], queryFn: appService.references })
  const productivityQuery = useQuery({
    queryKey: ['project-progress', 'historical-productivity'],
    queryFn: appService.historicalProductivityRows,
  })

  const projectMetersMap = useMemo(() => {
    const projectByName = new Map((refsQuery.data?.projects || []).map((project) => [project.name, project.id]))
    return (productivityQuery.data || []).reduce((map, row) => {
      const projectId = projectByName.get(row.project)
      if (!projectId) return map
      map[projectId] = (map[projectId] || 0) + Number(row.meters || 0)
      return map
    }, {})
  }, [refsQuery.data?.projects, productivityQuery.data])

  const mutation = useMutation({
    mutationFn: appService.saveProjectProgress,
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['project-progress'] })
      feedback.success(
        'تم تسجيل متابعة المشروع',
        `تم حفظ ${variables.project_name || 'المشروع'} وظهر في جدول المتابعة.`,
        3600,
      )
    },
    onError: (error) => feedback.error('تعذر حفظ المتابعة', error.message || 'حدث خطأ غير متوقع'),
  })

  if (refsQuery.isLoading || productivityQuery.isLoading) return <div className="page-loader">جاري تجهيز شاشة المتابعة...</div>
  if (refsQuery.isError || productivityQuery.isError) return <div className="page-error">{refsQuery.error?.message || productivityQuery.error?.message || 'تعذر تجهيز الصفحة'}</div>

  return (
    <div className="page-stack progress-entry-page">
      <section className="progress-preview-banner">
        <CheckCircle2 size={19} />
        <div>
          <strong>Project Follow-up — Preview</strong>
          <span>الصفحة دي على نسخة التجربة فقط. مش مضافة إلى Main حتى اعتمادك النهائي.</span>
        </div>
      </section>
      <ProjectProgressForm
        references={refsQuery.data}
        projectMetersMap={projectMetersMap}
        submitting={mutation.isPending}
        onSubmit={(payload) => mutation.mutateAsync(payload)}
      />
    </div>
  )
}
