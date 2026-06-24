-- Identity verification requests.
-- ID images are stored in a private bucket. Only safe status is exposed on profiles.

alter table public.profiles
  add column if not exists verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'pending', 'verified', 'rejected'));

create table if not exists public.identity_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  document_path text not null,
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'rejected')),
  reviewer_notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_identity_verifications_user_created
  on public.identity_verifications(user_id, created_at desc);

alter table public.identity_verifications enable row level security;

drop policy if exists "Users can view own identity verification requests" on public.identity_verifications;
create policy "Users can view own identity verification requests"
  on public.identity_verifications for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create own identity verification requests" on public.identity_verifications;
create policy "Users can create own identity verification requests"
  on public.identity_verifications for insert
  with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('identity-verifications', 'identity-verifications', false)
on conflict (id) do update set public = false;

drop policy if exists "identity-verifications: owner upload" on storage.objects;
create policy "identity-verifications: owner upload"
  on storage.objects for insert
  with check (
    bucket_id = 'identity-verifications'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "identity-verifications: owner read" on storage.objects;
create policy "identity-verifications: owner read"
  on storage.objects for select
  using (
    bucket_id = 'identity-verifications'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create or replace function public.prevent_client_verification_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role'
    and current_setting('app.allow_verification_status_change', true) <> 'true'
    and new.verification_status is distinct from old.verification_status then
    raise exception 'verification_status cannot be changed directly';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_client_verification_status_change on public.profiles;
create trigger prevent_client_verification_status_change
before update on public.profiles
for each row
execute function public.prevent_client_verification_status_change();

create or replace function public.submit_identity_verification(p_document_path text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
begin
  target_user_id := auth.uid();

  if target_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_document_path is null
    or p_document_path = ''
    or split_part(p_document_path, '/', 1) <> target_user_id::text then
    raise exception 'Invalid document path';
  end if;

  insert into public.identity_verifications (user_id, document_path, status)
  values (target_user_id, p_document_path, 'pending');

  perform set_config('app.allow_verification_status_change', 'true', true);

  update public.profiles
  set verification_status = 'pending'
  where id = target_user_id;

  return true;
end;
$$;

grant execute on function public.submit_identity_verification(text) to authenticated;

create or replace function public.review_identity_verification(
  p_request_id uuid,
  p_status text,
  p_reviewer_notes text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
begin
  if p_status not in ('verified', 'rejected') then
    raise exception 'Invalid review status';
  end if;

  update public.identity_verifications
  set
    status = p_status,
    reviewer_notes = p_reviewer_notes,
    reviewed_at = now()
  where id = p_request_id
    and status = 'pending'
  returning user_id into target_user_id;

  if target_user_id is null then
    return false;
  end if;

  perform set_config('app.allow_verification_status_change', 'true', true);

  update public.profiles
  set verification_status = p_status
  where id = target_user_id;

  return true;
end;
$$;

revoke execute on function public.review_identity_verification(uuid, text, text) from public, anon, authenticated;
grant execute on function public.review_identity_verification(uuid, text, text) to service_role;
