"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { RealtimeClient, type RealtimeStatus } from "@/lib/realtime/client";
import { copyDecryptedMessageText } from "@/lib/messages/client-actions";

type Conversation = { id: string; kind: "direct" | "group"; name: string | null; createdAt: string; updatedAt: string; memberCount: number };
type Profile = { username: string | null; displayName: string | null; bio: string | null; hasAvatar: boolean };
type Message = {
  id: string;
  conversationId: string;
  clientMessageId: string;
  ciphertext: string;
  encryptionVersion: number;
  sequence: string;
  createdAt: string;
  senderPublicId?: string;
  status?: "sending" | "sent" | "delivered" | "read";
  edited?: boolean;
  deleted?: boolean;
  replyTo?: string | null;
  reactions?: Record<string, number>;
};
type SearchItem = { type: "users" | "conversations" | "messages"; items: Array<Record<string, unknown>>; nextCursor: string | null };

type IconName = "search" | "plus" | "send" | "paperclip" | "menu" | "x" | "more" | "smile" | "check" | "check2" | "settings" | "user" | "logout" | "users" | "message" | "edit" | "trash" | "copy" | "reply" | "arrow";
function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    search: <><circle cx="11" cy="11" r="6.5"/><path d="m16 16 5 5"/></>, plus: <><path d="M12 5v14M5 12h14"/></>, send: <><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>, paperclip: <><path d="m20.5 11.5-8.7 8.7a6 6 0 0 1-8.5-8.5l9-9a4 4 0 0 1 5.7 5.7l-9 9a2 2 0 0 1-2.9-2.8l8.5-8.5"/></>, menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>, x: <><path d="m6 6 12 12M18 6 6 18"/></>, more: <><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></>, smile: <><circle cx="12" cy="12" r="9"/><path d="M8 14s1.4 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/></>, check: <path d="m5 12 4 4L19 6"/>, check2: <><path d="m4 12 4 4 8-8"/><path d="m9 16 2 2 8-8"/></>, settings: <><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="m19.4 15 .1.1a1.7 1.7 0 1 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 1 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 1 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0-1.2-2.9h-.2a1.7 1.7 0 1 1 0-3.4h.2A1.7 1.7 0 0 0 5.4 5.8l-.1-.1a1.7 1.7 0 1 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2V2a1.7 1.7 0 1 1 3.4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a1.7 1.7 0 1 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a1.7 1.7 0 1 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2 2.9Z"/></>, user: <><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/></>, logout: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M14 4h5v16h-5"/></>, users: <><path d="M16 21v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></>, message: <><path d="M20 15a4 4 0 0 1-4 4H8l-4 3v-7a4 4 0 0 1-1-3V7a4 4 0 0 1 4-4h9a4 4 0 0 1 4 4Z"/></>, edit: <><path d="m4 20 4-.8L19 8.2a2.1 2.1 0 0 0-3-3L5 16.2Z"/><path d="M14 7l3 3"/></>, trash: <><path d="M4 7h16M10 11v6M14 11v6"/><path d="M7 7l1 14h8l1-14M9 7l1-3h4l1 3"/></>, copy: <><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></>, reply: <><path d="M9 17 4 12l5-5"/><path d="M4 12h9a7 7 0 0 1 7 7v1"/></>, arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function decodeForDisplay(value: string) {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(normalized + "=".repeat((4 - normalized.length % 4) % 4)), c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch { return "Message unavailable"; }
}
function initials(value: string) { return value.trim().split(/\s+/).slice(0, 2).map(v => v[0]).join("").toUpperCase() || "?"; }
function time(value: string) { try { return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value)); } catch { return ""; } }

