-- Enforce one rating per rated user, not one per activity.

with ranked_ratings as (
  select
    id,
    row_number() over (
      partition by rater_id, rated_user_id
      order by created_at asc, id asc
    ) as rating_rank
  from public.user_ratings
)
delete from public.user_ratings
where id in (
  select id
  from ranked_ratings
  where rating_rank > 1
);

alter table public.user_ratings
  drop constraint if exists user_ratings_activity_id_rater_id_rated_user_id_key;

create unique index if not exists idx_user_ratings_one_per_user_pair
  on public.user_ratings(rater_id, rated_user_id);

update public.profiles p
set
  rating = coalesce(ratings.average_score, 0),
  rating_count = coalesce(ratings.rating_count, 0)
from (
  select
    rated_user_id,
    round(avg(score)::numeric, 2) as average_score,
    count(*)::int as rating_count
  from public.user_ratings
  group by rated_user_id
) ratings
where p.id = ratings.rated_user_id;

update public.profiles p
set
  rating = 0,
  rating_count = 0
where not exists (
  select 1
  from public.user_ratings ur
  where ur.rated_user_id = p.id
);

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
    where rater_id = rater_user_id
      and rated_user_id = p_rated_user_id
  ) then
    raise exception 'You have already rated this user';
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

grant execute on function public.submit_user_rating(uuid, uuid, int, text) to authenticated;
