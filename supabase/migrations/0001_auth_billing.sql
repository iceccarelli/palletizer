-- Palletizer — auth + billing foundation
-- Run in the Supabase SQL editor (or via the Supabase CLI) once.
-- Assumes Supabase Auth is enabled (auth.users exists).

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user, holds tier + Stripe customer link.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  email              text,
  tier               text not null default 'free' check (tier in ('free','pro','enterprise')),
  stripe_customer_id text unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- subscriptions: mirror of Stripe subscription state (written by webhook).
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  stripe_subscription_id text unique not null,
  stripe_customer_id     text,
  status                 text not null,
  price_id               text,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists subscriptions_user_id_idx on public.subscriptions(user_id);

alter table public.subscriptions enable row level security;

-- Users may read their own subscription. Writes happen only via the service
-- role (Stripe webhook), which bypasses RLS — so no insert/update policy here.
drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own" on public.subscriptions
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- leads: enterprise / sales inquiries (written by service role via /api/leads).
-- ---------------------------------------------------------------------------
create table if not exists public.leads (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null,
  company    text,
  volume     text,
  message    text,
  source     text,
  created_at timestamptz not null default now()
);

alter table public.leads enable row level security;
-- No policies: only the service role (server) can read/write leads.
