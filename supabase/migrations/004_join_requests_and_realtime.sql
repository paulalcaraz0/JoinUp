-- Join request lifecycle + realtime support

-- Extend participant status lifecycle
alter table public.participants
  drop constraint if exists participants_status_check;

-- Normalize legacy values after dropping old check.
update public.participants
set status = 'approved'
where status = 'joined';

alter table public.participants
  add constraint participants_status_check
  check (status in ('pending', 'approved', 'rejected', 'cancelled'));

alter table public.participants
  alter column status set default 'pending';

-- Decision scheduling metadata for probabilistic approval flow
alter table public.participants
  add column if not exists decision_due_at timestamptz,
  add column if not exists resolved_at timestamptz;

create index if not exists idx_participants_status_due_at
  on public.participants(status, decision_due_at);

-- Tighten update permissions: users can only cancel their own pending/rejected request
-- (approval/rejection is handled by resolver function below)
drop policy if exists "Users can update own participation" on public.participants;
drop policy if exists "Users can cancel own pending participation" on public.participants;

create policy "Users can cancel own pending participation"
  on public.participants for update
  using (auth.uid() = user_id and status in ('pending', 'rejected'))
  with check (auth.uid() = user_id and status = 'cancelled');

-- Message access must require approved membership (or host)
drop policy if exists "Participants can read messages" on public.messages;

create policy "Participants can read messages"
  on public.messages for select
  using (
    auth.uid() in (
      select user_id
      from public.participants
      where activity_id = messages.activity_id
        and status = 'approved'
    )
    or auth.uid() = (
      select host_id from public.activities where id = messages.activity_id
    )
  );

drop policy if exists "Participants can send messages" on public.messages;

create policy "Participants can send messages"
  on public.messages for insert
  with check (
    auth.uid() = sender_id
    and (
      auth.uid() in (
        select user_id
        from public.participants
        where activity_id = messages.activity_id
          and status = 'approved'
      )
      or auth.uid() = (
        select host_id from public.activities where id = messages.activity_id
      )
    )
  );

-- Notify the host when someone requests to join an approval-required activity.
create or replace function public.notify_host_on_join_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  host_user_id uuid;
  activity_title text;
begin
  if new.status <> 'pending' or new.decision_due_at is not null then
    return new;
  end if;

  select a.host_id, a.title
    into host_user_id, activity_title
  from public.activities a
  where a.id = new.activity_id
    and a.requires_approval = true;

  if host_user_id is null then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, body, activity_id, read)
  values (
    host_user_id,
    'join',
    'New join request',
    coalesce(activity_title, 'An activity') || ' has a new approval request.',
    new.activity_id,
    false
  );

  return new;
end;
$$;

drop trigger if exists on_participant_join_request on public.participants;
create trigger on_participant_join_request
after insert on public.participants
for each row
execute function public.notify_host_on_join_request();

-- Allow hosts to explicitly approve or reject a pending join request.
create or replace function public.respond_to_join_request(
  p_activity_id uuid,
  p_requester_id uuid,
  p_approved boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  host_user_id uuid;
  activity_title text;
  next_status text;
begin
  select a.host_id, a.title
    into host_user_id, activity_title
  from public.activities a
  where a.id = p_activity_id;

  if host_user_id is null or host_user_id <> auth.uid() then
    return false;
  end if;

  next_status := case when p_approved then 'approved' else 'rejected' end;

  update public.participants
  set
    status = next_status,
    resolved_at = now(),
    decision_due_at = null
  where activity_id = p_activity_id
    and user_id = p_requester_id
    and status = 'pending';

  if not found then
    return false;
  end if;

  insert into public.notifications (user_id, type, title, body, activity_id, read)
  values (
    p_requester_id,
    'approval',
    case when p_approved then 'Join request approved' else 'Join request not approved' end,
    case
      when p_approved then coalesce(activity_title, 'Your activity') || ' join request was approved.'
      else coalesce(activity_title, 'Your activity') || ' join request was not approved.'
    end,
    p_activity_id,
    false
  );

  return true;
end;
$$;

grant execute on function public.respond_to_join_request(uuid, uuid, boolean) to authenticated;

-- Keep computed joined_count based on approved members only
create or replace view public.activities_full as
select
  a.*,
  p.display_name as host_name,
  p.photo_url    as host_photo,
  a.max_slots - coalesce(pc.joined_count, 0) as current_slots,
  coalesce(pc.joined_count, 0)                as joined_count,
  coalesce(rc.fire, 0)  as reaction_fire,
  coalesce(rc.heart, 0) as reaction_heart,
  coalesce(rc.like, 0)  as reaction_like
from public.activities a
join public.profiles p on p.id = a.host_id
left join (
  select activity_id, count(*) as joined_count
  from public.participants
  where status = 'approved'
  group by activity_id
) pc on pc.activity_id = a.id
left join (
  select
    activity_id,
    count(*) filter (where type = 'fire')  as fire,
    count(*) filter (where type = 'heart') as heart,
    count(*) filter (where type = 'like')  as like
  from public.reactions
  group by activity_id
) rc on rc.activity_id = a.id;

-- Resolve due pending join requests (70/30 approval split) and emit notifications
create or replace function public.resolve_due_join_requests(
  p_user_id uuid default null,
  p_limit int default 100
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_count int := 0;
begin
  with due as (
    select
      p.id,
      p.user_id,
      p.activity_id,
      case when random() < 0.7 then 'approved' else 'rejected' end as next_status
    from public.participants p
    join public.activities a on a.id = p.activity_id
    where p.status = 'pending'
      and p.decision_due_at is not null
      and p.decision_due_at <= now()
      and a.requires_approval = false
      and (p_user_id is null or p.user_id = p_user_id)
    order by p.decision_due_at asc
    limit p_limit
    for update skip locked
  ),
  updated as (
    update public.participants p
    set
      status = due.next_status,
      resolved_at = now()
    from due
    where p.id = due.id
    returning p.user_id, p.activity_id, p.status
  )
  insert into public.notifications (user_id, type, title, body, activity_id, read)
  select
    u.user_id,
    'approval',
    case
      when u.status = 'approved' then 'Join request approved'
      else 'Join request not approved'
    end,
    case
      when u.status = 'approved' then 'You can now access the group chat.'
      else 'This join request was not approved.'
    end,
    u.activity_id,
    false
  from updated u;

  get diagnostics resolved_count = row_count;
  return resolved_count;
end;
$$;

grant execute on function public.resolve_due_join_requests(uuid, int) to authenticated;

-- Permanent delete for rejected requests (requested UX)
create or replace function public.delete_rejected_join_request(p_activity_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_rows int := 0;
begin
  delete from public.participants
  where activity_id = p_activity_id
    and user_id = auth.uid()
    and status = 'rejected';

  get diagnostics affected_rows = row_count;
  return affected_rows > 0;
end;
$$;

grant execute on function public.delete_rejected_join_request(uuid) to authenticated;

drop policy if exists "Users can insert own notifications" on public.notifications;

create policy "Users can insert own notifications"
  on public.notifications for insert
  with check (auth.uid() = user_id);

-- Realtime streams for pending->approved/rejected transitions + toast notifications
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'participants'
  ) then
    alter publication supabase_realtime add table public.participants;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;
