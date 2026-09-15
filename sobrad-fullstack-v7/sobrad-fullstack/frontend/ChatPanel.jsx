import { useEffect, useRef, useState } from 'react';
import * as api from '../api.js';
import { useToast } from '../ToastContext.jsx';

const GREETING = { id: 'greeting', sender: 'sobrad', text: "Hello. I'm glad you're here. What's on your mind?" };

// Shared chat thread + composer, used as-is by the dedicated Chat screen and
// by Home (which renders this instead of its old tile grid on desktop, see
// Home.jsx). Both call the same history/send API, so both are simply two
// views onto one real conversation rather than separate chat features --
// no Topbar here, that stays specific to whichever page renders this.
export default function ChatPanel() {
  const showToast = useToast();
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
    api
      .getChatHistory()
      .then((data) => {
        if (cancelled) return;
        const history = Array.isArray(data) ? data : [];
        setMessages(history.length ? history : [GREETING]);
      })
      .catch(() => {
        if (!cancelled) setMessages([GREETING]);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setError('');
    try {
      const result = await api.sendChatMessage(text);
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
      await api.clearChatHistory();
      setMessages([GREETING]);
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
          messages.map((m) => (
            <div className={`chat-bubble in from-${m.sender === 'user' ? 'user' : 'sobrad'}`} key={m.id}>
              <span className="chat-bubble-name">{m.sender === 'user' ? 'You' : 'Sõbrad'}</span>
              <span>{m.text}</span>
            </div>
          ))}
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
