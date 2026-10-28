-- Pulse messaging upgrade migration. Safe for an existing database: preserves all existing messages.
-- Run in Supabase Dashboard -> SQL Editor.

alter table public.messages
  add column if not exists edited_at timestamptz,
  add column if not exists reply_to uuid references public.messages(id) on delete set null;

create index if not exists messages_reply_to_idx on public.messages(reply_to);

create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);
create index if not exists message_reactions_message_id_idx on public.message_reactions(message_id);

alter table public.message_reactions enable row level security;

drop policy if exists "Members can read message reactions" on public.message_reactions;
create policy "Members can read message reactions" on public.message_reactions
for select to authenticated using (
  exists (
    select 1 from public.messages m
    join public.channels ch on ch.id = m.channel_id
    where m.id = message_reactions.message_id
      and public.is_community_member(ch.community_id)
  )
);

drop policy if exists "Members can add their own reactions" on public.message_reactions;
create policy "Members can add their own reactions" on public.message_reactions
for insert to authenticated with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.messages m
    join public.channels ch on ch.id = m.channel_id
    where m.id = message_reactions.message_id
      and public.is_community_member(ch.community_id)
  )
);

drop policy if exists "Users can remove their own reactions" on public.message_reactions;
create policy "Users can remove their own reactions" on public.message_reactions
for delete to authenticated using (user_id = auth.uid());

-- Allow users to update only their own messages while retaining membership checks.
drop policy if exists "Users can edit their own messages" on public.messages;
create policy "Users can edit their own messages" on public.messages
for update to authenticated using (user_id = auth.uid()) with check (
  user_id = auth.uid()
  and char_length(trim(content)) between 1 and 4000
  and exists (
    select 1 from public.channels ch
    where ch.id = messages.channel_id
      and public.is_community_member(ch.community_id)
  )
);

-- Enable realtime events for reactions. Existing publication membership is preserved.
do $$
begin
  alter publication supabase_realtime add table public.message_reactions;
exception when duplicate_object then null;
when undefined_object then
  raise notice 'supabase_realtime publication not found; enable Realtime for public.message_reactions in the dashboard.';
end $$;
