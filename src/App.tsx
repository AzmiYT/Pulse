import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Hash, Plus, LogOut, MessageCircle, Users, Send, Copy, Check, LoaderCircle, Radio, ArrowRight, ShieldCheck, Smile, Pencil, Trash2, Reply, X } from 'lucide-react'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'

type Community = { id: string; name: string; invite_code: string; created_at: string; owner_id: string }
type Channel = { id: string; community_id: string; name: string; created_at: string }
type Reaction = { id: string; message_id: string; user_id: string; emoji: string }
type ChatMessage = { id: string; channel_id: string; user_id: string; content: string; created_at: string; edited_at?: string | null; reply_to?: string | null; profiles?: { username: string | null } | null; reactions?: Reaction[] }
const EMOJIS = ['😀','😂','🥹','😍','😎','😭','🤔','🔥','❤️','💀','👍','👎','🎉','👏','🙏','💯','✨','👀','🤝','🚀','😡','🥶','🫡','🙌','💜','🤣','😊','😴','🤯','🥳','⚡','🗿']
function initials(name: string) { return name.slice(0, 2).toUpperCase() || 'U' }
function timeLabel(value: string) { return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [username, setUsername] = useState('')
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signup'); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState('')
  const [communities, setCommunities] = useState<Community[]>([]); const [activeCommunity, setActiveCommunity] = useState<Community | null>(null)
  const [channels, setChannels] = useState<Channel[]>([]); const [activeChannel, setActiveChannel] = useState<Channel | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([]); const [draft, setDraft] = useState(''); const [editingId, setEditingId] = useState<string | null>(null)
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null); const [emojiOpen, setEmojiOpen] = useState(false); const [reactionPicker, setReactionPicker] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false); const [showJoin, setShowJoin] = useState(false); const [communityName, setCommunityName] = useState(''); const [inviteCode, setInviteCode] = useState('')
  const [copied, setCopied] = useState(false); const [loadingMessages, setLoadingMessages] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null); const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isSupabaseConfigured) { setAuthReady(true); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => listener.subscription.unsubscribe()
  }, [])

  const loadCommunities = useCallback(async () => {
    if (!session) return
    const { data, error } = await supabase.from('community_members').select('community:communities(id,name,invite_code,created_at,owner_id)').eq('user_id', session.user.id)
    if (error) { setNotice(error.message); return }
    const list = (data || []).map((row: any) => row.community).filter(Boolean) as Community[]
    setCommunities(list)
    setActiveCommunity(current => current && list.some(item => item.id === current.id) ? list.find(item => item.id === current.id) || current : list[0] || null)
  }, [session])
  useEffect(() => { void loadCommunities() }, [loadCommunities])

  useEffect(() => {
    let cancelled = false
    async function loadChannels() {
      setChannels([]); setActiveChannel(null); setMessages([])
      if (!activeCommunity) return
      const { data, error } = await supabase.from('channels').select('*').eq('community_id', activeCommunity.id).order('created_at')
      if (cancelled) return
      if (error) { setNotice(error.message); return }
      const list = (data || []) as Channel[]; setChannels(list); setActiveChannel(list[0] || null)
    }
    void loadChannels(); return () => { cancelled = true }
  }, [activeCommunity?.id])

  const reloadMessages = useCallback(async (channelId: string, silent = false) => {
    if (!silent) setLoadingMessages(true)
    const { data, error } = await supabase.from('messages').select('id,channel_id,user_id,content,created_at,edited_at,reply_to,profiles(username)').eq('channel_id', channelId).order('created_at', { ascending: true }).limit(100)
    if (error) { if (!silent) setNotice(error.message); setLoadingMessages(false); return }
    const list = (data || []).map((m: any) => ({ ...m, profiles: Array.isArray(m.profiles) ? m.profiles[0] : m.profiles })) as ChatMessage[]
    const ids = list.map(m => m.id)
    let reactions: Reaction[] = []
    if (ids.length) {
      const result = await supabase.from('message_reactions').select('id,message_id,user_id,emoji').in('message_id', ids)
      if (!result.error) reactions = (result.data || []) as Reaction[]
    }
    if (channelId === activeChannel?.id) setMessages(list.map(m => ({ ...m, reactions: reactions.filter(r => r.message_id === m.id) })))
    setLoadingMessages(false)
  }, [activeChannel?.id])

  useEffect(() => {
    if (!activeChannel) { setMessages([]); return }
    const channelId = activeChannel.id
    void reloadMessages(channelId)
    const channel = supabase.channel(`message-events:${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` }, () => { void reloadMessages(channelId, true) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, () => { void reloadMessages(channelId, true) })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [activeChannel?.id, reloadMessages])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length, activeChannel?.id])

  const myUsername = useMemo(() => {
    const meta = session?.user.user_metadata
    return (meta?.username as string) || session?.user.email?.split('@')[0] || 'You'
  }, [session])

  async function handleAuth(event: FormEvent) {
    event.preventDefault(); setBusy(true); setNotice('')
    try {
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { username: username.trim() || email.split('@')[0] } } })
        if (error) throw error
        setNotice(!data.session ? 'Account created! Check your email to confirm it, then sign in.' : 'Account created successfully.')
      } else { const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password }); if (error) throw error }
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Authentication failed.') } finally { setBusy(false) }
  }
  async function createCommunity(event: FormEvent) {
    event.preventDefault(); if (!communityName.trim()) return; setBusy(true); setNotice('')
    const { data, error } = await supabase.rpc('create_community', { community_name: communityName.trim() }); setBusy(false)
    if (error) { setNotice(error.message); return }
    setShowCreate(false); setCommunityName(''); await loadCommunities()
    if (data) { const { data: created } = await supabase.from('communities').select('*').eq('id', data).single(); if (created) setActiveCommunity(created as Community) }
    setNotice('Community created!')
  }
  async function joinCommunity(event: FormEvent) {
    event.preventDefault(); if (!inviteCode.trim()) return; setBusy(true); setNotice('')
    const { error } = await supabase.rpc('join_community', { code: inviteCode.trim().toUpperCase() }); setBusy(false)
    if (error) { setNotice(error.message); return }
    setShowJoin(false); setInviteCode(''); await loadCommunities(); setNotice('Joined community!')
  }
  async function sendMessage(event: FormEvent) {
    event.preventDefault(); const content = draft.trim()
    if (!content || !activeChannel || !session || busy) return
    setBusy(true); setNotice('')
    if (editingId) {
      const { error } = await supabase.from('messages').update({ content, edited_at: new Date().toISOString() }).eq('id', editingId).eq('user_id', session.user.id)
      setBusy(false)
      if (error) { setNotice(error.message); return }
      setMessages(current => current.map(m => m.id === editingId ? { ...m, content, edited_at: new Date().toISOString() } : m))
      setEditingId(null); setDraft(''); return
    }
    const { data, error } = await supabase.from('messages').insert({ channel_id: activeChannel.id, user_id: session.user.id, content, reply_to: replyTo?.id || null }).select('id,channel_id,user_id,content,created_at,edited_at,reply_to').single()
    setBusy(false)
    if (error) { setNotice(error.message); return }
    setMessages(current => current.some(m => m.id === data.id) ? current : [...current, { ...data, profiles: { username: myUsername }, reactions: [] } as ChatMessage])
    setDraft(''); setReplyTo(null); setEmojiOpen(false)
  }
  function startEdit(message: ChatMessage) { setEditingId(message.id); setReplyTo(null); setDraft(message.content); setEmojiOpen(false); inputRef.current?.focus() }
  async function deleteMessage(message: ChatMessage) {
    if (!session || !window.confirm('Delete this message? This cannot be undone.')) return
    const { error } = await supabase.from('messages').delete().eq('id', message.id).eq('user_id', session.user.id)
    if (error) { setNotice(error.message); return }
    setMessages(current => current.filter(m => m.id !== message.id))
    if (editingId === message.id) { setEditingId(null); setDraft('') }
  }
  async function toggleReaction(message: ChatMessage, emoji: string) {
    if (!session) return
    const existing = (message.reactions || []).find(r => r.user_id === session.user.id && r.emoji === emoji)
    if (existing) {
      const { error } = await supabase.from('message_reactions').delete().eq('id', existing.id).eq('user_id', session.user.id)
      if (error) setNotice(error.message)
      else setMessages(current => current.map(m => m.id === message.id ? { ...m, reactions: (m.reactions || []).filter(r => r.id !== existing.id) } : m))
    } else {
      const { data, error } = await supabase.from('message_reactions').insert({ message_id: message.id, user_id: session.user.id, emoji }).select('id,message_id,user_id,emoji').single()
      if (error) setNotice(error.message)
      else setMessages(current => current.map(m => m.id === message.id ? { ...m, reactions: [...(m.reactions || []), data as Reaction] } : m))
    }
    setReactionPicker(null)
  }
  async function copyInvite() {
    if (!activeCommunity) return
    try { await navigator.clipboard.writeText(activeCommunity.invite_code); setCopied(true); window.setTimeout(() => setCopied(false), 1600) }
    catch { setNotice(`Invite code: ${activeCommunity.invite_code}`) }
  }

  if (!isSupabaseConfigured) return <SetupScreen />
  if (!authReady) return <div className="full-loading"><LoaderCircle className="spin" size={28}/><span>Starting Pulse…</span></div>
  if (!session) return (
    <main className="auth-page"><div className="auth-decoration"><div className="orb orb-one"/><div className="orb orb-two"/><div className="auth-brand"><div className="brand-icon"><MessageCircle size={23}/></div><span>pulse</span></div><div className="hero-copy"><p className="eyebrow">YOUR PEOPLE. YOUR SPACE.</p><h1>Good conversations<br/><span>start here.</span></h1><p>A calmer home for your communities, friends, and late-night gaming sessions.</p><div className="hero-pills"><span><Radio size={14}/> Real-time chat</span><span><Users size={14}/> Your communities</span></div></div><div className="auth-footer">A community chat starter · Built for the next generation</div></div>
      <section className="auth-panel"><div className="auth-form-wrap"><div className="mobile-brand"><div className="brand-icon"><MessageCircle size={20}/></div><span>pulse</span></div><p className="eyebrow">WELCOME {authMode === 'signup' ? 'ABOARD' : 'BACK'}</p><h2>{authMode === 'signup' ? 'Create your account' : 'Welcome back'}</h2><p className="muted">{authMode === 'signup' ? 'Start your own little corner of the internet.' : 'Pick up where your conversations left off.'}</p>
      <form onSubmit={handleAuth} className="stack-form">{authMode === 'signup' && <label>Username<input value={username} onChange={e => setUsername(e.target.value)} placeholder="Your display name" maxLength={32}/></label>}<label>Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required/></label><label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" minLength={8} autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'} required/></label>{notice && <p className="notice">{notice}</p>}<button className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17}/> : null}{authMode === 'signup' ? 'Create account' : 'Sign in'}<ArrowRight size={17}/></button></form>
      <p className="auth-switch">{authMode === 'signup' ? 'Already have an account?' : "Don't have an account?"} <button className="text-button" onClick={() => { setAuthMode(authMode === 'signup' ? 'signin' : 'signup'); setNotice('') }}>{authMode === 'signup' ? 'Sign in' : 'Create one'}</button></p><p className="auth-legal"><ShieldCheck size={14}/> Your account is stored securely with Supabase Auth.</p></div></section></main>
  )
  return (
    <main className="app-shell"><aside className="server-rail"><button className="rail-logo" title="Pulse home"><MessageCircle size={22}/></button><div className="rail-divider"/>{communities.map(c => <button key={c.id} className={`server-icon ${activeCommunity?.id === c.id ? 'selected' : ''}`} title={c.name} onClick={() => setActiveCommunity(c)}>{initials(c.name)}</button>)}<button className="server-add" title="Create community" onClick={() => setShowCreate(true)}><Plus size={22}/></button><button className="server-add join-add" title="Join with invite code" onClick={() => setShowJoin(true)}><ArrowRight size={18}/></button><div className="rail-bottom"><div className="avatar tiny">{initials(myUsername)}</div></div></aside>
      <aside className="channel-sidebar"><div className="workspace-head"><div className="workspace-title">{activeCommunity?.name || 'Your communities'}</div><button className="icon-button" title="Create community" onClick={() => setShowCreate(true)}><Plus size={17}/></button></div>
        {activeCommunity ? <><button className="invite-card" onClick={() => void copyInvite()}><div><span className="invite-title">Invite friends</span><span className="invite-subtitle">{copied ? 'Invite code copied!' : `Code: ${activeCommunity.invite_code}`}</span></div>{copied ? <Check size={16}/> : <Copy size={16}/>}</button><div className="section-label">COMMUNITY CHANNELS</div><div className="channel-list">{channels.map(c => <button key={c.id} className={`channel-item ${activeChannel?.id === c.id ? 'active' : ''}`} onClick={() => setActiveChannel(c)}><Hash size={17}/><span>{c.name}</span></button>)}</div><div className="sidebar-empty">{channels.length === 0 ? 'No channels yet.' : `${channels.length} channel${channels.length === 1 ? '' : 's'}`}</div></> : <div className="empty-workspace"><div className="empty-icon"><Users size={22}/></div><strong>Find your people</strong><p>Create a community or join one with an invite code.</p><button className="primary-button small" onClick={() => setShowCreate(true)}><Plus size={15}/> Create community</button><button className="secondary-button small" onClick={() => setShowJoin(true)}>Join a community</button></div>}
        <div className="user-card"><div className="avatar">{initials(myUsername)}</div><div className="user-details"><strong>{myUsername}</strong><span>Online</span></div><button className="icon-button" title="Sign out" onClick={() => void supabase.auth.signOut()}><LogOut size={17}/></button></div></aside>
      <section className="chat-panel"><header className="chat-header"><div className="channel-heading"><div className="hash-large"><Hash size={22}/></div><div><h1>{activeChannel?.name || 'Welcome'}</h1><p>{activeCommunity ? activeCommunity.name : 'Your communities, all in one place'}</p></div></div><div className="header-status"><span className="status-dot"/><span>Live chat</span></div></header>
        {activeChannel ? <><div className="messages-area">
          {loadingMessages && <div className="inline-loading"><LoaderCircle className="spin" size={18}/> Loading messages…</div>}
          {!loadingMessages && messages.length === 0 && <div className="chat-welcome"><div className="welcome-icon"><Hash size={28}/></div><h2>Welcome to #{activeChannel.name}</h2><p>This is the beginning of the conversation. Say something nice.</p></div>}
          {messages.map(message => {
            const parent = messages.find(m => m.id === message.reply_to)
            const groups = Object.values((message.reactions || []).reduce((acc: Record<string, { emoji: string; count: number; mine: boolean }>, r) => { acc[r.emoji] ||= { emoji: r.emoji, count: 0, mine: false }; acc[r.emoji].count++; if (r.user_id === session.user.id) acc[r.emoji].mine = true; return acc }, {}))
            return <article className="message-row" key={message.id}><div className={`avatar message-avatar avatar-color-${message.user_id.charCodeAt(0) % 4}`}>{initials(message.profiles?.username || 'User')}</div><div className="message-body"><div className="message-meta"><strong>{message.profiles?.username || 'Community member'}</strong><time>{timeLabel(message.created_at)}</time>{message.user_id === session.user.id && <span className="you-tag">YOU</span>}{message.edited_at && <span className="edited-tag">edited</span>}</div>
              {message.reply_to && <div className="reply-reference"><Reply size={13}/><span>Reply to <b>{parent?.profiles?.username || 'message'}</b>: {parent ? parent.content.slice(0, 100) : 'Original message unavailable'}</span></div>}
              <p>{message.content}</p>
              {groups.length > 0 && <div className="reaction-list">{groups.map(g => <button key={g.emoji} className={`reaction-chip ${g.mine ? 'mine' : ''}`} title={`${g.count} reaction${g.count === 1 ? '' : 's'}`} onClick={() => void toggleReaction(message, g.emoji)}>{g.emoji} <span>{g.count}</span></button>)}</div>}
              <div className="message-actions"><button title="Reply" onClick={() => { setReplyTo(message); setEditingId(null); setDraft(''); inputRef.current?.focus() }}><Reply size={14}/> Reply</button><button title="Add reaction" onClick={() => setReactionPicker(reactionPicker === message.id ? null : message.id)}><Smile size={14}/> React</button>{message.user_id === session.user.id && <><button title="Edit message" onClick={() => startEdit(message)}><Pencil size={13}/> Edit</button><button className="delete-action" title="Delete message" onClick={() => void deleteMessage(message)}><Trash2 size={13}/> Delete</button></>}</div>
              {reactionPicker === message.id && <div className="emoji-popover reaction-popover">{EMOJIS.slice(0, 20).map(emoji => <button key={emoji} title={emoji} onClick={() => void toggleReaction(message, emoji)}>{emoji}</button>)}</div>}
            </div></article>
          })}<div ref={bottomRef}/></div>
          <form className="composer-wrap" onSubmit={sendMessage}>{(replyTo || editingId) && <div className="composer-context"><div><strong>{editingId ? 'Editing message' : `Replying to ${replyTo?.profiles?.username || 'message'}`}</strong><span>{editingId ? 'Save your changes or cancel.' : replyTo?.content}</span></div><button type="button" title="Cancel" onClick={() => { setReplyTo(null); setEditingId(null); setDraft('') }}><X size={16}/></button></div>}
            <div className="composer"><button type="button" className="emoji-trigger" title="Insert emoji" onClick={() => setEmojiOpen(!emojiOpen)}><Smile size={19}/></button><input ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)} placeholder={editingId ? 'Edit your message…' : replyTo ? 'Write a reply…' : `Message #${activeChannel.name}`} maxLength={4000} aria-label="Message"/><button className="send-button" disabled={!draft.trim() || busy} title={editingId ? 'Save edit' : 'Send message'}>{busy ? <LoaderCircle className="spin" size={17}/> : editingId ? <Check size={18}/> : <Send size={18}/>}</button></div>
            {emojiOpen && <div className="emoji-popover composer-emoji">{EMOJIS.map(emoji => <button key={emoji} title={emoji} onClick={() => { setDraft(current => current + emoji); inputRef.current?.focus() }}>{emoji}</button>)}</div>}<p className="composer-hint">Be kind. Keep it useful. <span>Enter to send</span></p></form>
        </> : <div className="empty-chat"><div className="empty-icon"><MessageCircle size={28}/></div><h2>Make some noise.</h2><p>Create a community or join one to start chatting.</p><button className="primary-button small" onClick={() => setShowCreate(true)}><Plus size={15}/> Create community</button></div>}
      </section>
      {notice && <button className="toast" onClick={() => setNotice('')}>{notice} <span>×</span></button>}
      {showCreate && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowCreate(false) }}><form className="modal" onSubmit={createCommunity}><div className="modal-icon"><Users size={22}/></div><h2>Create a community</h2><p>Give your people a place to gather. A #general channel is created automatically.</p><label>Community name<input autoFocus value={communityName} onChange={e => setCommunityName(e.target.value)} placeholder="e.g. Gaming Hub" maxLength={48} required/></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowCreate(false)}>Cancel</button><button className="primary-button" disabled={busy || !communityName.trim()}>{busy ? 'Creating…' : 'Create community'}</button></div></form></div>}
      {showJoin && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowJoin(false) }}><form className="modal" onSubmit={joinCommunity}><div className="modal-icon"><ArrowRight size={22}/></div><h2>Join a community</h2><p>Paste the invite code your friend shared with you.</p><label>Invite code<input autoFocus value={inviteCode} onChange={e => setInviteCode(e.target.value)} placeholder="e.g. A1B2C3D4E5" maxLength={16} required/></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowJoin(false)}>Cancel</button><button className="primary-button" disabled={busy || !inviteCode.trim()}>{busy ? 'Joining…' : 'Join community'}</button></div></form></div>}
    </main>
  )
}
function SetupScreen() {
  return <main className="setup-page"><div className="setup-card"><div className="brand-icon"><MessageCircle size={24}/></div><p className="eyebrow">ONE LAST SETUP STEP</p><h1>Connect your database.</h1><p className="muted">The app is ready, but it needs your free Supabase project credentials to create real accounts and sync messages.</p><ol><li>Create a project at <a href="https://supabase.com" target="_blank" rel="noreferrer">supabase.com</a>.</li><li>In Supabase, open <b>SQL Editor</b>, paste <code>supabase/schema.sql</code> from this project, and run it.</li><li>Copy the Project URL and publishable/anon key from your project's API settings.</li><li>Copy <code>.env.example</code> to <code>.env.local</code>, then fill in both values.</li><li>Restart the development server.</li></ol><div className="setup-note"><ShieldCheck size={18}/><span>Only use the publishable/anon key in this browser app. Never put a service-role key in frontend code.</span></div><p className="muted small-text">After setup, reload this page to see the sign-up screen.</p></div></main>
}
