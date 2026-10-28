-- Pulse messaging upgrade v2
-- Safe additive migration for an existing Pulse database. Preserves existing users,
-- communities, channels, messages, replies and reactions. Run once in Supabase SQL Editor.

-- Message attachments use private Supabase Storage objects.
alter table public.messages add column if not exists attachment_path text;
alter table public.messages add column if not exists attachment_name text;
alter table public.messages add column if not exists attachment_type text;
alter table public.messages add column if not exists attachment_size bigint;

create table if not exists public.message_polls (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.messages(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.message_polls(id) on delete cascade,
  label text not null check (char_length(trim(label)) between 1 and 100),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists poll_options_poll_id_idx on public.poll_options(poll_id, position);

create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.message_polls(id) on delete cascade,
  option_id uuid not null references public.poll_options(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (poll_id, user_id)
);
create index if not exists poll_votes_poll_id_idx on public.poll_votes(poll_id);

create table if not exists public.custom_emojis (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null check (name ~ '^[a-z0-9_]{1,32}$'),
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  unique (community_id, name)
);
create index if not exists custom_emojis_community_id_idx on public.custom_emojis(community_id);

alter table public.message_polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;
alter table public.custom_emojis enable row level security;

-- Polls can only be read/created by members of the relevant community.
drop policy if exists "Members can read polls" on public.message_polls;
create policy "Members can read polls" on public.message_polls for select to authenticated
using (exists (select 1 from public.channels ch where ch.id = channel_id and public.is_community_member(ch.community_id)));
drop policy if exists "Members can create polls on their own messages" on public.message_polls;
create policy "Members can create polls on their own messages" on public.message_polls for insert to authenticated
with check (created_by = auth.uid() and exists (
  select 1 from public.channels ch where ch.id = channel_id and public.is_community_member(ch.community_id)
) and exists (select 1 from public.messages m where m.id = message_id and m.channel_id = channel_id and m.user_id = auth.uid()));

drop policy if exists "Members can read poll options" on public.poll_options;
create policy "Members can read poll options" on public.poll_options for select to authenticated
using (exists (select 1 from public.message_polls p join public.channels ch on ch.id = p.channel_id where p.id = poll_id and public.is_community_member(ch.community_id)));
drop policy if exists "Poll creators can add options" on public.poll_options;
create policy "Poll creators can add options" on public.poll_options for insert to authenticated
with check (exists (select 1 from public.message_polls p join public.channels ch on ch.id = p.channel_id where p.id = poll_id and p.created_by = auth.uid() and public.is_community_member(ch.community_id)));
drop policy if exists "Poll creators can delete options" on public.poll_options;
create policy "Poll creators can delete options" on public.poll_options for delete to authenticated
using (exists (select 1 from public.message_polls p where p.id = poll_id and p.created_by = auth.uid()));

drop policy if exists "Members can read poll votes" on public.poll_votes;
create policy "Members can read poll votes" on public.poll_votes for select to authenticated
using (exists (select 1 from public.message_polls p join public.channels ch on ch.id = p.channel_id where p.id = poll_id and public.is_community_member(ch.community_id)));
drop policy if exists "Members can vote in polls" on public.poll_votes;
create policy "Members can vote in polls" on public.poll_votes for insert to authenticated
with check (user_id = auth.uid() and exists (
  select 1 from public.message_polls p join public.channels ch on ch.id = p.channel_id
  join public.poll_options o on o.poll_id = p.id
  where p.id = poll_id and o.id = option_id and public.is_community_member(ch.community_id)
));
drop policy if exists "Users can change their own poll vote" on public.poll_votes;
create policy "Users can change their own poll vote" on public.poll_votes for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid() and exists (
  select 1 from public.poll_options o where o.id = option_id and o.poll_id = poll_id
));
drop policy if exists "Users can remove their own poll vote" on public.poll_votes;
create policy "Users can remove their own poll vote" on public.poll_votes for delete to authenticated
using (user_id = auth.uid());

drop policy if exists "Community members can read custom emojis" on public.custom_emojis;
create policy "Community members can read custom emojis" on public.custom_emojis for select to authenticated
using (public.is_community_member(community_id));
drop policy if exists "Community members can create custom emojis" on public.custom_emojis;
create policy "Community members can create custom emojis" on public.custom_emojis for insert to authenticated
with check (created_by = auth.uid() and public.is_community_member(community_id));
drop policy if exists "Creators can delete custom emojis" on public.custom_emojis;
create policy "Creators can delete custom emojis" on public.custom_emojis for delete to authenticated
using (created_by = auth.uid());

-- Private bucket; files are served through short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit)
values ('pulse-uploads', 'pulse-uploads', false, 15728640)
on conflict (id) do update set public = false, file_size_limit = 15728640;

-- Paths are channel-id/user-id/filename for attachments or community-id/user-id/filename for custom emoji.
drop policy if exists "Community members can read Pulse uploads" on storage.objects;
create policy "Community members can read Pulse uploads" on storage.objects for select to authenticated
using (bucket_id = 'pulse-uploads' and (
  exists (select 1 from public.channels ch where ch.id::text = (storage.foldername(name))[1] and public.is_community_member(ch.community_id))
  or exists (select 1 from public.communities c where c.id::text = (storage.foldername(name))[1] and public.is_community_member(c.id))
));
drop policy if exists "Members can upload Pulse files" on storage.objects;
create policy "Members can upload Pulse files" on storage.objects for insert to authenticated
with check (bucket_id = 'pulse-uploads' and (storage.foldername(name))[2] = auth.uid()::text and (
  exists (select 1 from public.channels ch where ch.id::text = (storage.foldername(name))[1] and public.is_community_member(ch.community_id))
  or exists (select 1 from public.communities c where c.id::text = (storage.foldername(name))[1] and public.is_community_member(c.id))
));
drop policy if exists "Users can delete their own Pulse uploads" on storage.objects;
create policy "Users can delete their own Pulse uploads" on storage.objects for delete to authenticated
using (bucket_id = 'pulse-uploads' and (storage.foldername(name))[2] = auth.uid()::text);

-- Enable realtime for poll changes (ignore tables already in the publication).
do $$
begin
  alter publication supabase_realtime add table public.message_polls;
exception when duplicate_object then null; when undefined_object then raise notice 'Realtime publication not found; enable message_polls manually.';
end $$;
do $$
begin
  alter publication supabase_realtime add table public.poll_options;
exception when duplicate_object then null; when undefined_object then raise notice 'Realtime publication not found; enable poll_options manually.';
end $$;
do $$
begin
  alter publication supabase_realtime add table public.poll_votes;
exception when duplicate_object then null; when undefined_object then raise notice 'Realtime publication not found; enable poll_votes manually.';
end $$;
