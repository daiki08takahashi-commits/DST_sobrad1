import { useEffect, useState } from 'react';
import Topbar from '../components/Topbar.jsx';
import ChatPanel from '../components/ChatPanel.jsx';
import * as api from '../api.js';
import { COMPANIONS, getCompanion } from '../companions.js';

// How much of a last-message preview to show on a chat-list row before
// truncating with an ellipsis -- long enough to be useful, short enough to
// stay a single line at phone width alongside the avatar/timestamp.
const PREVIEW_MAX_CHARS = 60;

function truncate(text) {
  if (text.length <= PREVIEW_MAX_CHARS) return text;
  return `${text.slice(0, PREVIEW_MAX_CHARS - 1).trimEnd()}…`;
}

// Relative "last message" timestamp for a chat-list row: minutes/hours for
// today, "Yesterday", otherwise a short date in the same en-GB style the
// rest of the app already uses for dates (see Study.jsx's formatDateShort)
// -- no existing relative-time helper lives anywhere else in the codebase,
// so this is new, kept small and local to the chat list.
function formatRowTimestamp(iso) {
  const date = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now - date) / 60000);
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    return `${Math.floor(diffMin / 60)}h ago`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// One row of the companion list: avatar, name, a one-line preview of the
// last message in that companion's thread (prefixed "You: " when the user
// sent it last), or that companion's greeting -- shown muted, like an
// unsent-conversation placeholder -- when the thread is still empty. A
// relative timestamp sits top-right, blank until there's a real message.
// Structural pattern only borrowed from a WhatsApp-style chat list (avatar
// left, name + preview stacked, timestamp top-right); restyled entirely in
// this app's own card/shadow language, see .chat-list-row in index.css.
function CompanionRow({ companion, lastMessage, onOpen }) {
  const hasHistory = Boolean(lastMessage);
  const preview = hasHistory
    ? truncate(`${lastMessage.sender === 'user' ? 'You: ' : ''}${lastMessage.text}`)
    : companion.greeting;

  return (
    <button type="button" className="chat-list-row" onClick={onOpen}>
      <img className="chat-list-avatar" src={companion.avatar} alt="" aria-hidden="true" />
      <span className="chat-list-row-body">
        <span className="chat-list-row-top">
          <span className="chat-list-name">{companion.name}</span>
          <span className="chat-list-time">
            {hasHistory ? formatRowTimestamp(lastMessage.created_at) : ''}
          </span>
        </span>
        <span className={`chat-list-preview${hasHistory ? '' : ' is-placeholder'}`}>{preview}</span>
      </span>
    </button>
  );
}

// Chat is now a WhatsApp-contact-list-style router: `activeCompanion` null
// shows the two-row companion list, picking a row opens straight into that
// companion's own full thread (Topbar + ChatPanel), and the Topbar's back
// arrow steps back out to the list rather than leaving the Chat page (see
// Topbar.jsx's `onBack` prop). Each companion is a fully separate
// conversation server-side (see api.js/companions.js) -- there is no more
// single shared history or sticky "current companion" setting.
export default function Chat() {
  const [activeCompanion, setActiveCompanion] = useState(null);
  const [lastMessages, setLastMessages] = useState({});

  useEffect(() => {
    // Only (re)fetch while the list itself is showing -- this also means
    // stepping back from a thread to the list refreshes both previews, so
    // whichever companion was just messaged shows its real last message
    // instead of a stale greeting placeholder.
    if (activeCompanion !== null) return undefined;
    let cancelled = false;
    Object.keys(COMPANIONS).forEach((key) => {
      api
        .getChatHistory(key)
        .then((data) => {
          if (cancelled) return;
          const list = Array.isArray(data) ? data : [];
          setLastMessages((prev) => ({
            ...prev,
            [key]: list.length ? list[list.length - 1] : null,
          }));
        })
        .catch(() => {
          if (!cancelled) setLastMessages((prev) => ({ ...prev, [key]: null }));
        });
    });
    return () => {
      cancelled = true;
    };
  }, [activeCompanion]);

  if (activeCompanion) {
    const companion = getCompanion(activeCompanion);
    return (
      <>
        <Topbar
          title={companion.name}
          avatarSrc={companion.avatar}
          onBack={() => setActiveCompanion(null)}
        />
        <div className="screen-inner chat-screen">
          <ChatPanel companion={activeCompanion} />
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Chat" />
      <div className="screen-inner chat-screen">
        <div className="chat-list">
          {Object.values(COMPANIONS).map((c) => (
            <CompanionRow
              key={c.key}
              companion={c}
              lastMessage={lastMessages[c.key]}
              onOpen={() => setActiveCompanion(c.key)}
            />
          ))}
        </div>
      </div>
    </>
  );
}
