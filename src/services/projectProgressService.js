import { renderPdfFirstPage } from '../lib/pdfPreview'
import { fetchAll, supabase, unwrap } from './serviceUtils'

const ATTACHMENT_BUCKET = 'project-progress-attachments'
const MAX_ATTACHMENT_SIZE = 15 * 1024 * 1024
const MAX_ATTACHMENTS = 3
const ALLOWED_ATTACHMENT_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

const normalizeOptionalNumber = (value, label) => {
  if (value === '' || value == null) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`${label} يجب أن تكون رقمًا صحيحًا`)
  return parsed
}

const STORAGE_EXTENSION_BY_MIME = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
}

const storageExtensionFor = (file) => STORAGE_EXTENSION_BY_MIME[file?.type] || ''

const getSignedUrl = async (path) => {
  if (!path) return null
  const { data, error } = await supabase.storage.from(ATTACHMENT_BUCKET).createSignedUrl(path, 60 * 60)
  if (error) return null
  return data?.signedUrl || null
}

const hydrateAttachment = async (row) => {
  const [url, previewUrl] = await Promise.all([
    getSignedUrl(row.storage_path),
    row.preview_storage_path ? getSignedUrl(row.preview_storage_path) : Promise.resolve(null),
  ])
  return {
    ...row,
    url,
    preview_url: previewUrl || (row.mime_type?.startsWith('image/') ? url : null),
  }
}

const attachmentRows = async (projectProgressId) => fetchAll((from, to) => supabase
  .from('project_progress_attachments')
  .select('id,project_progress_id,file_name,storage_path,preview_storage_path,mime_type,file_size,created_at')
  .eq('project_progress_id', projectProgressId)
  .order('created_at', { ascending: true })
  .range(from, to))

const removeStoragePaths = async (paths) => {
  const clean = [...new Set((paths || []).filter(Boolean))]
  if (!clean.length) return
  const { error } = await supabase.storage.from(ATTACHMENT_BUCKET).remove(clean)
  if (error) throw error
}

const deleteAttachmentRow = async (row) => {
  const { error } = await supabase
    .from('project_progress_attachments')
    .delete()
    .eq('id', row.id)
  if (error) throw error

  try {
    await removeStoragePaths([row.storage_path, row.preview_storage_path])
  } catch (_) {
    // Metadata is already removed, so the UI cannot point to a missing file.
    // A failed storage cleanup only leaves an orphaned object that can be cleaned later.
  }
}

const validateAttachment = (file) => {
  if (!file) throw new Error('الملف غير صالح')
  if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) {
    throw new Error(`نوع الملف غير مسموح: ${file.name}`)
  }
  if (file.size > MAX_ATTACHMENT_SIZE) {
    throw new Error(`الملف ${file.name} أكبر من 15MB`)
  }
}

const uploadAttachment = async (projectProgressId, file) => {
  validateAttachment(file)

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!userData?.user?.id) throw new Error('يجب تسجيل الدخول لرفع المرفقات')

  const token = crypto.randomUUID()
  const originalPath = `${projectProgressId}/files/${token}${storageExtensionFor(file)}`
  let previewPath = null
  let metadataId = null

  try {
    const originalUpload = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .upload(originalPath, file, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: false,
      })
    if (originalUpload.error) throw originalUpload.error

    if (file.type === 'application/pdf') {
      const previewBlob = await renderPdfFirstPage(file)
      previewPath = `${projectProgressId}/previews/${token}.jpg`
      const previewUpload = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .upload(previewPath, previewBlob, {
          cacheControl: '3600',
          contentType: 'image/jpeg',
          upsert: false,
        })
      if (previewUpload.error) throw previewUpload.error
    }

    const insert = await supabase
      .from('project_progress_attachments')
      .insert({
        project_progress_id: projectProgressId,
        file_name: file.name,
        storage_path: originalPath,
        preview_storage_path: previewPath,
        mime_type: file.type,
        file_size: file.size,
        created_by: userData.user.id,
      })
      .select('id,project_progress_id,file_name,storage_path,preview_storage_path,mime_type,file_size,created_at')
      .single()
    if (insert.error) throw insert.error

    metadataId = insert.data.id
    return hydrateAttachment(insert.data)
  } catch (error) {
    try {
      await removeStoragePaths([originalPath, previewPath])
    } catch (_) {}
    if (metadataId) {
      try {
        await supabase.from('project_progress_attachments').delete().eq('id', metadataId)
      } catch (_) {}
    }
    throw error
  }
}

