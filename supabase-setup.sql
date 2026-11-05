create table if not exists public.planner_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plans jsonb not null default '[]'::jsonb check (jsonb_typeof(plans) = 'array'),
  todos jsonb not null default '[]'::jsonb check (jsonb_typeof(todos) = 'array'),
  updated_at timestamptz not null default now()
);

alter table public.planner_data enable row level security;
alter table public.planner_data force row level security;

grant select, insert, update on public.planner_data to authenticated;

drop policy if exists "Users can read their own planner data" on public.planner_data;
create policy "Users can read their own planner data"
  on public.planner_data for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own planner data" on public.planner_data;
create policy "Users can create their own planner data"
  on public.planner_data for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own planner data" on public.planner_data;
create policy "Users can update their own planner data"
  on public.planner_data for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

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

drop policy if exists "Users can read their own planner profile" on public.planner_profiles;
create policy "Users can read their own planner profile"
  on public.planner_profiles for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own planner profile" on public.planner_profiles;
create policy "Users can create their own planner profile"
  on public.planner_profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own planner profile" on public.planner_profiles;
create policy "Users can update their own planner profile"
  on public.planner_profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter table public.planner_data replica identity full;
alter table public.planner_profiles replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'planner_data'
  ) then
    alter publication supabase_realtime add table public.planner_data;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'planner_profiles'
  ) then
    alter publication supabase_realtime add table public.planner_profiles;
  end if;
end
$$;

