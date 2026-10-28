import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Hash, Plus, LogOut, MessageCircle, Users, Send, Copy, Check, LoaderCircle, Radio, ArrowRight, ShieldCheck, Smile, Pencil, Trash2, Reply, X, Paperclip, BarChart3, Upload, Search, Star, ChevronDown, FileText, Download, Bookmark, Pin, Mic, Square, Film, Bold, Italic, Underline, Code, Bell, Image as ImageIcon } from 'lucide-react'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'

type Community = { id: string; name: string; invite_code: string; created_at: string; owner_id: string }
type Channel = { id: string; community_id: string; name: string; created_at: string }
type Reaction = { id: string; message_id: string; user_id: string; emoji: string }
type PollOption = { id: string; poll_id: string; label: string; position: number }
type PollVote = { id: string; poll_id: string; option_id: string; user_id: string }
type MessagePoll = { id: string; message_id: string; channel_id: string; created_by: string; options: PollOption[]; votes: PollVote[] }
type ChatMessage = { id: string; channel_id: string; user_id: string; content: string; created_at: string; edited_at?: string | null; reply_to?: string | null; attachment_path?: string | null; attachment_name?: string | null; attachment_type?: string | null; attachment_size?: number | null; attachment_url?: string | null; poll?: MessagePoll | null; profiles?: { username: string | null } | null; reactions?: Reaction[] }
const EMOJI_GROUPS: Record<string, string[]> = {
  'Frequently used': ['😂','😭','💀','🔥','❤️','👍','🙏','✨','👀','💯','🥹','🤝'],
  'Smileys': ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🫢','🫣','🤫','🤔','🫡','🤐','🤨','😐','😑','😶','🫥','😏','😒','🙄','😬','😮‍💨','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐'],
  'Hands': ['👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🙏','💪','🫶'],
  'Hearts': ['❤️','🧡','💛','💚','💙','🩵','💜','🖤','🩶','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','💕','💞','💓','💗','💖','💘','💝','💟'],
  'Animals': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🐔','🐧','🐦','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🦋','🐌','🐞','🐢','🐍','🦎','🐙','🦑','🦀','🐬','🐳','🦈','🐊','🦖','🦕'],
  'Food': ['🍎','🍊','🍋','🍉','🍇','🍓','🫐','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🥑','🥦','🥕','🌽','🌶️','🍔','🍟','🍕','🌭','🥪','🌮','🌯','🍜','🍣','🍩','🍪','🎂','🍫','🍿','🧋','☕'],
  'Activities': ['⚽','🏀','🏈','⚾','🎾','🏐','🎮','🕹️','🎯','🎲','🎳','🎨','🎤','🎧','🎬','🎹','🎸','🏆','🥇','🎉','🎊','🎁','🚀','🛸'],
  'Symbols': ['🔥','💯','✨','⭐','🌟','💫','⚡','💥','💢','💤','💨','💬','👁️','👀','💀','☠️','🤡','👻','👽','🤖','🗿','✅','❌','⚠️','🚫','♻️','🔞','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪']
}
const EMOJIS = [...new Set(Object.values(EMOJI_GROUPS).flat())]
const QUICK_STICKERS = ['😂','😭','💀','🔥','🗿','🥶','🤡','👀','🫡','🤨','😈','🐸','✨','💯','🗣️','🙏']
function formatBytes(size: number) { return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(2)} MB` }
function safeHttpUrl(value: string) { try { const u = new URL(value); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null } catch { return null } }
function renderMessageText(content: string) {
  const parts = content.split(/(https?:\/\/[^\s<>]+|\*\*[^*]+\*\*|~~[^~]+~~|`[^`]+`|(?<!\*)\*[^*]+\*(?!\*))/g)
  return parts.map((part, index) => {
    const url = safeHttpUrl(part.replace(/[),.!?]+$/, ''))
    if (url && part.startsWith('http')) { const trailing = part.slice(url.length); return <span key={index}><a href={url} target="_blank" rel="noopener noreferrer nofollow">{url}</a>{trailing}</span> }
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>
    if (part.startsWith('~~') && part.endsWith('~~')) return <del key={index}>{part.slice(2, -2)}</del>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>
    if (part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>
    return <span key={index}>{part}</span>
  })
}
const EMOJI_KEYWORDS: Record<string, string> = { '😀':'grinning happy face','😂':'joy laughing tears','🥹':'holding back tears','😍':'heart eyes love','😎':'cool sunglasses','😭':'crying sad sob','🤔':'thinking question','🔥':'fire lit hot','❤️':'red heart love','💀':'skull dead','👍':'thumbs up like','👎':'thumbs down dislike','🎉':'party popper celebration','👏':'clap applause','🙏':'pray thanks please','💯':'hundred perfect score','✨':'sparkles shiny','👀':'eyes look see','🤝':'handshake deal','🚀':'rocket launch','😡':'angry mad','🥶':'cold freezing','🫡':'salute','🙌':'raised hands celebrate','💜':'purple heart','🤣':'rolling laughing','😊':'smile happy','😴':'sleep tired','🤯':'exploding head mind blown','🥳':'party face birthday','⚡':'lightning bolt energy','🗿':'moai stone face','🐶':'dog puppy','🐱':'cat kitten','🦊':'fox','🐸':'frog','🍕':'pizza food','🍔':'burger hamburger','🍟':'fries','☕':'coffee','⚽':'soccer football','🎮':'video game controller','🏆':'trophy winner','⭐':'star favorite','❌':'cross x nope','✅':'check mark yes' }
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
  const [emojiSearch, setEmojiSearch] = useState(''); const [emojiTab, setEmojiTab] = useState('Frequently used'); const [favoriteEmojis, setFavoriteEmojis] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('pulse-favorite-emojis') || '[]') } catch { return [] } })
  const [showPlusMenu, setShowPlusMenu] = useState(false); const [showPollModal, setShowPollModal] = useState(false); const [pollQuestion, setPollQuestion] = useState(''); const [pollOptionsDraft, setPollOptionsDraft] = useState(['','']); const [uploading, setUploading] = useState(false); const [customEmojiName, setCustomEmojiName] = useState(''); const [customEmojis, setCustomEmojis] = useState<{id:string;name:string;path:string;url?:string}[]>([]); const [customEmojiModal, setCustomEmojiModal] = useState(false)
  const [showCreate, setShowCreate] = useState(false); const [showJoin, setShowJoin] = useState(false); const [communityName, setCommunityName] = useState(''); const [inviteCode, setInviteCode] = useState('')
  const [copied, setCopied] = useState(false); const [loadingMessages, setLoadingMessages] = useState(false)
  const [messageSearch, setMessageSearch] = useState(''); const [searchOpen, setSearchOpen] = useState(false)
  const [bookmarks, setBookmarks] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('pulse-bookmarks') || '[]') } catch { return [] } })
  const [pinnedMessages, setPinnedMessages] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('pulse-pinned-messages') || '[]') } catch { return [] } })
  const [gifOpen, setGifOpen] = useState(false); const [gifSearch, setGifSearch] = useState(''); const [gifResults, setGifResults] = useState<{url:string;title:string;preview:string}[]>([]); const [gifLoading, setGifLoading] = useState(false)
  const [recording, setRecording] = useState(false); const [recordingSeconds, setRecordingSeconds] = useState(0); const mediaRecorderRef = useRef<MediaRecorder | null>(null); const recordedChunksRef = useRef<Blob[]>([])
  const [dragOver, setDragOver] = useState(false); const [imageViewer, setImageViewer] = useState<string | null>(null); const [typingUsers, setTypingUsers] = useState<string[]>([]); const typingChannelRef = useRef<any>(null); const typingTimeoutRef = useRef<number | null>(null); const lastTypingSentRef = useRef(0)
  const bottomRef = useRef<HTMLDivElement>(null); const inputRef = useRef<HTMLInputElement>(null); const fileInputRef = useRef<HTMLInputElement>(null); const customEmojiInputRef = useRef<HTMLInputElement>(null)

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
    const { data, error } = await supabase.from('messages').select('id,channel_id,user_id,content,created_at,edited_at,reply_to,attachment_path,attachment_name,attachment_type,attachment_size,profiles(username)').eq('channel_id', channelId).order('created_at', { ascending: true }).limit(100)
    if (error) { if (!silent) setNotice(error.message); setLoadingMessages(false); return }
    const list = (data || []).map((m: any) => ({ ...m, profiles: Array.isArray(m.profiles) ? m.profiles[0] : m.profiles })) as ChatMessage[]
    const ids = list.map(m => m.id)
    let reactions: Reaction[] = []
    if (ids.length) {
      const result = await supabase.from('message_reactions').select('id,message_id,user_id,emoji').in('message_id', ids)
      if (!result.error) reactions = (result.data || []) as Reaction[]
    }
    const enriched = await Promise.all(list.map(async (m) => {
      let attachment_url: string | undefined
      if (m.attachment_path) {
        const { data: signed } = await supabase.storage.from('pulse-uploads').createSignedUrl(m.attachment_path, 60 * 60)
        attachment_url = signed?.signedUrl
      }
      return { ...m, attachment_url, reactions: reactions.filter(r => r.message_id === m.id) }
    }))
    if (ids.length) {
      const { data: pollRows } = await supabase.from('message_polls').select('id,message_id,channel_id,created_by').in('message_id', ids)
      const pollList = pollRows || []
      if (pollList.length) {
        const pollIds = pollList.map((poll: any) => poll.id)
        const [{ data: optionRows }, { data: voteRows }] = await Promise.all([
          supabase.from('poll_options').select('id,poll_id,label,position').in('poll_id', pollIds).order('position'),
          supabase.from('poll_votes').select('id,poll_id,option_id,user_id').in('poll_id', pollIds)
        ])
        for (const message of enriched) {
          const poll: any = pollList.find((row: any) => row.message_id === message.id)
          if (poll) message.poll = { ...poll, options: (optionRows || []).filter((o: any) => o.poll_id === poll.id), votes: (voteRows || []).filter((v: any) => v.poll_id === poll.id) }
        }
      }
    }
    if (channelId === activeChannel?.id) setMessages(enriched as ChatMessage[])
    setLoadingMessages(false)
  }, [activeChannel?.id])

  useEffect(() => {
    if (!activeChannel) { setMessages([]); return }
    setTypingUsers([])
    try { setDraft(localStorage.getItem(`pulse-draft:${activeChannel.id}`) || '') } catch { setDraft('') }
    const channelId = activeChannel.id
    void reloadMessages(channelId)
    const channel = supabase.channel(`message-events:${channelId}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'typing' }, ({ payload }) => { if (payload?.userId && payload.userId !== session?.user.id) { setTypingUsers(current => [...new Set([...current, String(payload.username || 'Someone')])]); window.setTimeout(() => setTypingUsers(current => current.filter(name => name !== String(payload.username || 'Someone'))), 2200) } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` }, (payload) => { void reloadMessages(channelId, true); const row = payload.new as any; if (payload.eventType === 'INSERT' && row?.user_id !== session?.user.id && document.hidden && 'Notification' in window && Notification.permission === 'granted') { const sender = String(row?.content || 'New message').slice(0, 100); new Notification(`New message in #${activeChannel?.name || 'chat'}`, { body: sender, tag: `pulse-${row?.id || Date.now()}` }) } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, () => { void reloadMessages(channelId, true) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_polls' }, () => { void reloadMessages(channelId, true) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_options' }, () => { void reloadMessages(channelId, true) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, () => { void reloadMessages(channelId, true) })
      .subscribe()
    typingChannelRef.current = channel
    return () => { typingChannelRef.current = null; void supabase.removeChannel(channel) }
  }, [activeChannel?.id, reloadMessages, session?.user.id])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length, activeChannel?.id])
  useEffect(() => { document.title = activeChannel ? `#${activeChannel.name} · Pulse` : 'Pulse'; return () => { document.title = 'Pulse' } }, [activeChannel?.id, activeChannel?.name])

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
    if (/@everyone\b/i.test(content) && activeCommunity?.owner_id !== session.user.id) { setNotice('@everyone is restricted to the community owner.'); return }
    setBusy(true); setNotice('')
    if (editingId) {
      const { error } = await supabase.from('messages').update({ content, edited_at: new Date().toISOString() }).eq('id', editingId).eq('user_id', session.user.id)
      setBusy(false)
      if (error) { setNotice(error.message); return }
      setMessages(current => current.map(m => m.id === editingId ? { ...m, content, edited_at: new Date().toISOString() } : m))
      setEditingId(null); setDraft(''); return
    }
    const { data, error } = await supabase.from('messages').insert({ channel_id: activeChannel.id, user_id: session.user.id, content, reply_to: replyTo?.id || null }).select('id,channel_id,user_id,content,created_at,edited_at,reply_to,attachment_path,attachment_name,attachment_type,attachment_size').single()
    setBusy(false)
    if (error) { setNotice(error.message); return }
    setMessages(current => current.some(m => m.id === data.id) ? current : [...current, { ...data, profiles: { username: myUsername }, reactions: [] } as ChatMessage])
    setDraft(''); setReplyTo(null); setEmojiOpen(false); setGifOpen(false)
    try { localStorage.removeItem(`pulse-draft:${activeChannel.id}`) } catch { /* storage may be unavailable */ }
  }
  function startEdit(message: ChatMessage) { setEditingId(message.id); setReplyTo(null); setDraft(message.content); setEmojiOpen(false); inputRef.current?.focus() }
  async function deleteMessage(message: ChatMessage) {
    if (!session || !window.confirm('Delete this message? This cannot be undone.')) return
    const { error } = await supabase.from('messages').delete().eq('id', message.id).eq('user_id', session.user.id)
    if (error) { setNotice(error.message); return }
    setMessages(current => current.filter(m => m.id !== message.id))
    setBookmarks(current => current.filter(id => id !== message.id)); setPinnedMessages(current => current.filter(id => id !== message.id))
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
  function insertEmoji(emoji: string) {
    const input = inputRef.current
    const start = input?.selectionStart ?? draft.length
    const end = input?.selectionEnd ?? draft.length
    setDraft(current => current.slice(0, start) + emoji + current.slice(end))
    requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.setSelectionRange(start + emoji.length, start + emoji.length) })
    const next = [emoji, ...EMOJIS.filter(e => e !== emoji)].slice(0, 24)
    try { localStorage.setItem('pulse-recent-emojis', JSON.stringify(next)) } catch { /* storage may be unavailable */ }
  }
  function toggleFavoriteEmoji(emoji: string) {
    setFavoriteEmojis(current => {
      const next = current.includes(emoji) ? current.filter(e => e !== emoji) : [emoji, ...current]
      try { localStorage.setItem('pulse-favorite-emojis', JSON.stringify(next)) } catch { /* storage may be unavailable */ }
      return next
    })
  }
  function toggleBookmark(messageId: string) { setBookmarks(current => { const next = current.includes(messageId) ? current.filter(id => id !== messageId) : [...current, messageId]; try { localStorage.setItem('pulse-bookmarks', JSON.stringify(next)) } catch { /* storage may be unavailable */ } return next }) }
  function togglePin(messageId: string) { setPinnedMessages(current => { const next = current.includes(messageId) ? current.filter(id => id !== messageId) : [...current, messageId]; try { localStorage.setItem('pulse-pinned-messages', JSON.stringify(next)) } catch { /* storage may be unavailable */ } return next }) }
  function formatDraft(before: string, after = before) { const input = inputRef.current; const start = input?.selectionStart ?? draft.length; const end = input?.selectionEnd ?? draft.length; const selected = draft.slice(start, end); const replacement = `${before}${selected || 'text'}${after}`; const next = draft.slice(0, start) + replacement + draft.slice(end); setDraft(next); requestAnimationFrame(() => { inputRef.current?.focus(); const selectionStart = start + before.length; const selectionEnd = selectionStart + (selected || 'text').length; inputRef.current?.setSelectionRange(selectionStart, selectionEnd) }) }
  async function searchGifs(query: string) { setGifSearch(query); const apiKey = import.meta.env.VITE_GIPHY_API_KEY as string | undefined; if (!apiKey) { setGifResults([]); return } setGifLoading(true); try { const endpoint = query.trim() ? 'search' : 'trending'; const url = `https://api.giphy.com/v1/gifs/${endpoint}?api_key=${encodeURIComponent(apiKey)}&limit=18&rating=pg-13${query.trim() ? `&q=${encodeURIComponent(query.trim())}` : ''}`; const response = await fetch(url); if (!response.ok) throw new Error('GIF search failed'); const json = await response.json(); setGifResults((json.data || []).map((item: any) => ({ url: item.images?.original?.url || item.images?.downsized_medium?.url, preview: item.images?.fixed_width_small?.url || item.images?.preview_gif?.url, title: item.title || 'GIF' })).filter((item: any) => item.url && item.preview)) } catch { setNotice('Could not load GIFs. Check your GIF API key or connection.') } finally { setGifLoading(false) } }
  async function sendGif(url: string) { if (!session || !activeChannel) return; const { data, error } = await supabase.from('messages').insert({ channel_id: activeChannel.id, user_id: session.user.id, content: url, reply_to: replyTo?.id || null }).select('id,channel_id,user_id,content,created_at,edited_at,reply_to').single(); if (error) { setNotice(error.message); return } setMessages(current => [...current, { ...data, profiles: { username: myUsername }, reactions: [] } as ChatMessage]); setGifOpen(false); setReplyTo(null) }
  async function sendSticker(sticker: string) { if (!session || !activeChannel) return; const { data, error } = await supabase.from('messages').insert({ channel_id: activeChannel.id, user_id: session.user.id, content: sticker, reply_to: replyTo?.id || null }).select('id,channel_id,user_id,content,created_at,edited_at,reply_to').single(); if (error) { setNotice(error.message); return } setMessages(current => [...current, { ...data, profiles: { username: myUsername }, reactions: [] } as ChatMessage]); setGifOpen(false); setReplyTo(null) }
  async function startVoiceRecording() { if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { setNotice('Voice recording is not supported in this browser.'); return } try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const recorder = new MediaRecorder(stream); recordedChunksRef.current = []; recorder.ondataavailable = event => { if (event.data.size) recordedChunksRef.current.push(event.data) }; recorder.onstop = () => { const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'audio/webm' }); stream.getTracks().forEach(track => track.stop()); if (blob.size) { const extension = blob.type.includes('mp4') ? 'm4a' : 'webm'; void uploadAttachment(new File([blob], `voice-message-${Date.now()}.${extension}`, { type: blob.type || 'audio/webm' })) } }; recorder.start(); mediaRecorderRef.current = recorder; setRecording(true); setRecordingSeconds(0); const startedAt = Date.now(); const tick = () => { if (mediaRecorderRef.current?.state === 'recording') { setRecordingSeconds(Math.floor((Date.now() - startedAt) / 1000)); window.setTimeout(tick, 500) } }; tick() } catch { setNotice('Microphone permission was denied or unavailable.') } }
  function stopVoiceRecording() { if (mediaRecorderRef.current?.state === 'recording') { mediaRecorderRef.current.stop(); setRecording(false); mediaRecorderRef.current = null } }
  function handleComposerTyping(value: string) { setDraft(value); if (activeChannel) { try { localStorage.setItem(`pulse-draft:${activeChannel.id}`, value) } catch { /* storage may be unavailable */ } } const now = Date.now(); if (now - lastTypingSentRef.current > 900 && typingChannelRef.current) { lastTypingSentRef.current = now; void typingChannelRef.current.send({ type: 'broadcast', event: 'typing', payload: { userId: session?.user.id, username: myUsername } }) } }

  async function uploadAttachment(file?: File) {
    if (!file || !session || !activeChannel || !activeCommunity) return
    if (file.size > 15 * 1024 * 1024) { setNotice('Files must be 15 MB or smaller.'); return }
    setUploading(true); setNotice('')
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'upload'
    const path = `${activeChannel.id}/${session.user.id}/${crypto.randomUUID()}_${safeName}`
    const { error: uploadError } = await supabase.storage.from('pulse-uploads').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
    if (uploadError) { setUploading(false); setNotice(`Upload failed: ${uploadError.message}`); return }
    const { data, error } = await supabase.from('messages').insert({ channel_id: activeChannel.id, user_id: session.user.id, content: `📎 ${file.name}`, attachment_path: path, attachment_name: file.name, attachment_type: file.type || 'application/octet-stream', attachment_size: file.size }).select('id,channel_id,user_id,content,created_at,edited_at,reply_to,attachment_path,attachment_name,attachment_type,attachment_size').single()
    setUploading(false)
    if (error) { await supabase.storage.from('pulse-uploads').remove([path]); setNotice(`Could not send attachment: ${error.message}`); return }
    const { data: signed } = await supabase.storage.from('pulse-uploads').createSignedUrl(path, 60 * 60)
    setMessages(current => [...current, { ...data, attachment_url: signed?.signedUrl, profiles: { username: myUsername }, reactions: [] } as ChatMessage])
    setShowPlusMenu(false)
  }
  async function createPoll(event: FormEvent) {
    event.preventDefault()
    if (!session || !activeChannel) return
    const question = pollQuestion.trim()
    const options = pollOptionsDraft.map(option => option.trim()).filter(Boolean)
    if (!question || options.length < 2) { setNotice('A poll needs a question and at least two options.'); return }
    if (options.length > 10) { setNotice('Polls can have up to 10 options.'); return }
    setBusy(true)
    const { data: message, error: messageError } = await supabase.from('messages').insert({ channel_id: activeChannel.id, user_id: session.user.id, content: question }).select('id,channel_id,user_id,content,created_at,edited_at,reply_to').single()
    if (messageError || !message) { setBusy(false); setNotice(messageError?.message || 'Could not create poll message.'); return }
    const { data: poll, error: pollError } = await supabase.from('message_polls').insert({ message_id: message.id, channel_id: activeChannel.id, created_by: session.user.id }).select('id,message_id,channel_id,created_by').single()
    if (pollError || !poll) { setBusy(false); setNotice(`Poll message created, but poll setup failed: ${pollError?.message || 'unknown error'}`); return }
    const { error: optionError } = await supabase.from('poll_options').insert(options.map((label, position) => ({ poll_id: poll.id, label, position })))
    setBusy(false)
    if (optionError) { setNotice(`Poll created, but options failed: ${optionError.message}`); return }
    setMessages(current => [...current, { ...message, profiles: { username: myUsername }, reactions: [], poll: { ...poll, options: options.map((label, position) => ({ id: `temp-${position}`, poll_id: poll.id, label, position })), votes: [] } } as ChatMessage])
    setPollQuestion(''); setPollOptionsDraft(['','']); setShowPollModal(false); setShowPlusMenu(false)
    void reloadMessages(activeChannel.id, true)
  }
  async function votePoll(poll: MessagePoll, option: PollOption) {
    if (!session) return
    const existing = poll.votes.find(v => v.user_id === session.user.id)
    if (existing?.option_id === option.id) {
      const { error } = await supabase.from('poll_votes').delete().eq('id', existing.id).eq('user_id', session.user.id)
      if (error) setNotice(error.message)
    } else if (existing) {
      const { error } = await supabase.from('poll_votes').update({ option_id: option.id }).eq('id', existing.id).eq('user_id', session.user.id)
      if (error) setNotice(error.message)
    } else {
      const { error } = await supabase.from('poll_votes').insert({ poll_id: poll.id, option_id: option.id, user_id: session.user.id })
      if (error) setNotice(error.message)
    }
    if (activeChannel) void reloadMessages(activeChannel.id, true)
  }
  async function uploadCustomEmoji(file?: File) {
    if (!file || !session || !activeCommunity) return
    if (!file.type.startsWith('image/')) { setNotice('Custom emojis must be image files.'); return }
    if (file.size > 512 * 1024) { setNotice('Custom emojis must be 512 KB or smaller.'); return }
    const name = customEmojiName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 32)
    if (!name) { setNotice('Give your custom emoji a name first.'); return }
    setUploading(true)
    const path = `${activeCommunity.id}/${session.user.id}/${crypto.randomUUID()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const { error: uploadError } = await supabase.storage.from('pulse-uploads').upload(path, file, { contentType: file.type, upsert: false })
    if (uploadError) { setUploading(false); setNotice(uploadError.message); return }
    const { data, error } = await supabase.from('custom_emojis').insert({ community_id: activeCommunity.id, created_by: session.user.id, name, storage_path: path }).select('id,name,storage_path').single()
    setUploading(false)
    if (error) { await supabase.storage.from('pulse-uploads').remove([path]); setNotice(error.message); return }
    const { data: signed } = await supabase.storage.from('pulse-uploads').createSignedUrl(path, 60 * 60)
    setCustomEmojis(current => [{ id: data.id, name: data.name, path: data.storage_path, url: signed?.signedUrl }, ...current.filter(e => e.name !== data.name)])
    setCustomEmojiName(''); setCustomEmojiModal(false); setEmojiOpen(true); setNotice('Custom emoji added to this community!')
  }
  useEffect(() => {
    if (!activeCommunity) { setCustomEmojis([]); return }
    let cancelled = false
    async function loadCustomEmojis() {
      const { data, error } = await supabase.from('custom_emojis').select('id,name,storage_path').eq('community_id', activeCommunity!.id).order('created_at', { ascending: false })
      if (error) return
      const items = await Promise.all((data || []).map(async (item: any) => {
        const { data: signed } = await supabase.storage.from('pulse-uploads').createSignedUrl(item.storage_path, 60 * 60)
        return { id: item.id, name: item.name, path: item.storage_path, url: signed?.signedUrl }
      }))
      if (!cancelled) setCustomEmojis(items)
    }
    void loadCustomEmojis()
    return () => { cancelled = true }
  }, [activeCommunity?.id])

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
      <section className="chat-panel"><header className="chat-header"><div className="channel-heading"><div className="hash-large"><Hash size={22}/></div><div><h1>{activeChannel?.name || 'Welcome'}</h1><p>{activeCommunity ? activeCommunity.name : 'Your communities, all in one place'}</p></div></div><div className="chat-header-tools">{searchOpen && <input className="message-search-input" value={messageSearch} onChange={e => setMessageSearch(e.target.value)} placeholder="Search this channel…" aria-label="Search messages" autoFocus/>}<button className="icon-button" title="Search messages" onClick={() => { setSearchOpen(v => !v); if (searchOpen) setMessageSearch('') }}><Search size={17}/></button><button className="icon-button" title="Request notifications" onClick={() => { if ('Notification' in window) void Notification.requestPermission().then(permission => setNotice(permission === 'granted' ? 'Browser notifications enabled.' : 'Notifications were not enabled.')) }}><Bell size={16}/></button><div className="header-status"><span className="status-dot"/><span>Live chat</span></div></div></header>
        {activeChannel ? <><div className={`messages-area ${dragOver ? 'drag-over' : ''}`} onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={e => { if (e.currentTarget === e.target) setDragOver(false) }} onDrop={e => { e.preventDefault(); setDragOver(false); const file = e.dataTransfer.files?.[0]; if (file) void uploadAttachment(file) }}>
          {dragOver && <div className="drop-overlay"><Upload size={24}/> Drop a file to send it</div>}
          {loadingMessages && <div className="inline-loading"><LoaderCircle className="spin" size={18}/> Loading messages…</div>}
          {!loadingMessages && messages.length === 0 && <div className="chat-welcome"><div className="welcome-icon"><Hash size={28}/></div><h2>Welcome to #{activeChannel.name}</h2><p>This is the beginning of the conversation. Say something nice.</p></div>}
          {messages.filter(message => !messageSearch.trim() || `${message.content} ${message.profiles?.username || ''}`.toLowerCase().includes(messageSearch.trim().toLowerCase())).map(message => {
            const parent = messages.find(m => m.id === message.reply_to)
            const groups = Object.values((message.reactions || []).reduce((acc: Record<string, { emoji: string; count: number; mine: boolean }>, r) => { acc[r.emoji] ||= { emoji: r.emoji, count: 0, mine: false }; acc[r.emoji].count++; if (r.user_id === session.user.id) acc[r.emoji].mine = true; return acc }, {})) as { emoji: string; count: number; mine: boolean }[]
            return <article className="message-row" key={message.id}><div className={`avatar message-avatar avatar-color-${message.user_id.charCodeAt(0) % 4}`}>{initials(message.profiles?.username || 'User')}</div><div className="message-body"><div className="message-meta"><strong>{message.profiles?.username || 'Community member'}</strong><time>{timeLabel(message.created_at)}</time>{message.user_id === session.user.id && <span className="you-tag">YOU</span>}{message.edited_at && <span className="edited-tag">edited</span>}</div>
              {message.reply_to && <div className="reply-reference"><Reply size={13}/><span>Reply to <b>{parent?.profiles?.username || 'message'}</b>: {parent ? parent.content.slice(0, 100) : 'Original message unavailable'}</span></div>}
              {!message.poll && <p className="message-content">{/^https?:\/\/[^\s]+\.(gif|png|jpe?g|webp)(\?.*)?$/i.test(message.content.trim()) ? <img className="message-gif" src={safeHttpUrl(message.content.trim()) || ''} alt="Shared GIF" loading="lazy" onClick={() => setImageViewer(message.content.trim())}/> : message.content.split(/(:[a-z0-9_]{1,32}:)/gi).map((part, index) => { const match = part.match(/^:([a-z0-9_]{1,32}):$/i); const custom = match ? customEmojis.find(item => item.name === match[1].toLowerCase()) : undefined; return custom?.url ? <img key={index} className="inline-custom-emoji" src={custom.url} alt={`:${custom.name}:`} title={`:${custom.name}:`} /> : <span key={index}>{renderMessageText(part)}</span> })}</p>}
              {message.attachment_path && (message.attachment_type?.startsWith('image/') && message.attachment_url ? <button type="button" className="attachment-image-button" onClick={() => setImageViewer(message.attachment_url!)}><img className="attachment-image" src={message.attachment_url} alt={message.attachment_name || 'Image attachment'} loading="lazy"/></button> : message.attachment_type?.startsWith('audio/') && message.attachment_url ? <div className="audio-attachment"><audio controls preload="none" src={message.attachment_url}/><span>{message.attachment_name || 'Voice message'}</span></div> : <div className="attachment-card"><div className="attachment-icon"><FileText size={20}/></div><div className="attachment-info"><strong>{message.attachment_name || 'Attachment'}</strong><span>{message.attachment_size ? formatBytes(message.attachment_size) : 'File attachment'}</span></div>{message.attachment_url && <a href={message.attachment_url} target="_blank" rel="noopener noreferrer" className="attachment-download"><Download size={16}/> Open</a>}</div>)}
              {message.poll && <div className="poll-card"><strong className="poll-title"><BarChart3 size={16}/> Poll</strong><div className="poll-question">{message.content}</div>{message.poll.options.map(option => { const votes = message.poll!.votes.filter(v => v.option_id === option.id); const total = message.poll!.votes.length; const mine = votes.some(v => v.user_id === session.user.id); return <button key={option.id} className={`poll-option ${mine ? 'voted' : ''}`} onClick={() => void votePoll(message.poll!, option)}><span>{option.label}</span><span>{votes.length}{total ? ` · ${Math.round(votes.length / total * 100)}%` : ''}</span><span className="poll-bar" style={{width: `${total ? votes.length / total * 100 : 0}%`}}/></button>})}<span className="poll-footnote">{message.poll.votes.length} vote{message.poll.votes.length === 1 ? '' : 's'} · Click an option to vote or change your vote</span></div>}
              {groups.length > 0 && <div className="reaction-list">{groups.map(g => <button key={g.emoji} className={`reaction-chip ${g.mine ? 'mine' : ''}`} title={`${g.count} reaction${g.count === 1 ? '' : 's'}`} onClick={() => void toggleReaction(message, g.emoji)}>{g.emoji} <span>{g.count}</span></button>)}</div>}
              <div className="message-actions"><button title="Reply" onClick={() => { setReplyTo(message); setEditingId(null); setDraft(''); inputRef.current?.focus() }}><Reply size={14}/> Reply</button><button title="Add reaction" onClick={() => setReactionPicker(reactionPicker === message.id ? null : message.id)}><Smile size={14}/> React</button><button title={bookmarks.includes(message.id) ? 'Remove bookmark' : 'Bookmark'} onClick={() => toggleBookmark(message.id)}><Bookmark size={13} fill={bookmarks.includes(message.id) ? 'currentColor' : 'none'}/></button><button title={pinnedMessages.includes(message.id) ? 'Unpin locally' : 'Pin locally'} onClick={() => togglePin(message.id)}><Pin size={13} fill={pinnedMessages.includes(message.id) ? 'currentColor' : 'none'}/></button>{message.user_id === session.user.id && <><button title="Edit message" onClick={() => startEdit(message)}><Pencil size={13}/> Edit</button><button className="delete-action" title="Delete message" onClick={() => void deleteMessage(message)}><Trash2 size={13}/> Delete</button></>}</div>
              {reactionPicker === message.id && <div className="emoji-popover reaction-popover">{EMOJIS.slice(0, 20).map(emoji => <button key={emoji} title={emoji} onClick={() => void toggleReaction(message, emoji)}>{emoji}</button>)}</div>}
            </div></article>
          })}{typingUsers.length > 0 && <div className="typing-indicator">{typingUsers.slice(0, 2).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing<span>…</span></div>}<div ref={bottomRef}/></div>
          <form className="composer-wrap" onSubmit={sendMessage}>
            {(replyTo || editingId) && <div className="composer-context"><div><strong>{editingId ? 'Editing message' : `Replying to ${replyTo?.profiles?.username || 'message'}`}</strong><span>{editingId ? 'Save your changes or cancel.' : replyTo?.content}</span></div><button type="button" title="Cancel" onClick={() => { setReplyTo(null); setEditingId(null); setDraft('') }}><X size={16}/></button></div>}
            <div className="format-toolbar"><button type="button" title="Bold" onClick={() => formatDraft('**','**')}><Bold size={14}/></button><button type="button" title="Italic" onClick={() => formatDraft('*','*')}><Italic size={14}/></button><button type="button" title="Strikethrough" onClick={() => formatDraft('~~','~~')}>S̶</button><button type="button" title="Inline code" onClick={() => formatDraft('`','`')}><Code size={14}/></button><span>Markdown supported</span></div>
            <div className="composer">
              <div className="plus-menu-wrap"><button type="button" className="plus-trigger" title="Attachments and more" onClick={() => { setShowPlusMenu(v => !v); setEmojiOpen(false) }}><Plus size={22}/></button>{showPlusMenu && <div className="plus-menu"><button type="button" onClick={() => fileInputRef.current?.click()}><Upload size={17}/> Upload a File</button><button type="button" onClick={() => { setGifOpen(v => !v); setShowPlusMenu(false); if (!gifOpen) void searchGifs('') }}><Film size={17}/> GIFs & stickers</button><button type="button" onClick={() => { setShowPollModal(true); setShowPlusMenu(false) }}><BarChart3 size={17}/> Create Poll</button><button type="button" onClick={() => { setCustomEmojiModal(true); setShowPlusMenu(false) }}><Smile size={17}/> Add Custom Emoji</button><div className="plus-menu-disabled"><span>Threads</span><small>Coming later</small></div><div className="plus-menu-disabled"><span>Apps</span><small>Coming later</small></div></div>}</div>
              <input ref={inputRef} value={draft} onChange={e => handleComposerTyping(e.target.value)} placeholder={editingId ? 'Edit your message…' : replyTo ? 'Write a reply…' : `Message #${activeChannel.name}`} maxLength={4000} aria-label="Message" />
              <button type="button" className={`voice-trigger ${recording ? 'recording' : ''}`} title={recording ? 'Stop and send voice message' : 'Record voice message'} onClick={() => recording ? stopVoiceRecording() : void startVoiceRecording()}>{recording ? <Square size={16} fill="currentColor"/> : <Mic size={18}/>}</button>
              <button type="button" className="emoji-trigger" title="Insert emoji" onClick={() => { setEmojiOpen(!emojiOpen); setShowPlusMenu(false) }}><Smile size={19}/></button>
              <button className="send-button" disabled={(!draft.trim() && !uploading) || busy} title={editingId ? 'Save edit' : 'Send message'}>{busy ? <LoaderCircle className="spin" size={17}/> : editingId ? <Check size={18}/> : <Send size={18}/>}</button>
            </div>
            <input ref={fileInputRef} type="file" className="hidden-file-input" onChange={e => { const file = e.target.files?.[0]; if (file) void uploadAttachment(file); e.currentTarget.value = '' }} />
            {uploading && <div className="upload-progress"><LoaderCircle className="spin" size={15}/> Uploading…</div>}{recording && <div className="recording-status"><span className="recording-dot"/> Recording voice message · {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, '0')} · click the square to stop and send</div>}
            {gifOpen && <div className="gif-picker"><div className="gif-picker-head"><strong>GIFs & stickers</strong><label><Search size={14}/><input value={gifSearch} onChange={e => void searchGifs(e.target.value)} placeholder="Search GIFs…"/></label><button type="button" className="icon-button" onClick={() => setGifOpen(false)} aria-label="Close GIF picker"><X size={15}/></button></div><div className="sticker-row"><span>Quick stickers</span>{QUICK_STICKERS.map(sticker => <button type="button" key={sticker} title={`Send ${sticker} sticker`} onClick={() => void sendSticker(sticker)}>{sticker}</button>)}</div>{!import.meta.env.VITE_GIPHY_API_KEY && <p className="gif-setup-note">GIF search needs a GIPHY API key. Add <code>VITE_GIPHY_API_KEY</code> to your local environment file, then restart Vite.</p>}<div className="gif-results">{gifLoading && <p>Searching…</p>}{gifResults.map((gif, index) => <button type="button" key={`${gif.url}-${index}`} title={gif.title} onClick={() => void sendGif(gif.url)}><img src={gif.preview} alt={gif.title} loading="lazy"/></button>)}{!gifLoading && gifResults.length === 0 && import.meta.env.VITE_GIPHY_API_KEY && <p>Search for a GIF or try trending.</p>}</div><p className="gif-attribution">GIF results provided by GIPHY.</p></div>}
            {emojiOpen && <div className="emoji-popover composer-emoji"><div className="emoji-picker-head"><div className="emoji-tabs">{['Frequently used','Smileys','Hands','Hearts','Animals','Food','Activities','Symbols','Favorites','Custom'].map(tab => <button type="button" key={tab} className={emojiTab === tab ? 'selected' : ''} onClick={() => { setEmojiTab(tab); setEmojiSearch('') }}>{tab}</button>)}</div><label className="emoji-search"><Search size={15}/><input value={emojiSearch} onChange={e => setEmojiSearch(e.target.value)} placeholder="Search emojis…" /></label></div><div className="emoji-grid">{(emojiTab === 'Favorites' ? favoriteEmojis : emojiTab === 'Custom' ? [] : (EMOJI_GROUPS[emojiTab] || EMOJIS)).filter(emoji => !emojiSearch || emoji.toLowerCase().includes(emojiSearch.toLowerCase()) || (EMOJI_KEYWORDS[emoji] || '').includes(emojiSearch.toLowerCase())).map(emoji => <div className="emoji-cell" key={emoji}><button type="button" className="emoji-pick" title={`Insert ${emoji}`} onClick={() => insertEmoji(emoji)}>{emoji}</button><button type="button" className={`emoji-fav ${favoriteEmojis.includes(emoji) ? 'favorited' : ''}`} title={favoriteEmojis.includes(emoji) ? 'Remove favorite' : 'Favorite emoji'} onClick={() => toggleFavoriteEmoji(emoji)}><Star size={11} fill={favoriteEmojis.includes(emoji) ? 'currentColor' : 'none'}/></button></div>)}{emojiTab === 'Custom' && customEmojis.filter(item => !emojiSearch || item.name.includes(emojiSearch.toLowerCase())).map(item => <button type="button" key={item.id} className="custom-emoji-pick" title={`Insert :${item.name}:`} onClick={() => insertEmoji(`:${item.name}:`)}>{item.url ? <img src={item.url} alt={item.name}/> : '🙂'}<small>:{item.name}:</small></button>)}{emojiTab === 'Custom' && customEmojis.length === 0 && <p className="emoji-empty">No custom emojis in this community yet. Use + to add one.</p>}</div><div className="emoji-picker-foot"><span>Click an emoji to insert it into your message.</span><button type="button" onClick={() => setCustomEmojiModal(true)}><Plus size={13}/> Add custom</button></div></div>}
            <p className="composer-hint">Be kind. Keep it useful. <span>Enter to send</span></p>
          </form>
        </> : <div className="empty-chat"><div className="empty-icon"><MessageCircle size={28}/></div><h2>Make some noise.</h2><p>Create a community or join one to start chatting.</p><button className="primary-button small" onClick={() => setShowCreate(true)}><Plus size={15}/> Create community</button></div>}
      </section>
      {imageViewer && <div className="image-viewer" role="dialog" aria-modal="true" onClick={() => setImageViewer(null)}><button type="button" aria-label="Close image viewer" onClick={() => setImageViewer(null)}><X size={22}/></button><img src={imageViewer} alt="Expanded attachment" onClick={e => e.stopPropagation()}/></div>}
      {notice && <button className="toast" onClick={() => setNotice('')}>{notice} <span>×</span></button>}
      {showPollModal && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowPollModal(false) }}><form className="modal poll-modal" onSubmit={createPoll}><div className="modal-icon"><BarChart3 size={22}/></div><h2>Create a poll</h2><p>Ask your community a question. Members can vote and change their vote.</p><label>Question<input autoFocus value={pollQuestion} onChange={e => setPollQuestion(e.target.value)} placeholder="What should we play?" maxLength={240} required/></label><div className="poll-draft-options"><span className="field-label">Answer options</span>{pollOptionsDraft.map((option, index) => <input key={index} value={option} onChange={e => setPollOptionsDraft(current => current.map((v, i) => i === index ? e.target.value : v))} placeholder={`Option ${index + 1}`} maxLength={100} required={index < 2}/>)}</div><button type="button" className="secondary-button" disabled={pollOptionsDraft.length >= 10} onClick={() => setPollOptionsDraft(current => [...current, ''])}><Plus size={14}/> Add option</button><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowPollModal(false)}>Cancel</button><button className="primary-button" disabled={busy || !pollQuestion.trim() || pollOptionsDraft.filter(v => v.trim()).length < 2}>{busy ? 'Creating…' : 'Create poll'}</button></div></form></div>}
      {customEmojiModal && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setCustomEmojiModal(false) }}><form className="modal" onSubmit={e => { e.preventDefault(); customEmojiInputRef.current?.click() }}><div className="modal-icon"><Smile size={22}/></div><h2>Add a custom emoji</h2><p>Upload a small image for this community. PNG, GIF, or WebP up to 512 KB.</p><label>Emoji name<input autoFocus value={customEmojiName} onChange={e => setCustomEmojiName(e.target.value)} placeholder="e.g. azmi_lol" maxLength={32} pattern="[A-Za-z0-9_]+" required/></label><input ref={customEmojiInputRef} type="file" accept="image/png,image/gif,image/webp,image/jpeg" className="hidden-file-input" onChange={e => { const file = e.target.files?.[0]; if (file) void uploadCustomEmoji(file); e.currentTarget.value = '' }}/><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setCustomEmojiModal(false)}>Cancel</button><button className="primary-button" disabled={uploading || !customEmojiName.trim()}><Upload size={15}/> Choose image</button></div></form></div>}
      {showCreate && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowCreate(false) }}><form className="modal" onSubmit={createCommunity}><div className="modal-icon"><Users size={22}/></div><h2>Create a community</h2><p>Give your people a place to gather. A #general channel is created automatically.</p><label>Community name<input autoFocus value={communityName} onChange={e => setCommunityName(e.target.value)} placeholder="e.g. Gaming Hub" maxLength={48} required/></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowCreate(false)}>Cancel</button><button className="primary-button" disabled={busy || !communityName.trim()}>{busy ? 'Creating…' : 'Create community'}</button></div></form></div>}
      {showJoin && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowJoin(false) }}><form className="modal" onSubmit={joinCommunity}><div className="modal-icon"><ArrowRight size={22}/></div><h2>Join a community</h2><p>Paste the invite code your friend shared with you.</p><label>Invite code<input autoFocus value={inviteCode} onChange={e => setInviteCode(e.target.value)} placeholder="e.g. A1B2C3D4E5" maxLength={16} required/></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowJoin(false)}>Cancel</button><button className="primary-button" disabled={busy || !inviteCode.trim()}>{busy ? 'Joining…' : 'Join community'}</button></div></form></div>}
    </main>
  )
}
function SetupScreen() {
  return <main className="setup-page"><div className="setup-card"><div className="brand-icon"><MessageCircle size={24}/></div><p className="eyebrow">ONE LAST SETUP STEP</p><h1>Connect your database.</h1><p className="muted">The app is ready, but it needs your free Supabase project credentials to create real accounts and sync messages.</p><ol><li>Create a project at <a href="https://supabase.com" target="_blank" rel="noreferrer">supabase.com</a>.</li><li>In Supabase, open <b>SQL Editor</b>, paste <code>supabase/schema.sql</code> from this project, and run it.</li><li>Copy the Project URL and publishable/anon key from your project's API settings.</li><li>Copy <code>.env.example</code> to <code>.env.local</code>, then fill in both values.</li><li>Restart the development server.</li></ol><div className="setup-note"><ShieldCheck size={18}/><span>Only use the publishable/anon key in this browser app. Never put a service-role key in frontend code.</span></div><p className="muted small-text">After setup, reload this page to see the sign-up screen.</p></div></main>
}
