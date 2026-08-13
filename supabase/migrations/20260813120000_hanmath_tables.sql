-- hanmath.com: new public-facing app sharing this Supabase project.
--
-- Guards the existing handle_new_user() trigger so hanmath.com signups (which
-- go through the SAME auth.users table as the existing tutor auth flow) don't
-- also create a spurious row in `tutors`. hanmath's signUp() call must pass
-- { data: { app: 'hanmath' } } as user metadata for this to work -- any signup
-- that doesn't set that flag behaves exactly as before (raw_user_meta_data->>'app'
-- is null, "is distinct from 'hanmath'" is true, tutors insert proceeds as today).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $function$
begin
  if new.raw_user_meta_data->>'app' is distinct from 'hanmath' then
    insert into tutors (id, full_name, email)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'full_name', 'Tutor'),
      new.email
    );
  end if;
  return new;
end;
$function$;

create table public.hanmath_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  plan text not null default 'free' check (plan in ('free', 'subscriber')),
  created_at timestamptz not null default now()
);

create table public.hanmath_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text,
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

create table public.hanmath_usage_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('topic_practice_generated', 'paper_generated')),
  created_at timestamptz not null default now()
);

create index hanmath_subscriptions_user_id_idx on public.hanmath_subscriptions(user_id);
create index hanmath_usage_log_user_id_created_at_idx on public.hanmath_usage_log(user_id, created_at);

alter table public.hanmath_profiles enable row level security;
alter table public.hanmath_subscriptions enable row level security;
alter table public.hanmath_usage_log enable row level security;

-- hanmath_profiles: a user can read and update their own row. Row creation
-- happens only via the signup trigger below (no insert policy for
-- authenticated/anon, so direct client inserts are denied by RLS).
create policy "hanmath_profiles_select_own"
  on public.hanmath_profiles for select
  using (auth.uid() = id);

create policy "hanmath_profiles_update_own"
  on public.hanmath_profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "hanmath_profiles_admin_read"
  on public.hanmath_profiles for select
  using (is_admin());

-- Column-level lock on top of the row-level policy above: a user's own UPDATE
-- may only touch display_name. `plan` gates paid functionality and must never
-- be settable by the user themselves -- it's written by the signup trigger
-- (default 'free') and, going forward, by a service-role process (e.g. a
-- Stripe webhook handler) reacting to hanmath_subscriptions changes, never by
-- the authenticated client.
revoke update on public.hanmath_profiles from authenticated;
grant update (display_name) on public.hanmath_profiles to authenticated;

-- hanmath_subscriptions: a user can read their own subscription status (for an
-- account page), but only service_role may write. No insert/update/delete
-- policy exists for authenticated/anon, so RLS denies those outright -- a
-- write policy here would let a user set their own status/period_end and
-- grant themselves a subscription for free.
create policy "hanmath_subscriptions_select_own"
  on public.hanmath_subscriptions for select
  using (auth.uid() = user_id);

create policy "hanmath_subscriptions_admin_read"
  on public.hanmath_subscriptions for select
  using (is_admin());

-- hanmath_usage_log: a user can read and insert their own rows (insert lets the
-- app log an action client-side and read back "n of N used today"), but never
-- update/delete their own rows -- allowing that would let a user erase their
-- own history to dodge the free-tier rate limit.
create policy "hanmath_usage_log_select_own"
  on public.hanmath_usage_log for select
  using (auth.uid() = user_id);

create policy "hanmath_usage_log_insert_own"
  on public.hanmath_usage_log for insert
  with check (auth.uid() = user_id);

create policy "hanmath_usage_log_admin_read"
  on public.hanmath_usage_log for select
  using (is_admin());

-- Auto-create a hanmath_profiles row (default plan='free') on signup. Fires
-- for every auth.users insert like the existing trigger, but only acts when
-- raw_user_meta_data->>'app' = 'hanmath' -- set by hanmath.com's signUp()
-- call -- so it never fires for the existing tutor signup flow.
create or replace function public.handle_new_hanmath_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.raw_user_meta_data->>'app' = 'hanmath' then
    insert into public.hanmath_profiles (id, display_name, plan)
    values (new.id, new.raw_user_meta_data->>'display_name', 'free');
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created_hanmath
  after insert on auth.users
  for each row execute function public.handle_new_hanmath_user();
