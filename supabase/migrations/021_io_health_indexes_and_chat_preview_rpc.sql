-- Reduce Disk IO pressure on mobile feed, chat previews, join status, and notifications.

create index if not exists idx_activities_status_date_time
  on public.activities(status, date_time);

create index if not exists idx_participants_user_status_activity
  on public.participants(user_id, status, activity_id);

create index if not exists idx_participants_activity_status_user
  on public.participants(activity_id, status, user_id);

create index if not exists idx_messages_activity_created_desc
  on public.messages(activity_id, created_at desc);

create index if not exists idx_notifications_user_created_desc
  on public.notifications(user_id, created_at desc);

create or replace function public.get_latest_messages_for_activities(p_activity_ids uuid[])
returns table (
  activity_id uuid,
  sender_id uuid,
  sender_name text,
  text text,
  type text,
  created_at timestamptz
)
language sql
stable
set search_path = public
as $$
  select distinct on (m.activity_id)
    m.activity_id,
    m.sender_id,
    p.display_name as sender_name,
    m.text,
    m.type,
    m.created_at
  from public.messages m
  join public.profiles p on p.id = m.sender_id
  where m.activity_id = any(p_activity_ids)
  order by m.activity_id, m.created_at desc;
$$;

grant execute on function public.get_latest_messages_for_activities(uuid[]) to authenticated;
