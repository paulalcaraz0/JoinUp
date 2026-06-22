-- Keep account emails private while preserving duplicate-email checks.

alter table public.profiles
  add column if not exists location text not null default '',
  add column if not exists activities_joined text[] not null default '{}';

create or replace function public.email_is_registered(input_email text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where lower(email) = lower(input_email)
  );
$$;

grant execute on function public.email_is_registered(text) to anon, authenticated;

revoke select (email) on public.profiles from anon, authenticated;

grant select (
  id,
  display_name,
  photo_url,
  bio,
  location,
  age_range,
  interests,
  activities_joined,
  rating,
  rating_count,
  created_at
) on public.profiles to anon, authenticated;
