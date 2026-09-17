import { useEffect, useRef, useState } from 'react';
import * as api from '../api.js';
import { useToast } from '../ToastContext.jsx';
import { getCompanion } from '../companions.js';

// Chat thread + composer for ONE companion's thread, rendered by Chat.jsx
// once a row in its companion list has been opened. `companion` ('sobrad'
// or 'friends' -- see companions.js) is a required prop, not read from a
// global setting: each companion is now a fully separate conversation (see
// api.js's getChatHistory/sendChatMessage/clearChatHistory, all scoped to
// one companion thread), so this panel only ever knows about the one thread
// it was opened into. No Topbar here, that stays specific to Chat.jsx.
export default function ChatPanel({ companion: companionKey }) {
  const showToast = useToast();
  const companion = getCompanion(companionKey);
  // `messages` only ever holds real, persisted history -- an empty array
  // means "no history yet", and the greeting is layered on at render time
  // below (from `displayMessages`) rather than stored in state.
  const [messages, setMessages] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const threadRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    api
      .getChatHistory(companion.key)
      .then((data) => {
        if (cancelled) return;
        setMessages(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setMessages([]);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // Re-fetch whenever the panel is pointed at a different companion --
    // Chat.jsx unmounts/remounts this on companion switch today, but this
    // guards against a future change that keeps it mounted instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companion.key]);

  const displayMessages = messages.length
    ? messages
    : [{ id: 'greeting', sender: 'sobrad', text: companion.greeting }];

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
    // Only real history changes (new message, load, clear) need a
    // scroll-to-bottom -- `displayMessages` is recomputed every render
    // (it layers the greeting on top of `messages`), so depending on it
    // directly would re-run this on every render instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setError('');
    try {
      const result = await api.sendChatMessage(companion.key, text);
      setInput('');
      setMessages((prev) => [...prev, result.user_message, result.reply]);
    } catch (err) {
      setError(err.message || "Couldn't send that message. Please try again.");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleClearConfirmed() {
    setClearing(true);
    try {
      await api.clearChatHistory(companion.key);
      setMessages([]);
      setConfirmingClear(false);
      showToast('Conversation cleared.');
    } catch (err) {
      showToast(err.message || "Couldn't clear the conversation. Please try again.");
    } finally {
      setClearing(false);
    }
  }

  return (
    <>
      <div className="chat-toolbar">
        {confirmingClear ? (
          <span className="chat-clear-confirm">
            <span>Clear this conversation?</span>
            <button type="button" className="btn-quiet" onClick={handleClearConfirmed} disabled={clearing}>
              {clearing ? 'Clearing…' : 'Yes, clear it'}
            </button>
            <button type="button" className="btn-quiet" onClick={() => setConfirmingClear(false)} disabled={clearing}>
              Cancel
            </button>
          </span>
        ) : (
          <button type="button" className="btn-quiet chat-clear-btn" onClick={() => setConfirmingClear(true)}>
            Clear conversation
          </button>
        )}
      </div>
      <div className="chat-thread" ref={threadRef}>
        {loaded &&
          displayMessages.map((m) => {
            const fromSobrad = m.sender !== 'user';
            return (
              <div className={`chat-bubble-row from-${fromSobrad ? 'sobrad' : 'user'}`} key={m.id}>
                {fromSobrad && (
                  <img className="chat-bubble-avatar" src={companion.avatar} alt="" aria-hidden="true" />
                )}
                <div className={`chat-bubble in from-${fromSobrad ? 'sobrad' : 'user'}`}>
                  <span className="chat-bubble-name">{fromSobrad ? companion.name : 'You'}</span>
                  <span>{m.text}</span>
                </div>
              </div>
            );
          })}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="chat-composer">
        <div className="field">
          <label htmlFor="chat-input">Message</label>
          <input
            id="chat-input"
            type="text"
            placeholder="Type something…"
            autoComplete="off"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
          />
        </div>
        <button
          type="button"
          className="btn btn-primary"
          aria-label="Send message"
          onClick={handleSend}
          disabled={sending || !input.trim()}
        >
          Send
        </button>
      </div>
    </>
  );
}
