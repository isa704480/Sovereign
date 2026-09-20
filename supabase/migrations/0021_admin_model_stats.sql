-- Admin: model statistikasi — qaysi model ko'p ishlatilgan (assistant xabarlari soni)
-- va "yaxshi ishlayapti" proksi: o'rtacha javob uzunligi (output token) hamda
-- foydalanuvchilar qamrovi. Ma'lumot messages jadvalidan (role='assistant').

create or replace function public.admin_model_stats()
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
      coalesce(nullif(m.model_id, ''), nullif(c.model_id, ''), 'auto') as model_id,
      coalesce(m.input_tokens, 0)  as in_tokens,
      coalesce(m.output_tokens, 0) as out_tokens,
      m.user_id,
      m.created_at
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.role = 'assistant'
      and exists (select 1 from guard)
  ),
  agg as (
    select
      model_id,
      count(*)::int                         as messages,
      count(distinct user_id)::int          as users,
      sum(in_tokens)::bigint                as in_tokens,
      sum(out_tokens)::bigint               as out_tokens,
      (sum(in_tokens) + sum(out_tokens))::bigint as total_tokens,
      round(avg(nullif(out_tokens, 0)))::int as avg_out,
      max(created_at)                        as last_used
    from rows
    group by model_id
  )
  select json_build_object(
    'total_messages', coalesce((select sum(messages) from agg), 0),
    'total_tokens',   coalesce((select sum(total_tokens) from agg), 0),
    'active_models',  coalesce((select count(*) from agg), 0),
    'by_model',       coalesce((select json_agg(t) from (
                        select model_id, messages, users, in_tokens, out_tokens,
                               total_tokens, coalesce(avg_out, 0) as avg_out, last_used
                        from agg
                        order by messages desc, total_tokens desc
                      ) t), '[]'::json)
  );
$$;

revoke all on function public.admin_model_stats() from public;
grant execute on function public.admin_model_stats() to authenticated;
