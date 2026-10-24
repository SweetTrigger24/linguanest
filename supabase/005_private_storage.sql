-- LEGACY OPTIONAL: only for installations that used Supabase Storage.
-- R2 installations use migrations 001-004 and do not need this file.
-- Retained for existing buckets; do not drop their protections or data when switching to R2.
-- Supabase hosted project only. Apply after 004.
-- All application file traffic goes through the authenticated Worker.
BEGIN;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('linguanest-media','linguanest-media',false,31457280,ARRAY['audio/mpeg','image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
DROP POLICY IF EXISTS linguanest_worker_only ON storage.objects;
CREATE POLICY linguanest_worker_only ON storage.objects AS RESTRICTIVE FOR ALL TO anon,authenticated
USING(bucket_id <> 'linguanest-media') WITH CHECK(bucket_id <> 'linguanest-media');
COMMIT;
