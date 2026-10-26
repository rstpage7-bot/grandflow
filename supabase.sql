-- NEXORA Supabase schema
-- Run the whole file in Supabase Dashboard > SQL Editor.
-- Regular users can manage only their own projects. Admins can view/manage all projects.
-- Do not place service_role / secret keys in browser code.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'user')
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  description text not null default '',
  status text not null default 'مخطط' check (status in ('مخطط','قيد التنفيذ','مكتمل','متوقف')),
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  is_done boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;

-- SECURITY DEFINER helper avoids recursive RLS checks on profiles.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

grant execute on function public.is_admin() to authenticated;

-- Profiles: users may read their own profile; admins can read all profiles.
drop policy if exists "Profiles are visible to self and admins" on public.profiles;
create policy "Profiles are visible to self and admins"
on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select public.is_admin()));

-- Role changes are intentionally not allowed from client-side update policies.
-- Projects: owner or admin may read/update/delete; insert only for self or admin.
drop policy if exists "Project read own or admin" on public.projects;
create policy "Project read own or admin"
on public.projects for select to authenticated
using (owner_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "Project insert own" on public.projects;
create policy "Project insert own"
on public.projects for insert to authenticated
with check (owner_id = (select auth.uid()));

drop policy if exists "Project update own or admin" on public.projects;
create policy "Project update own or admin"
on public.projects for update to authenticated
using (owner_id = (select auth.uid()) or (select public.is_admin()))
with check (owner_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "Project delete own or admin" on public.projects;
create policy "Project delete own or admin"
on public.projects for delete to authenticated
using (owner_id = (select auth.uid()) or (select public.is_admin()));

-- Tasks follow the project owner/admin permissions.
drop policy if exists "Task read own or admin" on public.tasks;
create policy "Task read own or admin"
on public.tasks for select to authenticated
using (exists (
  select 1 from public.projects p
  where p.id = project_id and (
    p.owner_id = (select auth.uid()) or (select public.is_admin())
  )
));

drop policy if exists "Task insert own project" on public.tasks;
create policy "Task insert own project"
on public.tasks for insert to authenticated
with check (
  owner_id = (select auth.uid()) and exists (
    select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())
  )
);

drop policy if exists "Task update own or admin" on public.tasks;
create policy "Task update own or admin"
on public.tasks for update to authenticated
using (exists (
  select 1 from public.projects p where p.id = project_id and (
    p.owner_id = (select auth.uid()) or (select public.is_admin())
  )
))
with check (exists (
  select 1 from public.projects p where p.id = project_id and (
    p.owner_id = (select auth.uid()) or (select public.is_admin())
  )
));

drop policy if exists "Task delete own or admin" on public.tasks;
create policy "Task delete own or admin"
on public.tasks for delete to authenticated
using (exists (
  select 1 from public.projects p where p.id = project_id and (
    p.owner_id = (select auth.uid()) or (select public.is_admin())
  )
));

create index if not exists projects_owner_id_idx on public.projects(owner_id);
create index if not exists projects_created_at_idx on public.projects(created_at desc);
create index if not exists tasks_project_id_idx on public.tasks(project_id);

-- After creating your account, promote it to admin manually in SQL Editor:
-- update public.profiles set role = 'admin' where email = 'YOUR_EMAIL@example.com';
