-- Pulse community chat starter schema
-- Run this entire file in Supabase Dashboard -> SQL Editor.
-- Safe to run once on a new project. Do not expose service_role keys in the frontend.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null default 'member' check (char_length(username) between 1 and 32),
  created_at timestamptz not null default now()
);

create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 48),
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 10)),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.community_members (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  primary key (community_id, user_id)
);

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  name text not null default 'general' check (char_length(name) between 1 and 48),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists community_members_user_id_idx on public.community_members(user_id);
create index if not exists channels_community_id_idx on public.channels(community_id);
create index if not exists messages_channel_created_idx on public.messages(channel_id, created_at);

-- A security-definer helper prevents recursive RLS checks on community_members.
create or replace function public.is_community_member(target_community uuid, target_user uuid default auth.uid())
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.community_members cm
    where cm.community_id = target_community and cm.user_id = target_user
  );
$$;

revoke all on function public.is_community_member(uuid, uuid) from public;
grant execute on function public.is_community_member(uuid, uuid) to authenticated;

-- Create the profile at signup. Username is taken from sign-up user metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    left(coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), split_part(new.email, '@', 1), 'member'), 32)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Community creation is atomic: community, owner membership, and #general all together.
create or replace function public.create_community(community_name text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  new_community_id uuid;
  clean_name text := trim(community_name);
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  if clean_name is null or char_length(clean_name) < 1 or char_length(clean_name) > 48 then
    raise exception 'Community name must be 1–48 characters.';
  end if;

  insert into public.communities (name, owner_id)
  values (clean_name, auth.uid())
  returning id into new_community_id;

  insert into public.community_members (community_id, user_id, role)
  values (new_community_id, auth.uid(), 'owner');

  insert into public.channels (community_id, name, created_by)
  values (new_community_id, 'general', auth.uid());

  return new_community_id;
end;
$$;

revoke all on function public.create_community(text) from public;
grant execute on function public.create_community(text) to authenticated;

create or replace function public.join_community(code text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  target_id uuid;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  select c.id into target_id from public.communities c
  where c.invite_code = upper(trim(code))
  limit 1;

  if target_id is null then raise exception 'Invite code not found.'; end if;

  insert into public.community_members (community_id, user_id, role)
  values (target_id, auth.uid(), 'member')
  on conflict (community_id, user_id) do nothing;

  return target_id;
end;
$$;

revoke all on function public.join_community(text) from public;
grant execute on function public.join_community(text) to authenticated;

alter table public.profiles enable row level security;
alter table public.communities enable row level security;
alter table public.community_members enable row level security;
alter table public.channels enable row level security;
alter table public.messages enable row level security;

-- Profiles are visible to signed-in users so chat names can be rendered.
drop policy if exists "Signed-in users can read profiles" on public.profiles;
create policy "Signed-in users can read profiles" on public.profiles
for select to authenticated using (true);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "Members can read their communities" on public.communities;
create policy "Members can read their communities" on public.communities
for select to authenticated using (public.is_community_member(id));

drop policy if exists "Members can read community memberships" on public.community_members;
create policy "Members can read community memberships" on public.community_members
for select to authenticated using (user_id = auth.uid() or public.is_community_member(community_id));

drop policy if exists "Members can read channels" on public.channels;
create policy "Members can read channels" on public.channels
for select to authenticated using (public.is_community_member(community_id));

drop policy if exists "Members can read messages" on public.messages;
create policy "Members can read messages" on public.messages
for select to authenticated using (
  exists (
    select 1 from public.channels ch
    where ch.id = messages.channel_id
      and public.is_community_member(ch.community_id)
  )
);

drop policy if exists "Members can send messages as themselves" on public.messages;
create policy "Members can send messages as themselves" on public.messages
for insert to authenticated with check (
  user_id = auth.uid()
  and char_length(trim(content)) between 1 and 4000
  and exists (
    select 1 from public.channels ch
    where ch.id = messages.channel_id
      and public.is_community_member(ch.community_id)
  )
);

drop policy if exists "Users can edit their own messages" on public.messages;
create policy "Users can edit their own messages" on public.messages
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Users can delete their own messages" on public.messages;
create policy "Users can delete their own messages" on public.messages
for delete to authenticated using (user_id = auth.uid());

-- Allow new community members to read the community record after joining via the RPC.
-- Invite codes are only exposed to existing members by the communities SELECT policy.

-- Enable Realtime INSERT notifications for live chat. If already in publication, ignore duplicate.
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
when undefined_object then
  raise notice 'supabase_realtime publication not found; enable Realtime for public.messages in the dashboard.';
end $$;