export default function HomePage() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [composer, setComposer] = useState("");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchType, setSearchType] = useState<"users" | "conversations" | "messages">("users");
  const [searchResults, setSearchResults] = useState<SearchItem | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupUsers, setGroupUsers] = useState("");
  const [toast, setToast] = useState("");
  const [rtStatus, setRtStatus] = useState<RealtimeStatus>("disconnected");
  const [typing, setTyping] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [replying, setReplying] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const pendingFileRef = useRef<File | null>(null);
  const realtime = useRef<RealtimeClient | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const active = conversations.find(c => c.id === activeId) ?? null;
  const activeMessages = useMemo(() => messages.filter(m => m.conversationId === activeId), [messages, activeId]);

  const flash = useCallback((message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2600); }, []);

  const refresh = useCallback(async () => {
    const [sessionRes, convRes, profileRes] = await Promise.all([fetch("/api/auth/session", { credentials: "include" }), fetch("/api/conversations", { credentials: "include" }), fetch("/api/profile", { credentials: "include" })]);
    if (!sessionRes.ok) { setAuthenticated(false); return; }
    setAuthenticated(true);
    if (convRes.ok) { const data = await convRes.json(); setConversations(data.conversations ?? []); }
    if (profileRes.ok) { const data = await profileRes.json(); setProfile(data.profile ?? null); }
  }, []);

  const uploadAttachment = useCallback(async (file: File, messageId: string) => {
    const form = new FormData();
    form.append("messageId", messageId);
    form.append("file", file);
    const response = await fetch("/api/attachments", {
      method: "POST",
      credentials: "include",
      body: form,
    });
    if (!response.ok) flash("Attachment upload failed.");
    else flash("Attachment uploaded.");
  }, [flash]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refresh().catch(() => flash("Could not load your workspace."));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh, flash]);

  useEffect(() => {
    if (authenticated !== true) return;
    const realtimeUrl = process.env.NEXT_PUBLIC_WS_URL?.trim();
    if (!realtimeUrl) {
      const timer = window.setTimeout(() => flash("Realtime messaging is not configured."), 0);
      return () => window.clearTimeout(timer);
    }

    let cancelled = false;

    const connectRealtime = async () => {
      const ticketResponse = await fetch("/api/auth/realtime-ticket", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
      });
      if (!ticketResponse.ok) throw new Error("REALTIME_TICKET_FAILED");
      const ticketData = await ticketResponse.json() as { ticket?: string };
      if (!ticketData.ticket) throw new Error("REALTIME_TICKET_MISSING");
      if (cancelled) return;

      const client = new RealtimeClient(realtimeUrl, ticketData.ticket);
      realtime.current = client;
      const offStatus = client.onStatus(setRtStatus);
      const offEvent = client.onEvent((raw) => {
        const event = raw as Record<string, unknown>;
        if (event.type === "sync") {
          const incoming = (event.messages as Message[] | undefined) ?? [];
          setMessages(prev => mergeMessages(prev, incoming));
        } else if (event.type === "message" || event.type === "message_created" || event.type === "message_accepted") {
          const incoming = event.message as Message | undefined;
          if (incoming) {
            setMessages(prev => mergeMessages(prev, [{ ...incoming, status: "sent" }]));
            if (event.type === "message_accepted" && pendingFileRef.current) { const file = pendingFileRef.current; pendingFileRef.current = null; setPendingFile(null); void uploadAttachment(file, incoming.id); }
          }
        } else if (event.type === "message_edited") {
          const incoming = event.message as Message; setMessages(prev => prev.map(m => m.id === incoming.id ? { ...m, ...incoming, edited: true } : m));
        } else if (event.type === "message_deleted") {
          setMessages(prev => prev.map(m => m.id === event.messageId ? { ...m, deleted: true } : m));
        } else if (event.type === "message_state") {
          setMessages(prev => prev.map(m => m.id === event.messageId ? { ...m, status: event.status as Message["status"] } : m));
        } else if (event.type === "typing") {
          setTyping(Boolean(event.isTyping));
        } else if (event.type === "presence_update") {
          // Presence is transient; the conversation list only needs a lightweight visual hint.
          setConversations(prev => prev);
        } else if (event.type === "error") {
          flash(event.code === "RATE_LIMITED" ? "You're sending too quickly." : "That action could not be completed.");
        }
      });
      client.connect();

      return () => {
        offStatus();
        offEvent();
        client.disconnect();
        if (realtime.current === client) realtime.current = null;
      };
    };

    let cleanup: (() => void) | undefined;
    void connectRealtime().then((dispose) => {
      cleanup = dispose;
      if (cancelled) cleanup?.();
    }).catch(() => {
      if (!cancelled) flash("Could not establish realtime connection.");
    });

    fetch("/api/messages", { credentials: "include", cache: "no-store" }).then(r => r.ok ? r.json() : null).then(data => { if (!cancelled && data?.messages) setMessages(prev => mergeMessages(prev, data.messages)); }).catch(() => undefined);

    return () => {
      cancelled = true;
      cleanup?.();
      const client = realtime.current;
      if (client) client.disconnect();
      realtime.current = null;
    };
  }, [authenticated, flash, uploadAttachment]);

  const createAnonymous = useCallback(async () => {
    const response = await fetch("/api/auth/anonymous", { method: "POST", credentials: "include" });
    if (!response.ok) throw new Error("SIGNUP_FAILED");
    setAuthenticated(true);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    if (authenticated !== false || signedOut) return;
    const timer = window.setTimeout(() => {
      createAnonymous().catch(() => flash("Could not start an anonymous session."));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [authenticated, signedOut, createAnonymous, flash]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); }
      if (event.key === "Escape") { setSearchOpen(false); setNewChatOpen(false); setProfileOpen(false); setSettingsOpen(false); setConfirmDelete(null); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function createConversation(event: FormEvent) {
    event.preventDefault();
    const isGroup = Boolean(groupName.trim());
    const body = isGroup ? { kind: "group", name: groupName.trim(), usernames: groupUsers.split(",").map(v => v.trim()).filter(Boolean) } : { kind: "direct", username: newUsername.trim() };
    const response = await fetch("/api/conversations", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { flash(data.error ?? "Could not create conversation."); return; }
    setNewChatOpen(false); setNewUsername(""); setGroupName(""); setGroupUsers(""); await refresh(); setActiveId(data.conversationId); setMobileSidebar(false);
  }

  function sendCurrent() {
    const text = composer.trim(); if (!text || !activeId || !realtime.current) return;
    const clientId = crypto.randomUUID();
    const requestId = crypto.randomUUID();
    // The current pre-E2EE transport expects base64-compatible ciphertext data. This is encoding only, not encryption.
    const ciphertext = btoa(unescape(encodeURIComponent(text))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    if (editing) { realtime.current.editMessage(editing, ciphertext, 1, requestId, text); setMessages(prev => prev.map(m => m.id === editing ? { ...m, ciphertext, edited: true, status: "sent" } : m)); setEditing(null); setComposer(""); return; }
    const optimistic: Message = { id: `local-${clientId}`, conversationId: activeId, clientMessageId: clientId, ciphertext, encryptionVersion: 1, sequence: "0", createdAt: new Date().toISOString(), status: "sending" };
    setMessages(prev => [...prev, optimistic]); setComposer("");
    if (replying) { realtime.current.replyMessage(replying, ciphertext, 1, clientId, requestId, text); setReplying(null); }
    else realtime.current.sendMessage(activeId, ciphertext, 1, clientId, requestId, [], text);
  }

  function onComposerInput(value: string) {
    setComposer(value);
    if (!activeId || !realtime.current) return;
    realtime.current.sendTyping(activeId, true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => realtime.current?.sendTyping(activeId, false), 900);
  }

  async function runSearch(nextCursor?: string) {
    if (!search.trim()) { setSearchResults(null); return; }
    setSearchLoading(true);
    try {
      const params = new URLSearchParams({ type: searchType, q: search.trim(), limit: "20" }); if (nextCursor) params.set("cursor", nextCursor);
      const response = await fetch(`/api/search?${params.toString()}`, { credentials: "include" }); const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Search failed");
      setSearchResults(data);
    } catch (error) { flash(error instanceof Error ? error.message : "Search failed."); } finally { setSearchLoading(false); }
  }

  async function logout() { const r = await fetch("/api/auth/session", { method: "DELETE", credentials: "include" }); if (r.ok) { setSignedOut(true); setAuthenticated(false); setConversations([]); setMessages([]); flash("Session ended."); } }

  async function react(messageId: string, emoji: string) { const r = await fetch(`/api/messages/${messageId}/reactions`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reaction: emoji }) }); if (!r.ok) flash("Reaction could not be added."); }
  async function removeMessage(messageId: string) { const r = await fetch(`/api/messages/${messageId}`, { method: "DELETE", credentials: "include" }); if (r.ok) { setMessages(prev => prev.map(m => m.id === messageId ? { ...m, deleted: true } : m)); setConfirmDelete(null); } else flash("Message could not be deleted."); }
  async function saveProfile(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const body = { username: String(form.get("username") ?? ""), displayName: String(form.get("displayName") ?? ""), bio: String(form.get("bio") ?? "") }; const r = await fetch("/api/profile", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const data = await r.json(); if (!r.ok) flash(data.error ?? "Could not save profile."); else { setProfile(data.profile); flash("Profile saved."); } }

  if (authenticated === null) return <div className="boot"><div className="brand-mark">P</div><div><strong>Privacy Messenger</strong><span>Starting a private workspace…</span></div></div>;
  if (signedOut) return <div className="signed-out"><div className="brand-mark">P</div><h1>Session ended</h1><p>Start a fresh anonymous session when you are ready.</p><button className="primary-btn" onClick={() => { setSignedOut(false); setAuthenticated(false); }}>Start new session</button></div>;

  return <main className="app-shell">
    <aside className={`sidebar ${mobileSidebar ? "sidebar-open" : ""}`}>
      <div className="sidebar-top">
        <div className="brand"><div className="brand-mark">P</div><div><strong>Private</strong><span>Messenger</span></div></div>
        <button className="icon-btn mobile-only" onClick={() => setMobileSidebar(false)} aria-label="Close conversation list"><Icon name="x"/></button>
      </div>
      <div className="sidebar-actions"><button className="search-entry" onClick={() => setSearchOpen(true)}><Icon name="search"/><span>Search</span><kbd>⌘ K</kbd></button><button className="new-chat" onClick={() => setNewChatOpen(true)}><Icon name="plus"/> New chat</button></div>
      <div className="list-label"><span>Conversations</span><span>{conversations.length}</span></div>
      <div className="conversation-list" aria-label="Conversations">
        {conversations.length === 0 ? <Empty icon="message" title="No conversations yet" text="Start a direct chat or create a group." action="New conversation" onAction={() => setNewChatOpen(true)}/> : conversations.map(c => <button key={c.id} className={`conversation-item ${activeId === c.id ? "active" : ""}`} onClick={() => { setActiveId(c.id); setMobileSidebar(false); }}><Avatar label={c.name || (c.kind === "direct" ? "Direct" : "Group")} online={c.kind === "direct"}/><span className="conversation-copy"><strong>{c.name || (c.kind === "direct" ? "Direct conversation" : "Untitled group")}</strong><span>{c.kind === "group" ? `${c.memberCount} members` : "Direct message"}</span></span><span className="conversation-time">{time(c.updatedAt)}</span></button>)}
      </div>
      <div className="sidebar-footer"><button className="account-card" onClick={() => setProfileOpen(true)}><Avatar label={profile?.displayName || profile?.username || "You"}/><span><strong>{profile?.displayName || profile?.username || "Anonymous"}</strong><small>@{profile?.username || "anonymous"}</small></span><Icon name="more" size={16}/></button></div>
    </aside>

    <section className="chat-panel">
      <header className="chat-header">
        <button className="icon-btn mobile-only" onClick={() => setMobileSidebar(true)} aria-label="Open conversation list"><Icon name="menu"/></button>
        {active ? <><Avatar label={active.name || "Conversation"} online={active.kind === "direct"}/><div className="header-copy"><strong>{active.name || (active.kind === "group" ? "Untitled group" : "Direct conversation")}</strong><span>{typing ? "typing…" : active.kind === "group" ? `${active.memberCount} members` : rtStatus === "connected" ? "Online" : "Reconnecting…"}</span></div><div className="header-actions"><span className={`connection ${rtStatus}`}><i/> {rtStatus === "connected" ? "Live" : rtStatus}</span><button className="icon-btn" onClick={() => setSearchOpen(true)} aria-label="Search messages"><Icon name="search"/></button><button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Conversation settings"><Icon name="more"/></button></div></> : <div className="header-empty"><span>Choose a conversation</span><small>Your messages will appear here.</small></div>}
      </header>

      <div className="message-stage">
        {!active ? <Empty icon="message" title="Your conversations, in one place" text="Pick a conversation from the sidebar or start a new one." action="Start a chat" onAction={() => setNewChatOpen(true)}/> : activeMessages.length === 0 ? <Empty icon="message" title="No messages yet" text="Say hello. New messages will appear here in real time."/> : <div className="messages">{activeMessages.map((m, index) => <MessageBubble key={m.id} message={m} previous={activeMessages[index - 1]} selected={selected === m.id} onSelect={() => setSelected(selected === m.id ? null : m.id)} onReply={() => setReplying(m.id)} onEdit={() => { setEditing(m.id); setComposer(decodeForDisplay(m.ciphertext)); }} onDelete={() => setConfirmDelete(m.id)} onCopy={() => copyDecryptedMessageText(decodeForDisplay(m.ciphertext)).then(() => flash("Copied to clipboard.")).catch(() => flash("Clipboard is unavailable."))} onReact={emoji => react(m.id, emoji)} />)}</div>}
      </div>

      {active && <div className="composer-wrap">
        {(replying || editing) && <div className="compose-context"><div><span>{editing ? "Editing message" : "Replying to message"}</span><small>{editing ? "Make your change, then send." : "Your reply will stay linked to the selected message."}</small></div><button className="icon-btn" onClick={() => { setReplying(null); setEditing(null); setComposer(""); }} aria-label="Cancel"><Icon name="x"/></button></div>}
        <div className="composer">{pendingFile && <button className="attachment-chip" type="button" onClick={() => { pendingFileRef.current = null; setPendingFile(null); }} title="Remove attachment"><span>{pendingFile.name}</span><Icon name="x" size={13}/></button>}<button className="composer-tool" onClick={() => fileRef.current?.click()} aria-label="Attach a file"><Icon name="paperclip"/></button><input ref={fileRef} type="file" hidden accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,.docx" onChange={e => { const file = e.target.files?.[0] ?? null; pendingFileRef.current = file; setPendingFile(file); if (file) flash(`${file.name} attached. Send a message to upload it.`); }}/><textarea value={composer} onChange={e => onComposerInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendCurrent(); } }} placeholder="Write a message…" aria-label="Message" rows={1}/><button className="composer-tool" onClick={() => setComposer(v => `${v} 🙂`)} aria-label="Add emoji"><Icon name="smile"/></button><button className="send-btn" onClick={sendCurrent} disabled={!composer.trim() || rtStatus !== "connected"} aria-label="Send message"><Icon name="send" size={17}/></button></div><div className="composer-hint"><span>Enter to send · Shift + Enter for a new line</span><span>{rtStatus === "connected" ? "Realtime connected" : "Waiting for connection"}</span></div>
      </div>}
    </section>

    {toast && <div className="toast" role="status">{toast}</div>}

    {searchOpen && <Modal title="Search" onClose={() => setSearchOpen(false)} wide><div className="search-modal"><div className="search-input"><Icon name="search"/><input autoFocus value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === "Enter") runSearch(); }} placeholder="Search people, conversations or messages"/><kbd>Enter</kbd></div><div className="segmented">{(["users", "conversations", "messages"] as const).map(t => <button key={t} className={searchType === t ? "active" : ""} onClick={() => { setSearchType(t); setSearchResults(null); }}>{t}</button>)}</div>{searchLoading ? <Loading text="Searching…"/> : !searchResults ? <Empty icon="search" title="Search your workspace" text="Results respect your existing server-side authorization."/> : searchResults.items.length === 0 ? <Empty icon="search" title="No matches" text="Try a different name or phrase."/> : <div className="search-results">{searchResults.items.map((item, i) => <div className="result" key={i}><Avatar label={String(item.displayName || item.username || item.name || "Result")}/><div><strong>{String(item.displayName || item.username || item.name || "Result")}</strong><span>{searchType === "messages" ? String(item.contentSnippet || "Message") : searchType === "users" ? `@${String(item.username || "")}` : String(item.kind || "Conversation")}</span></div></div>)}{searchResults.nextCursor && <button className="load-more" onClick={() => runSearch(searchResults.nextCursor ?? undefined)}>Load more</button>}</div>}</div></Modal>}
    {newChatOpen && <Modal title="New conversation" onClose={() => setNewChatOpen(false)}><form className="modal-form" onSubmit={createConversation}><label>Direct chat<input value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="Username" autoFocus/></label><div className="or"><span>or create a group</span></div><label>Group name<input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="Project team"/></label><label>Members<input value={groupUsers} onChange={e => setGroupUsers(e.target.value)} placeholder="alice, bob"/><small>Use usernames separated by commas.</small></label><button className="primary-btn" type="submit">Create conversation <Icon name="arrow" size={16}/></button></form></Modal>}
    {profileOpen && <Modal title="Profile" onClose={() => setProfileOpen(false)}><form className="modal-form" onSubmit={saveProfile}><div className="profile-hero"><Avatar label={profile?.displayName || profile?.username || "You"} size="large"/><div><strong>{profile?.displayName || "Anonymous"}</strong><span>Public profile</span></div></div><label>Username<input name="username" defaultValue={profile?.username ?? ""} placeholder="your_username"/></label><label>Display name<input name="displayName" defaultValue={profile?.displayName ?? ""} placeholder="How others see you"/></label><label>Bio<textarea name="bio" defaultValue={profile?.bio ?? ""} placeholder="A short introduction" rows={3}/></label><button className="primary-btn" type="submit">Save profile</button><button type="button" className="danger-link" onClick={logout}><Icon name="logout" size={16}/> End session</button></form></Modal>}
    {confirmDelete && <Modal title="Delete message" onClose={() => setConfirmDelete(null)}><div className="confirm-card"><p>This removes the message for this conversation according to the existing message permissions.</p><div className="confirm-actions"><button className="secondary-btn" onClick={() => setConfirmDelete(null)}>Cancel</button><button className="danger-btn" onClick={() => removeMessage(confirmDelete)}>Delete</button></div></div></Modal>}
    {settingsOpen && <Modal title="Settings" onClose={() => setSettingsOpen(false)}><div className="settings-list"><Setting icon="user" title="Profile" description="Manage the name and profile information others see." onClick={() => { setSettingsOpen(false); setProfileOpen(true); }}/><Setting icon="message" title="Notifications" description="Notification controls are managed by the existing notification service."/><Setting icon="users" title="Devices" description="Your session is tied to this browser/device."/><Setting icon="settings" title="Connection" description={rtStatus === "connected" ? "Realtime connection is active." : "Realtime connection is reconnecting."}/></div></Modal>}
  </main>;
}

