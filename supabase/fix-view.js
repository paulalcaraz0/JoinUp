const { Client } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required.');
}

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const sql = `
create or replace view public.activities_full as
select
  a.id, a.title, a.description, a.category,
  a.location_name, a.location_lat, a.location_lng,
  a.date_time, a.max_slots, a.cover_image, a.images,
  a.requires_approval, a.status, a.host_id, a.created_at,
  p.display_name as host_name,
  p.photo_url    as host_photo,
  a.max_slots - coalesce(pc.approved_count, 0) as current_slots,
  coalesce(pc.approved_count, 0)               as joined_count,
  coalesce(rc.fire, 0)  as reaction_fire,
  coalesce(rc.heart, 0) as reaction_heart,
  coalesce(rc.like, 0)  as reaction_like
from public.activities a
join public.profiles p on p.id = a.host_id
left join (
  select activity_id, count(*) as approved_count
  from public.participants
  where status in ('joined', 'approved')
  group by activity_id
) pc on pc.activity_id = a.id
left join (
  select activity_id,
    count(*) filter (where type = 'fire')  as fire,
    count(*) filter (where type = 'heart') as heart,
    count(*) filter (where type = 'like')  as like
  from public.reactions
  group by activity_id
) rc on rc.activity_id = a.id;
`;

client.connect()
  .then(() => client.query(sql))
  .then(r => { console.log('View recreated successfully. Command:', r.command); return client.end(); })
  .catch(e => { console.error('Error:', e.message); return client.end(); });
