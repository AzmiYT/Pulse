import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Hash, Plus, LogOut, MessageCircle, Users, Send, Copy, Check, LoaderCircle, Radio, ArrowRight, ShieldCheck } from 'lucide-react'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'

type Community = { id: string; name: string; invite_code: string; created_at: string; owner_id: string }
type Channel = { id: string; community_id: string; name: string; created_at: string }
type ChatMessage = { id: string; channel_id: string; user_id: string; content: string; created_at: string; profiles?: { username: string | null } | null }

function initials(name: string) {
  return name.slice(0, 2).toUpperCase() || 'U'
}
function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signup')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [communities, setCommunities] = useState<Community[]>([])
  const [activeCommunity, setActiveCommunity] = useState<Community | null>(null)
  const [channels, setChannels] = useState<Channel[]>([])
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [communityName, setCommunityName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isSupabaseConfigured) { setAuthReady(true); return }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const loadCommunities = useCallback(async () => {
    if (!session) return
    const { data, error } = await supabase
      .from('community_members')
      .select('community:communities(id,name,invite_code,created_at,owner_id)')
      .eq('user_id', session.user.id)
    if (error) { setNotice(error.message); return }
    const list = (data || []).map((row: any) => row.community).filter(Boolean) as Community[]
    setCommunities(list)
    setActiveCommunity((current) => {
      if (current && list.some((item) => item.id === current.id)) return list.find((item) => item.id === current.id) || current
      return list[0] || null
    })
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
      const list = (data || []) as Channel[]
      setChannels(list)
      setActiveChannel(list[0] || null)
    }
    void loadChannels()
    return () => { cancelled = true }
  }, [activeCommunity?.id])

  useEffect(() => {
    let cancelled = false
    async function loadMessages() {
      if (!activeChannel) { setMessages([]); return }
      setLoadingMessages(true)
      const { data, error } = await supabase.from('messages')
        .select('id,channel_id,user_id,content,created_at,profiles(username)')
        .eq('channel_id', activeChannel.id).order('created_at', { ascending: true }).limit(100)
      if (cancelled) return
      setLoadingMessages(false)
      if (error) { setNotice(error.message); return }
      setMessages((data || []) as ChatMessage[])
    }
    void loadMessages()
    if (!activeChannel) return () => { cancelled = true }
    const channel = supabase.channel(`messages:${activeChannel.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${activeChannel.id}` }, async (payload) => {
        const incoming = payload.new as ChatMessage
        const { data } = await supabase.from('profiles').select('username').eq('id', incoming.user_id).maybeSingle()
        const enriched = { ...incoming, profiles: data }
        setMessages((current) => current.some((item) => item.id === enriched.id) ? current : [...current, enriched])
      }).subscribe()
    return () => { cancelled = true; void supabase.removeChannel(channel) }
  }, [activeChannel?.id])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length, activeChannel?.id])

  const myUsername = useMemo(() => {
    const meta = session?.user.user_metadata
    return (meta?.username as string) || session?.user.email?.split('@')[0] || 'You'
  }, [session])

  async function handleAuth(event: FormEvent) {
    event.preventDefault(); setBusy(true); setNotice('')
    try {
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { data: { username: username.trim() || email.split('@')[0] } },
        })
        if (error) throw error
        if (!data.session) setNotice('Account created! Check your email to confirm it, then sign in.')
        else setNotice('Account created successfully.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      }
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Authentication failed.') }
    finally { setBusy(false) }
  }

  async function createCommunity(event: FormEvent) {
    event.preventDefault()
    if (!communityName.trim()) return
    setBusy(true); setNotice('')
    const { data, error } = await supabase.rpc('create_community', { community_name: communityName.trim() })
    setBusy(false)
    if (error) { setNotice(error.message); return }
    setShowCreate(false); setCommunityName('')
    await loadCommunities()
    if (data) {
      const { data: created } = await supabase.from('communities').select('*').eq('id', data).single()
      if (created) setActiveCommunity(created as Community)
    }
    setNotice('Community created!')
  }

  async function joinCommunity(event: FormEvent) {
    event.preventDefault()
    if (!inviteCode.trim()) return
    setBusy(true); setNotice('')
    const { error } = await supabase.rpc('join_community', { code: inviteCode.trim().toUpperCase() })
    setBusy(false)
    if (error) { setNotice(error.message); return }
    setShowJoin(false); setInviteCode('')
    await loadCommunities()
    setNotice('Joined community!')
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault()
    const content = draft.trim()
    if (!content || !activeChannel || !session || busy) return
    setDraft('')
    const optimistic: ChatMessage = {
      id: `temp-${Date.now()}`, channel_id: activeChannel.id, user_id: session.user.id,
      content, created_at: new Date().toISOString(), profiles: { username: myUsername },
    }
    setMessages((current) => [...current, optimistic])
    const { data, error } = await supabase.from('messages').insert({
      channel_id: activeChannel.id, user_id: session.user.id, content,
    }).select('id,channel_id,user_id,content,created_at').single()
    if (error) {
      setMessages((current) => current.filter((item) => item.id !== optimistic.id))
      setDraft(content); setNotice(error.message); return
    }
    setMessages((current) => current.map((item) => item.id === optimistic.id
      ? { ...data as ChatMessage, profiles: { username: myUsername } } : item))
  }

  async function copyInvite() {
    if (!activeCommunity) return
    try {
      await navigator.clipboard.writeText(activeCommunity.invite_code)
      setCopied(true); window.setTimeout(() => setCopied(false), 1600)
    } catch { setNotice(`Invite code: ${activeCommunity.invite_code}`) }
  }

  if (!isSupabaseConfigured) return <SetupScreen />
  if (!authReady) return <div className="full-loading"><LoaderCircle className="spin" size={28}/><span>Starting Pulse…</span></div>
  if (!session) return (
    <main className="auth-page">
      <div className="auth-decoration"><div className="orb orb-one"/><div className="orb orb-two"/><div className="auth-brand"><div className="brand-icon"><MessageCircle size={23}/></div><span>pulse</span></div><div className="hero-copy"><p className="eyebrow">YOUR PEOPLE. YOUR SPACE.</p><h1>Good conversations<br/><span>start here.</span></h1><p>A calmer home for your communities, friends, and late-night gaming sessions.</p><div className="hero-pills"><span><Radio size={14}/> Real-time chat</span><span><Users size={14}/> Your communities</span></div></div><div className="auth-footer">A community chat starter · Built for the next generation</div></div>
      <section className="auth-panel"><div className="auth-form-wrap"><div className="mobile-brand"><div className="brand-icon"><MessageCircle size={20}/></div><span>pulse</span></div><p className="eyebrow">WELCOME {authMode === 'signup' ? 'ABOARD' : 'BACK'}</p><h2>{authMode === 'signup' ? 'Create your account' : 'Welcome back'}</h2><p className="muted">{authMode === 'signup' ? 'Start your own little corner of the internet.' : 'Pick up where your conversations left off.'}</p>
      <form onSubmit={handleAuth} className="stack-form">
        {authMode === 'signup' && <label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Your display name" maxLength={32}/></label>}
        <label>Email address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required/></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" minLength={8} autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'} required/></label>
        {notice && <p className="notice">{notice}</p>}
        <button className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17}/> : null}{authMode === 'signup' ? 'Create account' : 'Sign in'}<ArrowRight size={17}/></button>
      </form>
      <p className="auth-switch">{authMode === 'signup' ? 'Already have an account?' : "Don't have an account?"} <button className="text-button" onClick={() => { setAuthMode(authMode === 'signup' ? 'signin' : 'signup'); setNotice('') }}>{authMode === 'signup' ? 'Sign in' : 'Create one'}</button></p><p className="auth-legal"><ShieldCheck size={14}/> Your account is stored securely with Supabase Auth.</p></div></section>
    </main>
  )

  return (
    <main className="app-shell">
      <aside className="server-rail">
        <button className="rail-logo" title="Pulse home"><MessageCircle size={22}/></button><div className="rail-divider"/>
        {communities.map((community) => <button key={community.id} className={`server-icon ${activeCommunity?.id === community.id ? 'selected' : ''}`} title={community.name} onClick={() => setActiveCommunity(community)}>{initials(community.name)}</button>)}
        <button className="server-add" title="Create community" onClick={() => setShowCreate(true)}><Plus size={22}/></button>
        <button className="server-add join-add" title="Join with invite code" onClick={() => setShowJoin(true)}><ArrowRight size={18}/></button>
        <div className="rail-bottom"><div className="avatar tiny">{initials(myUsername)}</div></div>
      </aside>
      <aside className="channel-sidebar">
        <div className="workspace-head"><div className="workspace-title">{activeCommunity?.name || 'Your communities'}</div><button className="icon-button" title="Create community" onClick={() => setShowCreate(true)}><Plus size={17}/></button></div>
        {activeCommunity ? <>
          <button className="invite-card" onClick={() => void copyInvite()}><div><span className="invite-title">Invite friends</span><span className="invite-subtitle">{copied ? 'Invite code copied!' : `Code: ${activeCommunity.invite_code}`}</span></div>{copied ? <Check size={16}/> : <Copy size={16}/>}</button>
          <div className="section-label">COMMUNITY CHANNELS</div>
          <div className="channel-list">{channels.map((channel) => <button key={channel.id} className={`channel-item ${activeChannel?.id === channel.id ? 'active' : ''}`} onClick={() => setActiveChannel(channel)}><Hash size={17}/><span>{channel.name}</span></button>)}</div>
          <div className="sidebar-empty">{channels.length === 0 ? 'No channels yet.' : `${channels.length} channel${channels.length === 1 ? '' : 's'}`}</div>
        </> : <div className="empty-workspace"><div className="empty-icon"><Users size={22}/></div><strong>Find your people</strong><p>Create a community or join one with an invite code.</p><button className="primary-button small" onClick={() => setShowCreate(true)}><Plus size={15}/> Create community</button><button className="secondary-button small" onClick={() => setShowJoin(true)}>Join a community</button></div>}
        <div className="user-card"><div className="avatar">{initials(myUsername)}</div><div className="user-details"><strong>{myUsername}</strong><span>Online</span></div><button className="icon-button" title="Sign out" onClick={() => void supabase.auth.signOut()}><LogOut size={17}/></button></div>
      </aside>
      <section className="chat-panel">
        <header className="chat-header"><div className="channel-heading"><div className="hash-large"><Hash size={22}/></div><div><h1>{activeChannel?.name || 'Welcome'}</h1><p>{activeCommunity ? activeCommunity.name : 'Your communities, all in one place'}</p></div></div><div className="header-status"><span className="status-dot"/><span>Live chat</span></div></header>
        {activeChannel ? <><div className="messages-area">
          {loadingMessages && <div className="inline-loading"><LoaderCircle className="spin" size={18}/> Loading messages…</div>}
          {!loadingMessages && messages.length === 0 && <div className="chat-welcome"><div className="welcome-icon"><Hash size={28}/></div><h2>Welcome to #{activeChannel.name}</h2><p>This is the beginning of the conversation. Say something nice.</p></div>}
          {messages.map((message) => <article className="message-row" key={message.id}><div className={`avatar message-avatar avatar-color-${message.user_id.charCodeAt(0) % 4}`}>{initials(message.profiles?.username || 'User')}</div><div className="message-body"><div className="message-meta"><strong>{message.profiles?.username || 'Community member'}</strong><time>{timeLabel(message.created_at)}</time>{message.user_id === session.user.id && <span className="you-tag">YOU</span>}</div><p>{message.content}</p></div></article>)}<div ref={bottomRef}/></div>
          <form className="composer-wrap" onSubmit={sendMessage}><div className="composer"><input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Message #${activeChannel.name}`} maxLength={4000} aria-label="Message" /><button className="send-button" disabled={!draft.trim()} title="Send message"><Send size={18}/></button></div><p className="composer-hint">Be kind. Keep it useful. <span>Enter to send</span></p></form></> : <div className="empty-chat"><div className="empty-icon"><MessageCircle size={28}/></div><h2>Make some noise.</h2><p>Create a community or join one to start chatting.</p><button className="primary-button small" onClick={() => setShowCreate(true)}><Plus size={15}/> Create community</button></div>}
      </section>
      {notice && <button className="toast" onClick={() => setNotice('')}>{notice} <span>×</span></button>}
      {showCreate && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowCreate(false) }}><form className="modal" onSubmit={createCommunity}><div className="modal-icon"><Users size={22}/></div><h2>Create a community</h2><p>Give your people a place to gather. A #general channel is created automatically.</p><label>Community name<input autoFocus value={communityName} onChange={(e) => setCommunityName(e.target.value)} placeholder="e.g. Gaming Hub" maxLength={48} required/></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowCreate(false)}>Cancel</button><button className="primary-button" disabled={busy || !communityName.trim()}>{busy ? 'Creating…' : 'Create community'}</button></div></form></div>}
      {showJoin && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowJoin(false) }}><form className="modal" onSubmit={joinCommunity}><div className="modal-icon"><ArrowRight size={22}/></div><h2>Join a community</h2><p>Paste the invite code your friend shared with you.</p><label>Invite code<input autoFocus value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="e.g. A1B2C3D4E5" maxLength={16} required/></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowJoin(false)}>Cancel</button><button className="primary-button" disabled={busy || !inviteCode.trim()}>{busy ? 'Joining…' : 'Join community'}</button></div></form></div>}
    </main>
  )
}

function SetupScreen() {
  return <main className="setup-page"><div className="setup-card"><div className="brand-icon"><MessageCircle size={24}/></div><p className="eyebrow">ONE LAST SETUP STEP</p><h1>Connect your database.</h1><p className="muted">The app is ready, but it needs your free Supabase project credentials to create real accounts and sync messages.</p><ol><li>Create a project at <a href="https://supabase.com" target="_blank" rel="noreferrer">supabase.com</a>.</li><li>In Supabase, open <b>SQL Editor</b>, paste <code>supabase/schema.sql</code> from this project, and run it.</li><li>Copy the Project URL and publishable/anon key from your project's API settings.</li><li>Copy <code>.env.example</code> to <code>.env.local</code>, then fill in both values.</li><li>Restart the development server.</li></ol><div className="setup-note"><ShieldCheck size={18}/><span>Only use the publishable/anon key in this browser app. Never put a service-role key in frontend code.</span></div><p className="muted small-text">After setup, reload this page to see the sign-up screen.</p></div></main>
}
