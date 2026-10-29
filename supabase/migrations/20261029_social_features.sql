-- Pulse social features migration (additive; safe to run once or again).
-- Run this in Supabase SQL Editor AFTER your existing Pulse schema.
begin;

-- User profiles. Existing auth users are backfilled lazily by the app.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  display_name text,
  avatar_url text,
  banner_url text,
  bio text not null default '',
  status_text text not null default '',
  theme text not null default 'midnight',
  profile_decoration text,
  badges text[] not null default '{}',
  dm_privacy text not null default 'everyone' check (dm_privacy in ('everyone','members','nobody')),
  mention_notifications boolean not null default true,
  dm_notifications boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.communities
  add column if not exists icon_url text,
  add column if not exists banner_url text,
  add column if not exists description text,
  add column if not exists theme text not null default 'midnight';

create table if not exists public.community_roles (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  name text not null,
  color text not null default '#8b7cff',
  permissions jsonb not null default '{"manage_server":false,"manage_channels":false,"manage_roles":false,"kick_members":false}'::jsonb,
  created_at timestamptz not null default now(),
  unique (community_id, name)
);

create table if not exists public.community_member_roles (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.community_roles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (community_id,user_id,role_id)
);

create table if not exists public.dm_conversations (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default false,
  name text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table if not exists public.dm_participants (
  conversation_id uuid not null references public.dm_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  muted boolean not null default false,
  primary key (conversation_id,user_id)
);

create table if not exists public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.dm_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  content text not null default '',
  attachment_path text,
  attachment_name text,
  attachment_type text,
  attachment_size bigint,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create table if not exists public.dm_message_reads (
  message_id uuid not null references public.dm_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id,user_id)
);

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('mention','reply','dm','server_invite','system')),
  title text not null,
  body text not null default '',
  target_url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists dm_messages_conversation_created_idx on public.dm_messages(conversation_id,created_at desc);
create index if not exists dm_participants_user_idx on public.dm_participants(user_id,conversation_id);
create index if not exists user_notifications_user_created_idx on public.user_notifications(user_id,created_at desc);

-- RLS: users edit their own profile. Public profile fields are readable to signed-in users.
alter table public.profiles enable row level security;
drop policy if exists "Pulse profiles visible to authenticated" on public.profiles;
create policy "Pulse profiles visible to authenticated" on public.profiles for select to authenticated using (true);
drop policy if exists "Pulse users insert own profile" on public.profiles;
create policy "Pulse users insert own profile" on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "Pulse users update own profile" on public.profiles;
create policy "Pulse users update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Community settings can only be changed by the existing community owner.
alter table public.communities enable row level security;
drop policy if exists "Pulse owner updates community settings" on public.communities;
create policy "Pulse owner updates community settings" on public.communities for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table public.community_roles enable row level security;
drop policy if exists "Pulse members read community roles" on public.community_roles;
create policy "Pulse members read community roles" on public.community_roles for select to authenticated using (public.is_community_member(community_id, auth.uid()));
drop policy if exists "Pulse owners manage community roles" on public.community_roles;
create policy "Pulse owners manage community roles" on public.community_roles for all to authenticated using (exists(select 1 from public.communities c where c.id=community_id and c.owner_id=auth.uid())) with check (exists(select 1 from public.communities c where c.id=community_id and c.owner_id=auth.uid()));

alter table public.community_member_roles enable row level security;
drop policy if exists "Pulse members read role assignments" on public.community_member_roles;
create policy "Pulse members read role assignments" on public.community_member_roles for select to authenticated using (public.is_community_member(community_id, auth.uid()));
drop policy if exists "Pulse owners assign roles" on public.community_member_roles;
create policy "Pulse owners assign roles" on public.community_member_roles for all to authenticated using (exists(select 1 from public.communities c where c.id=community_id and c.owner_id=auth.uid())) with check (exists(select 1 from public.communities c where c.id=community_id and c.owner_id=auth.uid()));

-- SECURITY DEFINER helper avoids recursive RLS when checking membership.
create or replace function public.is_dm_participant(target_conversation uuid, target_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.dm_participants p
    where p.conversation_id = target_conversation and p.user_id = target_user
  );
