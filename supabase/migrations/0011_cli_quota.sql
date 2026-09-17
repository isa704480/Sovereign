-- FIX 5: CLI kunlik xabar chegarasini token orqali tekshirish
create or replace function public.cli_messages_today(p_token text)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_uid uuid;
begin
  select user_id into v_uid
    from public.cli_sessions
   where token = p_token and approved_at is not null
   limit 1;
  if v_uid is null then
    return 0;
  end if;
  return (
    select count(*)::int
      from public.messages m
     where m.user_id = v_uid
       and m.role = 'user'
       and m.created_at >= date_trunc('day', now())
  );
end;
$$;

revoke all on function public.cli_messages_today(text) from public;
grant execute on function public.cli_messages_today(text) to anon, authenticated;
