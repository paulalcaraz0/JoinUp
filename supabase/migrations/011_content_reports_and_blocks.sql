-- Add basic user-generated-content safety controls for store review.

create table if not exists public.user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_user_id),
  check (blocker_id <> blocked_user_id)
);

alter table public.user_blocks enable row level security;

drop policy if exists "Users can view own blocks" on public.user_blocks;
create policy "Users can view own blocks"
  on public.user_blocks for select
  using (auth.uid() = blocker_id);

drop policy if exists "Users can create own blocks" on public.user_blocks;
create policy "Users can create own blocks"
  on public.user_blocks for insert
  with check (auth.uid() = blocker_id);

drop policy if exists "Users can remove own blocks" on public.user_blocks;
create policy "Users can remove own blocks"
  on public.user_blocks for delete
  using (auth.uid() = blocker_id);

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid references public.profiles(id) on delete set null,
  activity_id uuid references public.activities(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  reason text not null default 'chat_safety',
  details text not null default '',
  status text not null default 'open' check (status in ('open', 'reviewed', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);

alter table public.content_reports enable row level security;

drop policy if exists "Users can create own content reports" on public.content_reports;
create policy "Users can create own content reports"
  on public.content_reports for insert
  with check (auth.uid() = reporter_id);

drop policy if exists "Users can view own content reports" on public.content_reports;
create policy "Users can view own content reports"
  on public.content_reports for select
  using (auth.uid() = reporter_id);

create index if not exists idx_user_blocks_blocker on public.user_blocks(blocker_id);
create index if not exists idx_content_reports_status on public.content_reports(status, created_at);
create index if not exists idx_content_reports_activity on public.content_reports(activity_id);