function mergeMessages(current: Message[], incoming: Message[]) { const map = new Map(current.map(m => [m.clientMessageId || m.id, m])); for (const m of incoming) map.set(m.clientMessageId || m.id, { ...map.get(m.clientMessageId || m.id), ...m }); return [...map.values()].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()); }
function Avatar({ label, online = false, size = "normal" }: { label: string; online?: boolean; size?: "normal" | "large" }) { return <span className={`avatar ${size}`}><span>{initials(label)}</span>{online && <i/>}</span>; }
function Empty({ icon, title, text, action, onAction }: { icon: IconName; title: string; text: string; action?: string; onAction?: () => void }) { return <div className="empty"><div className="empty-icon"><Icon name={icon} size={22}/></div><h2>{title}</h2><p>{text}</p>{action && <button className="secondary-btn" onClick={onAction}>{action}</button>}</div>; }
function Loading({ text }: { text: string }) { return <div className="loading"><span className="spinner"/>{text}</div>; }
function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) { return <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><header><div><span className="eyebrow">Workspace</span><h2 id="modal-title">{title}</h2></div><button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x"/></button></header>{children}</div></div>; }
function Setting({ icon, title, description, onClick }: { icon: IconName; title: string; description: string; onClick?: () => void }) { return <button className="setting-row" onClick={onClick}><span className="setting-icon"><Icon name={icon}/></span><span><strong>{title}</strong><small>{description}</small></span><Icon name="arrow" size={16}/></button>; }
function MessageBubble({ message, previous, selected, onSelect, onReply, onEdit, onDelete, onCopy, onReact }: { message: Message; previous?: Message; selected: boolean; onSelect: () => void; onReply: () => void; onEdit: () => void; onDelete: () => void; onCopy: () => void; onReact: (emoji: string) => void }) { const text = message.deleted ? "Message deleted" : decodeForDisplay(message.ciphertext); const grouped = previous && new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() < 120000; return <article className={`bubble-row ${selected ? "selected" : ""} ${grouped ? "grouped" : ""}`}><button className="message-bubble" onClick={onSelect}><div className="bubble-meta">{!grouped && <span>{message.senderPublicId ? `User ${message.senderPublicId.slice(-5)}` : "You"}</span>}<time>{time(message.createdAt)}</time>{message.edited && <em>edited</em>}</div><p className={message.deleted ? "deleted" : ""}>{text}</p>{message.reactions && <div className="reactions">{Object.entries(message.reactions).map(([emoji, count]) => <button key={emoji} onClick={e => { e.stopPropagation(); onReact(emoji); }}>{emoji} {count}</button>)}</div>}<span className="delivery">{message.status === "read" ? <Icon name="check2" size={14}/> : message.status === "delivered" ? <Icon name="check2" size={14}/> : message.status === "sent" ? <Icon name="check" size={14}/> : message.status === "sending" ? "…" : ""}</span></button>{selected && !message.deleted && <div className="message-tools"><button onClick={onReply} title="Reply"><Icon name="reply" size={15}/></button><button onClick={onCopy} title="Copy"><Icon name="copy" size={15}/></button><button onClick={() => onReact("👍")} title="React">👍</button><button onClick={onEdit} title="Edit"><Icon name="edit" size={15}/></button><button onClick={onDelete} title="Delete"><Icon name="trash" size={15}/></button></div>}</article>; }
