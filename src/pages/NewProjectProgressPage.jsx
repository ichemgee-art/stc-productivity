import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { progressMetersById } from '../lib/projectProgress'
import { appService } from '../services/appService'
import ProjectProgressForm from '../components/ProjectProgressForm'
import { useFeedback } from '../context/FeedbackContext'

export default function NewProjectProgressPage() {
  const queryClient = useQueryClient()
  const feedback = useFeedback()

  const refsQuery = useQuery({ queryKey: ['references'], queryFn: appService.references })
  const productivityQuery = useQuery({
    queryKey: ['project-progress', 'historical-productivity'],
    queryFn: appService.projectProgressProductivity,
  })

  const projectMetersMap = useMemo(() => progressMetersById(productivityQuery.data), [productivityQuery.data])

  const mutation = useMutation({
    mutationFn: async ({ payload, newFiles, removeAttachmentIds }) => {
      const saved = await appService.saveProjectProgress(payload)
      try {
        await appService.syncProjectProgressAttachments(saved.id, { newFiles, removeAttachmentIds })
      } catch (error) {
        error.projectProgressSaved = saved
        throw error
      }
      return saved
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['project-progress'] })
      feedback.success(
        'تم تسجيل متابعة المشروع',
        `تم حفظ ${variables.payload?.project_name || 'المشروع'} وظهر في جدول المتابعة بالمرفقات.`,
        3600,
      )
    },
    onError: (error) => {
      if (error.projectProgressSaved) {
        feedback.error(
          'تم حفظ المتابعة وتعذر رفع المرفق',
          error.message || 'المتابعة محفوظة، لكن الملف لم يكتمل. أعد محاولة رفع المرفق.',
        )
        return
      }
      feedback.error('تعذر حفظ المتابعة', error.message || 'حدث خطأ غير متوقع')
    },
  })

  if (refsQuery.isLoading || productivityQuery.isLoading) return <div className="page-loader">جاري تجهيز شاشة المتابعة...</div>
  if (refsQuery.isError || productivityQuery.isError) return <div className="page-error">{refsQuery.error?.message || productivityQuery.error?.message || 'تعذر تجهيز الصفحة'}</div>

  return (
    <div className="page-stack progress-entry-page">
      <ProjectProgressForm
        references={refsQuery.data}
        projectMetersMap={projectMetersMap}
        submitting={mutation.isPending}
        onSubmit={(submission) => mutation.mutateAsync(submission)}
      />
    </div>
  )
}
