-- SOVEREIGN AI — admin: so'rovnoma javoblari va registratsiya funnel (0044).
--
-- admin_onboarding_full_stats() — onboarding JSON ichidagi barcha savol javoblarini
-- admin uchun foizlar bilan qaytaradi. Faqat is_admin=true bo'lgan foydalanuvchi chaqira oladi.
--
-- Qaytaradi:
--   funnel              — registratsiya → onboarding funnel (jami, onboarding boshlagan, tugatgan)
--   by_purpose          — har maqsad uchun tanlagan foydalanuvchilar soni/foizi
--   by_industry         — har soha uchun
--   by_priority         — har ustuvorlik uchun
--   by_language         — har til uchun
--   by_experience       — 3 zona (beginner/intermediate/expert) bo'yicha
--   by_country          — davlatlar (allaqachon 0020 da bor, lekin bu yerda yangilangan)
--   by_age              — yosh guruhlari
--   recommended_models  — qaysi model tavsiya qilingan (default_model bo'yicha)

create or replace function public.admin_onboarding_full_stats()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_admin boolean;
begin
  -- Admin tekshiruvi
  select coalesce(bool_or(is_admin), false)
    into v_admin
    from public.profiles
   where id = auth.uid();

  if not v_admin then
    raise exception 'admin only';
  end if;

  return (
    with
    -- Barcha profillar
    all_profiles as (
      select
        id,
        onboarding,
        onboarding_completed,
        default_model,
        plan,
        created_at
      from public.profiles
    ),
    -- Onboarding boshlaganlar (jsonb null emas)
    started as (
      select * from all_profiles where onboarding is not null
    ),
    -- Onboarding tugatganlar
    completed as (
      select * from all_profiles where onboarding_completed = true
    ),
    -- Funnel
    funnel_data as (
      select
        (select count(*) from all_profiles)::int        as total_registered,
        (select count(*) from started)::int             as started_onboarding,
        (select count(*) from completed)::int           as completed_onboarding,
        (select count(*) from all_profiles
          where created_at >= now() - interval '7 days')::int  as registered_7d,
        (select count(*) from all_profiles
          where created_at >= now() - interval '30 days')::int as registered_30d,
        (select count(*) from completed
          where (onboarding->>'completedAt')::timestamptz >= now() - interval '30 days')::int as completed_30d
    ),

    -- Maqsadlar (purposes — massiv, har elementni expand qilamiz)
    purpose_rows as (
      select jsonb_array_elements_text(onboarding->'purposes') as purpose
      from completed
      where onboarding ? 'purposes'
    ),
    purpose_totals as (
      select count(distinct id) as base from completed
    ),
    purpose_counts as (
      select purpose, count(*)::int as cnt
      from purpose_rows
      group by purpose
    ),

    -- Sohalar (industries)
    industry_rows as (
      select jsonb_array_elements_text(onboarding->'industries') as industry
      from completed
      where onboarding ? 'industries'
    ),
    industry_counts as (
      select industry, count(*)::int as cnt
      from industry_rows
      group by industry
    ),

    -- Ustuvorliklar (priorities)
    priority_rows as (
      select jsonb_array_elements_text(onboarding->'priorities') as priority
      from completed
      where onboarding ? 'priorities'
    ),
    priority_counts as (
      select priority, count(*)::int as cnt
      from priority_rows
      group by priority
    ),

    -- Tillar (languages)
    language_rows as (
      select jsonb_array_elements_text(onboarding->'languages') as language
      from completed
      where onboarding ? 'languages'
    ),
    language_counts as (
      select language, count(*)::int as cnt
      from language_rows
      group by language
    ),

    -- Tajriba darajasi (experience 0-100 → zona)
    experience_rows as (
      select
        case
          when (onboarding->>'experience')::int >= 67 then 'expert'
          when (onboarding->>'experience')::int >= 34 then 'intermediate'
          else 'beginner'
        end as zone
      from completed
      where onboarding ? 'experience'
        and (onboarding->>'experience') ~ '^[0-9]+$'
    ),
    experience_counts as (
      select zone, count(*)::int as cnt
      from experience_rows
      group by zone
    ),

    -- Davlatlar
    country_counts as (
      select
        upper(nullif(trim(onboarding->>'country'), '')) as country,
        count(*)::int as cnt
      from completed
      where onboarding ? 'country'
        and nullif(trim(onboarding->>'country'), '') is not null
        and onboarding->>'country' != 'other'
      group by 1
      order by 2 desc
    ),

    -- Yosh guruhlari
    age_counts as (
      select
        nullif(trim(onboarding->>'ageGroup'), '') as age_group,
        count(*)::int as cnt
      from completed
      where onboarding ? 'ageGroup'
        and nullif(trim(onboarding->>'ageGroup'), '') is not null
      group by 1
    ),

    -- Tavsiya qilingan modellar
    model_counts as (
      select
        coalesce(nullif(default_model, ''), 'unknown') as model,
        count(*)::int as cnt
      from completed
      group by 1
      order by 2 desc
    ),

    -- Tarif bo'yicha ro'yxatdan o'tganlar
    plan_counts as (
      select
        coalesce(plan, 'free') as plan,
        count(*)::int          as cnt
      from all_profiles
      group by 1
    ),

    -- Baza (foiz hisoblash uchun)
    base as (select count(*)::int as n from completed)

    select json_build_object(
      -- Funnel
      'funnel', (select row_to_json(f) from funnel_data f),

      -- Maqsadlar
      'by_purpose', coalesce((
        select json_agg(json_build_object(
          'id',   p.purpose,
          'cnt',  p.cnt,
          'pct',  round((p.cnt::numeric / nullif(b.n, 0) * 100), 1)
        ) order by p.cnt desc)
        from purpose_counts p, base b
      ), '[]'::json),

      -- Sohalar
      'by_industry', coalesce((
        select json_agg(json_build_object(
          'id',   i.industry,
          'cnt',  i.cnt,
          'pct',  round((i.cnt::numeric / nullif(b.n, 0) * 100), 1)
        ) order by i.cnt desc)
        from industry_counts i, base b
      ), '[]'::json),

      -- Ustuvorliklar
      'by_priority', coalesce((
        select json_agg(json_build_object(
          'id',   p.priority,
          'cnt',  p.cnt,
          'pct',  round((p.cnt::numeric / nullif(b.n, 0) * 100), 1)
        ) order by p.cnt desc)
        from priority_counts p, base b
      ), '[]'::json),

      -- Tillar
      'by_language', coalesce((
        select json_agg(json_build_object(
          'id',   l.language,
          'cnt',  l.cnt,
          'pct',  round((l.cnt::numeric / nullif(b.n, 0) * 100), 1)
        ) order by l.cnt desc)
        from language_counts l, base b
      ), '[]'::json),

      -- Tajriba
      'by_experience', coalesce((
        select json_agg(json_build_object(
          'zone', e.zone,
          'cnt',  e.cnt,
          'pct',  round((e.cnt::numeric / nullif(b.n, 0) * 100), 1)
        ) order by e.cnt desc)
        from experience_counts e, base b
      ), '[]'::json),

      -- Davlatlar (top-20)
      'by_country', coalesce((
        select json_agg(json_build_object(
          'country', c.country,
          'cnt',     c.cnt,
          'pct',     round((c.cnt::numeric / nullif(b.n, 0) * 100), 1)
        ))
        from (select * from country_counts limit 20) c, base b
      ), '[]'::json),

      -- Yosh guruhlari
      'by_age', coalesce((
        select json_agg(json_build_object(
          'age_group', a.age_group,
          'cnt',       a.cnt,
          'pct',       round((a.cnt::numeric / nullif(b.n, 0) * 100), 1)
        ) order by array_position(
          array['u18','18-24','25-34','35-44','45-54','55+'], a.age_group
        ))
        from age_counts a, base b
      ), '[]'::json),

      -- Tavsiya qilingan modellar
      'recommended_models', coalesce((
        select json_agg(json_build_object(
          'model', m.model,
          'cnt',   m.cnt,
          'pct',   round((m.cnt::numeric / nullif(b.n, 0) * 100), 1)
        ))
        from (select * from model_counts limit 10) m, base b
      ), '[]'::json),

      -- Tarif bo'yicha (registration funnel'ga qo'shimcha)
      'by_plan', coalesce((
        select json_agg(json_build_object(
          'plan', pc.plan,
          'cnt',  pc.cnt
        ) order by pc.cnt desc)
        from plan_counts pc
      ), '[]'::json),

      -- Umumiy tugagan so'rovnoma
      'total_completed', (select n from base)
    )
  );
end;
$$;

revoke all on function public.admin_onboarding_full_stats() from public, anon;
grant execute on function public.admin_onboarding_full_stats() to authenticated;

comment on function public.admin_onboarding_full_stats() is
  'Admin: so''rovnoma javoblari foizlari + registratsiya funnel. Faqat is_admin=true.';
