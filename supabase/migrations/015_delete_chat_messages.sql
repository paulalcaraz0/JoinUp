-- Allow message deletion through a secure RPC.
-- Senders can delete their own messages. Activity hosts can moderate messages in their activity.

create or replace function public.delete_chat_message(p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_message record;
  affected_rows int := 0;
begin
  select m.id, m.sender_id, m.activity_id, a.host_id
    into target_message
  from public.messages m
  join public.activities a on a.id = m.activity_id
  where m.id = p_message_id;

  if target_message.id is null then
    return false;
  end if;

  if auth.uid() <> target_message.sender_id and auth.uid() <> target_message.host_id then
    return false;
  end if;

  delete from public.messages
  where id = p_message_id;

  get diagnostics affected_rows = row_count;
  return affected_rows > 0;
end;
$$;

grant execute on function public.delete_chat_message(uuid) to authenticated;
