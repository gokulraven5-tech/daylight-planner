create table if not exists public.planner_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plans jsonb not null default '[]'::jsonb check (jsonb_typeof(plans) = 'array'),
  todos jsonb not null default '[]'::jsonb check (jsonb_typeof(todos) = 'array'),
  updated_at timestamptz not null default now()
);

alter table public.planner_data enable row level security;
alter table public.planner_data force row level security;
grant select, insert, update on public.planner_data to authenticated;

create table if not exists public.planner_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (username ~ '^[a-z0-9_]{3,20}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists planner_profiles_username_lower_key
  on public.planner_profiles (lower(username));

alter table public.planner_profiles enable row level security;
alter table public.planner_profiles force row level security;
grant select, insert, update on public.planner_profiles to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'planner_data'
      and policyname = 'Users can read their own planner data'
  ) then
    create policy "Users can read their own planner data"
      on public.planner_data for select to authenticated
      using ((select auth.uid()) = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'planner_data'
      and policyname = 'Users can create their own planner data'
  ) then
    create policy "Users can create their own planner data"
      on public.planner_data for insert to authenticated
      with check ((select auth.uid()) = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'planner_data'
      and policyname = 'Users can update their own planner data'
  ) then
    create policy "Users can update their own planner data"
      on public.planner_data for update to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'planner_profiles'
      and policyname = 'Users can read their own planner profile'
  ) then
    create policy "Users can read their own planner profile"
      on public.planner_profiles for select to authenticated
      using ((select auth.uid()) = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'planner_profiles'
      and policyname = 'Users can create their own planner profile'
  ) then
    create policy "Users can create their own planner profile"
      on public.planner_profiles for insert to authenticated
      with check ((select auth.uid()) = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'planner_profiles'
      and policyname = 'Users can update their own planner profile'
  ) then
    create policy "Users can update their own planner profile"
      on public.planner_profiles for update to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'planner_data'
  ) then
    alter publication supabase_realtime add table public.planner_data;
  end if;
end
$$;