$$;

-- DM membership checks are deliberately enforced for every message read/write.
alter table public.dm_conversations enable row level security;
drop policy if exists "Pulse participants read DM conversations" on public.dm_conversations;
create policy "Pulse participants read DM conversations" on public.dm_conversations for select to authenticated using (public.is_dm_participant(id, auth.uid()));
drop policy if exists "Pulse authenticated create DM conversations" on public.dm_conversations;
create policy "Pulse authenticated create DM conversations" on public.dm_conversations for insert to authenticated with check (created_by=auth.uid());
drop policy if exists "Pulse creators update DM conversations" on public.dm_conversations;
create policy "Pulse creators update DM conversations" on public.dm_conversations for update to authenticated using (created_by=auth.uid() or public.is_dm_participant(id, auth.uid())) with check (created_by=auth.uid() or public.is_dm_participant(id, auth.uid()));

alter table public.dm_participants enable row level security;
drop policy if exists "Pulse participants can see conversation members" on public.dm_participants;
create policy "Pulse participants can see conversation members" on public.dm_participants for select to authenticated using (exists(select 1 from public.dm_participants mine where mine.conversation_id=dm_participants.conversation_id and mine.user_id=auth.uid()));
drop policy if exists "Pulse conversation creator adds participants" on public.dm_participants;
create policy "Pulse conversation creator adds participants" on public.dm_participants for insert to authenticated with check (
  user_id=auth.uid()
  or exists(select 1 from public.dm_conversations c where c.id=conversation_id and c.created_by=auth.uid())
  or exists(select 1 from public.dm_conversations c where c.id=dm_participants.conversation_id and c.is_group=true and public.is_dm_participant(c.id, auth.uid()))
);
drop policy if exists "Pulse users update own DM preferences" on public.dm_participants;
create policy "Pulse users update own DM preferences" on public.dm_participants for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

alter table public.dm_messages enable row level security;
drop policy if exists "Pulse participants read DM messages" on public.dm_messages;
create policy "Pulse participants read DM messages" on public.dm_messages for select to authenticated using (public.is_dm_participant(dm_messages.conversation_id, auth.uid()));
drop policy if exists "Pulse participants send DM messages" on public.dm_messages;
create policy "Pulse participants send DM messages" on public.dm_messages for insert to authenticated with check (sender_id=auth.uid() and public.is_dm_participant(dm_messages.conversation_id, auth.uid()));
drop policy if exists "Pulse senders edit own DM messages" on public.dm_messages;
create policy "Pulse senders edit own DM messages" on public.dm_messages for update to authenticated using (sender_id=auth.uid()) with check (sender_id=auth.uid());
drop policy if exists "Pulse senders delete own DM messages" on public.dm_messages;
create policy "Pulse senders delete own DM messages" on public.dm_messages for delete to authenticated using (sender_id=auth.uid());

alter table public.dm_message_reads enable row level security;
drop policy if exists "Pulse users manage own DM reads" on public.dm_message_reads;
create policy "Pulse users manage own DM reads" on public.dm_message_reads for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

alter table public.user_notifications enable row level security;
drop policy if exists "Pulse users read own notifications" on public.user_notifications;
create policy "Pulse users read own notifications" on public.user_notifications for select to authenticated using (user_id=auth.uid());
drop policy if exists "Pulse users update own notifications" on public.user_notifications;
create policy "Pulse users update own notifications" on public.user_notifications for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists "Pulse users delete own notifications" on public.user_notifications;
create policy "Pulse users delete own notifications" on public.user_notifications for delete to authenticated using (user_id=auth.uid());
drop policy if exists "Pulse authenticated create notifications" on public.user_notifications;
create policy "Pulse authenticated create notifications" on public.user_notifications for insert to authenticated with check (actor_id=auth.uid());

-- Realtime for inbox updates.
do $$ begin
  alter publication supabase_realtime add table public.dm_messages;
exception when duplicate_object then null;
when undefined_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.user_notifications;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

commit;
