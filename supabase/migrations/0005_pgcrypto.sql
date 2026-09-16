-- gen_random_bytes() (used by the CLI login functions) needs pgcrypto.
create extension if not exists pgcrypto with schema extensions;

-- Make the extension schema visible to the SECURITY DEFINER functions.
alter function public.cli_start(text) set search_path = public, extensions;
alter function public.cli_approve(text) set search_path = public, extensions;
