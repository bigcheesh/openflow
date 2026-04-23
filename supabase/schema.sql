create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'OpenFlow Pilot',
  openrouter_api_key text not null default '',
  selected_model text not null default 'openflow',
  temperature numeric(3,2) not null default 0.7,
  max_tokens integer not null default 900,
  save_key_to_cloud boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'New chat',
  selected_model text not null default 'openflow',
  messages jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.chat_threads enable row level security;

create policy "profiles are readable by owner"
on public.profiles
for select
using (auth.uid() = id);

create policy "profiles are writable by owner"
on public.profiles
for all
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "settings are readable by owner"
on public.user_settings
for select
using (auth.uid() = user_id);

create policy "settings are writable by owner"
on public.user_settings
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "chat threads are readable by owner"
on public.chat_threads
for select
using (auth.uid() = user_id);

create policy "chat threads are writable by owner"
on public.chat_threads
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