create table if not exists public.planner_collab_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.planner_collab_members (
  list_id uuid not null references public.planner_collab_lists (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (list_id, user_id)
);

create table if not exists public.planner_collab_tasks (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.planner_collab_lists (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  done boolean not null default false,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists planner_collab_members_user_id_idx
  on public.planner_collab_members (user_id);
create index if not exists planner_collab_tasks_list_id_created_at_idx
  on public.planner_collab_tasks (list_id, created_at);

alter table public.planner_collab_lists enable row level security;
alter table public.planner_collab_lists force row level security;
alter table public.planner_collab_members enable row level security;
alter table public.planner_collab_members force row level security;
alter table public.planner_collab_tasks enable row level security;
alter table public.planner_collab_tasks force row level security;

create or replace function public.is_planner_collab_member(p_list_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.planner_collab_members m
    where m.list_id = p_list_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.create_planner_collab_list(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_list_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to create a shared list.';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 60 then
    raise exception 'List names must be between 1 and 60 characters.';
  end if;

  insert into public.planner_collab_lists (name, owner_id)
  values (btrim(p_name), (select auth.uid()))
  returning id into new_list_id;

  insert into public.planner_collab_members (list_id, user_id, role)
  values (new_list_id, (select auth.uid()), 'owner');

  return new_list_id;
end;
$$;

create or replace function public.invite_planner_collab_user(p_list_id uuid, p_username text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  invited_user_id uuid;
  invited_username text;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to invite someone.';
  end if;
  if not exists (
    select 1
    from public.planner_collab_lists l
    where l.id = p_list_id
      and l.owner_id = (select auth.uid())
  ) then
    raise exception 'Only the list creator can invite people.';
  end if;

  select p.user_id, p.username
  into invited_user_id, invited_username
  from public.planner_profiles p
  where lower(p.username) = lower(btrim(trim(leading '@' from p_username)))
  limit 1;

  if invited_user_id is null then
    raise exception 'No account has that username.';
  end if;
  if invited_user_id = (select auth.uid()) then
    raise exception 'You are already the creator of this list.';
  end if;
  if exists (
    select 1
    from public.planner_collab_members m
    where m.list_id = p_list_id
      and m.user_id = invited_user_id
  ) then
    raise exception 'That person is already in this list.';
  end if;

  insert into public.planner_collab_members (list_id, user_id, role)
  values (p_list_id, invited_user_id, 'member');

  return invited_username;
end;
$$;

create or replace function public.list_planner_collab_members(p_list_id uuid)
returns table (user_id uuid, username text, role text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_planner_collab_member(p_list_id) then
    raise exception 'You are not a member of this list.';
  end if;

  return query
  select m.user_id, p.username, m.role
  from public.planner_collab_members m
  join public.planner_profiles p on p.user_id = m.user_id
  where m.list_id = p_list_id
  order by case when m.role = 'owner' then 0 else 1 end, lower(p.username);
end;
$$;

revoke all on function public.is_planner_collab_member(uuid) from public;
revoke all on function public.create_planner_collab_list(text) from public;
revoke all on function public.invite_planner_collab_user(uuid, text) from public;
revoke all on function public.list_planner_collab_members(uuid) from public;
grant execute on function public.is_planner_collab_member(uuid) to authenticated;
grant execute on function public.create_planner_collab_list(text) to authenticated;
grant execute on function public.invite_planner_collab_user(uuid, text) to authenticated;
grant execute on function public.list_planner_collab_members(uuid) to authenticated;

grant select, update, delete on public.planner_collab_lists to authenticated;
grant select, delete on public.planner_collab_members to authenticated;
grant select, insert, update (title, done), delete on public.planner_collab_tasks to authenticated;
grant insert (list_id, title, done, created_by) on public.planner_collab_tasks to authenticated;

drop policy if exists "Members can read their shared lists" on public.planner_collab_lists;
create policy "Members can read their shared lists"
  on public.planner_collab_lists for select to authenticated
  using (public.is_planner_collab_member(id));

drop policy if exists "Creators can update their shared lists" on public.planner_collab_lists;
create policy "Creators can update their shared lists"
  on public.planner_collab_lists for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "Creators can delete their shared lists" on public.planner_collab_lists;
create policy "Creators can delete their shared lists"
  on public.planner_collab_lists for delete to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "Members can read shared-list membership" on public.planner_collab_members;
create policy "Members can read shared-list membership"
  on public.planner_collab_members for select to authenticated
  using (public.is_planner_collab_member(list_id));

drop policy if exists "Creators or members can leave a shared list" on public.planner_collab_members;
create policy "Creators or members can leave a shared list"
  on public.planner_collab_members for delete to authenticated
  using (
    role = 'member'
    and (
      user_id = (select auth.uid())
      or exists (
        select 1
        from public.planner_collab_lists l
        where l.id = list_id
          and l.owner_id = (select auth.uid())
      )
    )
  );

drop policy if exists "Members can read shared tasks" on public.planner_collab_tasks;
create policy "Members can read shared tasks"
  on public.planner_collab_tasks for select to authenticated
  using (public.is_planner_collab_member(list_id));

drop policy if exists "Members can add shared tasks" on public.planner_collab_tasks;
create policy "Members can add shared tasks"
  on public.planner_collab_tasks for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and public.is_planner_collab_member(list_id)
  );

drop policy if exists "Members can update shared tasks" on public.planner_collab_tasks;
create policy "Members can update shared tasks"
  on public.planner_collab_tasks for update to authenticated
  using (public.is_planner_collab_member(list_id))
  with check (public.is_planner_collab_member(list_id));

drop policy if exists "Members can delete shared tasks" on public.planner_collab_tasks;
create policy "Members can delete shared tasks"
  on public.planner_collab_tasks for delete to authenticated
  using (public.is_planner_collab_member(list_id));

alter table public.planner_collab_lists replica identity full;
alter table public.planner_collab_members replica identity full;
alter table public.planner_collab_tasks replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'planner_collab_lists'
  ) then
    alter publication supabase_realtime add table public.planner_collab_lists;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'planner_collab_members'
  ) then
    alter publication supabase_realtime add table public.planner_collab_members;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'planner_collab_tasks'
  ) then
    alter publication supabase_realtime add table public.planner_collab_tasks;
  end if;
end
$$;
