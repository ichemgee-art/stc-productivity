update storage.buckets
set allowed_mime_types = null
where id = 'project-progress-attachments';
