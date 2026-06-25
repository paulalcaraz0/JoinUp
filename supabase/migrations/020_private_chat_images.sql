-- Make chat image attachments private and participant-scoped.
-- Existing objects keep their current paths. The app converts legacy public
-- URLs back to object paths and requests signed URLs before rendering.

update storage.buckets
set public = false
where id = 'chat-images';

drop policy if exists "Authenticated users can upload chat images" on storage.objects;
drop policy if exists "Authenticated users can read chat images" on storage.objects;
drop policy if exists "chat-images: approved participants and hosts can read" on storage.objects;
drop policy if exists "chat-images: approved participants and hosts can upload" on storage.objects;

create policy "chat-images: approved participants and hosts can read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'chat-images'
    and exists (
      select 1
      from public.activities a
      where a.id::text = (storage.foldername(name))[1]
        and (
          a.host_id = auth.uid()
          or exists (
            select 1
            from public.participants p
            where p.activity_id = a.id
              and p.user_id = auth.uid()
              and p.status in ('approved', 'joined')
          )
        )
    )
  );

create policy "chat-images: approved participants and hosts can upload"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'chat-images'
    and storage.filename(name) like auth.uid()::text || '-%'
    and exists (
      select 1
      from public.activities a
      where a.id::text = (storage.foldername(name))[1]
        and (
          a.host_id = auth.uid()
          or exists (
            select 1
            from public.participants p
            where p.activity_id = a.id
              and p.user_id = auth.uid()
              and p.status in ('approved', 'joined')
          )
        )
    )
  );
