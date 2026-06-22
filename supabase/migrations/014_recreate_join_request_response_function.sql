-- Recreate the host approval/rejection RPC without rerunning the full join-request migration.

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
