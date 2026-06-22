-- Add a simple moderation workflow for reported content.
-- Normal users can still only see their own reports through existing RLS.
-- Supabase service-role/admin access can review and update these fields.

alter table public.content_reports
  add column if not exists status text not null default 'open'
    check (status in ('open', 'reviewing', 'actioned', 'dismissed')),
  add column if not exists reviewer_notes text,
  add column if not exists reviewed_at timestamptz;

create index if not exists idx_content_reports_status_created
  on public.content_reports(status, created_at desc);
