-- Dodo Payments: webhook idempotency + plan activation until a given date.

create table if not exists public.webhook_events (
  id          text primary key,
  provider    text not null,
  type        text,
  received_at timestamptz not null default now()
);
alter table public.webhook_events enable row level security;
-- No policies: only the service role (webhook handler) touches this table.

-- Sets the plan and extends expiry to at least p_until. Never shortens an
-- existing paid period. Service role only.
create or replace function public.apply_plan_until(
  p_user_id uuid,
  p_plan text,
  p_until timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_plan not in ('starter', 'pro', 'ultra') then
    raise exception 'invalid plan';
  end if;
  if p_until is null or p_until < now() then
    return false;
  end if;
  update public.profiles
     set plan = p_plan,
         plan_expires_at = greatest(coalesce(plan_expires_at, now()), p_until)
   where id = p_user_id;
  return found;
end;
$$;

revoke all on function public.apply_plan_until(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.apply_plan_until(uuid, text, timestamptz) to service_role;
