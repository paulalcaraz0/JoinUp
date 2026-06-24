-- User ratings after completed shared activities.

create table if not exists public.user_ratings (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  rater_id uuid not null references public.profiles(id) on delete cascade,
  rated_user_id uuid not null references public.profiles(id) on delete cascade,
  score int not null check (score between 1 and 5),
  comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (activity_id, rater_id, rated_user_id),
  check (rater_id <> rated_user_id)
);

alter table public.user_ratings enable row level security;

create index if not exists idx_user_ratings_rated_user
  on public.user_ratings(rated_user_id);

create index if not exists idx_user_ratings_rater
  on public.user_ratings(rater_id);

drop policy if exists "Users can view relevant ratings" on public.user_ratings;
create policy "Users can view relevant ratings"
  on public.user_ratings for select
  using (auth.uid() = rater_id or auth.uid() = rated_user_id);

create or replace function public.touch_user_rating_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_user_rating_updated_at on public.user_ratings;
create trigger touch_user_rating_updated_at
before update on public.user_ratings
for each row
execute function public.touch_user_rating_updated_at();

create or replace function public.prevent_own_profile_rating_change()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() = new.id and (
    new.rating is distinct from old.rating
    or new.rating_count is distinct from old.rating_count
  ) then
    raise exception 'Profile ratings can only be changed by rating submissions';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_own_profile_rating_change on public.profiles;
create trigger prevent_own_profile_rating_change
before update on public.profiles
for each row
execute function public.prevent_own_profile_rating_change();

create or replace function public.submit_user_rating(
  p_activity_id uuid,
  p_rated_user_id uuid,
  p_score int,
  p_comment text default ''
)
returns table (
  rating numeric,
  rating_count int,
  score int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  rater_user_id uuid := auth.uid();
  activity_record public.activities%rowtype;
  rater_is_approved_participant boolean;
  rated_is_approved_participant boolean;
begin
  if rater_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_rated_user_id is null or p_activity_id is null then
    raise exception 'Activity and rated user are required';
  end if;

  if rater_user_id = p_rated_user_id then
    raise exception 'You cannot rate yourself';
  end if;

  if p_score < 1 or p_score > 5 then
    raise exception 'Rating must be between 1 and 5';
  end if;

  select *
    into activity_record
  from public.activities
  where id = p_activity_id
    and status = 'completed';

  if not found then
    raise exception 'Ratings are only allowed after a completed activity';
  end if;

  select exists (
    select 1
    from public.participants
    where activity_id = p_activity_id
      and user_id = rater_user_id
      and status = 'approved'
  )
    into rater_is_approved_participant;

  select exists (
    select 1
    from public.participants
    where activity_id = p_activity_id
      and user_id = p_rated_user_id
      and status = 'approved'
  )
    into rated_is_approved_participant;

  if not (
    (activity_record.host_id = rater_user_id and rated_is_approved_participant)
    or (activity_record.host_id = p_rated_user_id and rater_is_approved_participant)
    or (rater_is_approved_participant and rated_is_approved_participant)
  ) then
    raise exception 'You can only rate people from a completed activity you shared';
  end if;

  if exists (
    select 1
    from public.user_ratings
    where activity_id = p_activity_id
      and rater_id = rater_user_id
      and rated_user_id = p_rated_user_id
  ) then
    raise exception 'You have already rated this user for this activity';
  end if;

  insert into public.user_ratings (activity_id, rater_id, rated_user_id, score, comment)
  values (p_activity_id, rater_user_id, p_rated_user_id, p_score, left(coalesce(p_comment, ''), 500));

  update public.profiles p
  set
    rating = coalesce((
      select round(avg(ur.score)::numeric, 2)
      from public.user_ratings ur
      where ur.rated_user_id = p_rated_user_id
    ), 0),
    rating_count = (
      select count(*)::int
      from public.user_ratings ur
      where ur.rated_user_id = p_rated_user_id
    )
  where p.id = p_rated_user_id;

  return query
  select p.rating, p.rating_count, p_score
  from public.profiles p
  where p.id = p_rated_user_id;
end;
$$;

revoke execute on function public.submit_user_rating(uuid, uuid, int, text) from public;
grant execute on function public.submit_user_rating(uuid, uuid, int, text) to authenticated;