export const projectProgressService = {
  async projectProgressProductivity() {
    return fetchAll((from, to) => supabase
      .from('submissions')
      .select('id,project_id,meters')
      .order('id')
      .range(from, to))
  },

  async projectProgressRows() {
    return fetchAll((from, to) => supabase
      .from('v_project_progress')
      .select('*')
      .order('display_number', { ascending: true, nullsFirst: false })
      .order('legacy_excel_row', { ascending: true, nullsFirst: false })
      .range(from, to))
  },

  async projectProgressRecord(id) {
    return unwrap(await supabase
      .from('v_project_progress')
      .select('*')
      .eq('id', id)
      .maybeSingle())
  },

  async projectProgressAttachments(projectProgressId) {
    const rows = await attachmentRows(projectProgressId)
    return Promise.all(rows.map(hydrateAttachment))
  },

  async syncProjectProgressAttachments(projectProgressId, { newFiles = [], removeAttachmentIds = [] } = {}) {
    const current = await attachmentRows(projectProgressId)
    const removeSet = new Set(removeAttachmentIds || [])
    const toRemove = current.filter((row) => removeSet.has(row.id))
    const remaining = current.filter((row) => !removeSet.has(row.id))

    if (remaining.length + newFiles.length > MAX_ATTACHMENTS) {
      throw new Error('الحد الأقصى 3 مرفقات لكل متابعة مشروع')
    }

    for (const row of toRemove) {
      await deleteAttachmentRow(row)
    }

    const created = []
    try {
      for (const file of newFiles) {
        created.push(await uploadAttachment(projectProgressId, file))
      }
    } catch (error) {
      for (const row of created.reverse()) {
        try { await deleteAttachmentRow(row) } catch (_) {}
      }
      throw error
    }

    const refreshed = await attachmentRows(projectProgressId)
    return Promise.all(refreshed.map(hydrateAttachment))
  },

  async deleteProjectProgress(id) {
    const attachments = await attachmentRows(id)
    const result = unwrap(await supabase.rpc('delete_project_progress', { p_id: id }))
    try {
      await removeStoragePaths(attachments.flatMap((row) => [row.storage_path, row.preview_storage_path]))
    } catch (_) {
      // The business record is already deleted; orphan cleanup can be retried later.
    }
    return result
  },

  async saveProjectProgress(payload) {
    const normalizedPayload = {
      ...payload,
      contract_quantity: normalizeOptionalNumber(payload.contract_quantity, 'كميات التعاقد + البنود المحملة على القطاعات'),
      original_contract_quantity: normalizeOptionalNumber(payload.original_contract_quantity, 'كمية التعاقد الأصلية'),
      contract_value: normalizeOptionalNumber(payload.contract_value, 'قيمة العقد'),
      historical_before_system: normalizeOptionalNumber(payload.historical_before_system, 'كميات ما قبل النظام') ?? 0,
      manual_executed_quantity: payload.execution_mode === 'manual'
        ? (normalizeOptionalNumber(payload.manual_executed_quantity, 'الكميات المنفذة') ?? 0)
        : null,
    }

    return unwrap(await supabase.rpc('save_project_progress', { p_payload: normalizedPayload }))
  },
}

export { ATTACHMENT_BUCKET, MAX_ATTACHMENTS, MAX_ATTACHMENT_SIZE, ALLOWED_ATTACHMENT_TYPES }
