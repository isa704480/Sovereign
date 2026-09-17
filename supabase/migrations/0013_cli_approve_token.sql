-- FIX: 0012_cli_expiry.sql da cli_approve tokenni yaratmaydi edi.
-- Approve muvaffaqiyatli qaytadi (found=true) lekin token NULL qoladi.
-- CLI poll approved=true, token=null oladi va cheksiz kutadi.

create or replace function public.cli_approve(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  update public.cli_sessions
     set user_id = v_uid,
         approved = true,
         token = coalesce(token, encode(gen_random_bytes(32), 'hex')),
         expires_at = now() + interval '90 days'
   where code = p_code
     and revoked_at is null
     and (approved = false or user_id = v_uid);
  return found;
end;
$$;
revoke all on function public.cli_approve(text) from public;
grant execute on function public.cli_approve(text) to authenticated;
