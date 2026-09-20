-- Admin: onboarding statistikasi — davlatlar bo'yicha ro'yxatdan o'tganlar soni,
-- yosh guruhlari taqsimoti va o'rtacha yosh (guruh o'rtalari bo'yicha taxmin).
-- Ma'lumot profiles.onboarding JSON ichida: {"country":"UZ","ageGroup":"25-34",...}

create or replace function public.admin_onboarding_stats()
returns json
language sql
stable
security definer
set search_path = public
as $$
  with guard as (
    select 1 from public.profiles pp where pp.id = auth.uid() and pp.is_admin = true
  ),
  rows as (
    select
      nullif(upper(p.onboarding->>'country'), '') as country,
      nullif(p.onboarding->>'ageGroup', '')       as age_group,
      p.created_at
    from public.profiles p
    where exists (select 1 from guard)
  ),
  age_mid as (
    select age_group,
      case age_group
        when 'u18'   then 16
        when '18-24' then 21
        when '25-34' then 29.5
        when '35-44' then 39.5
        when '45-54' then 49.5
        when '55+'   then 60
        else null end as mid
    from rows where age_group is not null
  )
  select json_build_object(
    'total_users',      (select count(*) from rows),
    'with_country',     (select count(*) from rows where country is not null),
    'with_age',         (select count(*) from rows where age_group is not null),
    'avg_age',          (select round(avg(mid)::numeric, 1) from age_mid where mid is not null),
    'by_country',       coalesce((select json_agg(t) from (
                          select country, count(*)::int as users
                          from rows where country is not null
                          group by country order by users desc, country
                        ) t), '[]'::json),
    'by_age',           coalesce((select json_agg(t) from (
                          select age_group, count(*)::int as users
                          from rows where age_group is not null
                          group by age_group
                          order by array_position(array['u18','18-24','25-34','35-44','45-54','55+'], age_group)
                        ) t), '[]'::json),
    'signups_30d',      (select count(*) from rows where created_at >= now() - interval '30 days')
  );
$$;

revoke all on function public.admin_onboarding_stats() from public;
grant execute on function public.admin_onboarding_stats() to authenticated;
