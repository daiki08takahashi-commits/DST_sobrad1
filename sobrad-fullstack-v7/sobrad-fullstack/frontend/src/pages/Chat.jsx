import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Topbar from '../components/Topbar.jsx';
import ChatPanel from '../components/ChatPanel.jsx';
import * as api from '../api.js';
import { useToast } from '../ToastContext.jsx';
import { CameraIcon } from '../components/icons.jsx';
import { isBuiltinCompanion, initialFor, resolveCompanion } from '../companions.js';

// How much personality/tone text a custom companion can have -- matches the
// backend's own cap (POST/PATCH /api/companions), enforced here too so
// people see the limit as they type rather than finding out on submit.
const PERSONALITY_MAX = 300;

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

// One row of the companion list: avatar (photo, bundled built-in image, or
// an initial-letter fallback -- see companions.js's resolveCompanion), name,
// a one-line preview of the last message in that companion's thread
// (prefixed "You: " when the user sent it last), or that companion's
// greeting -- shown muted, like an unsent-conversation placeholder -- when
// the thread is still empty. A relative timestamp sits top-right, blank
// until there's a real message.
//
// The row itself is a <button> (opens the thread), with a small strip of
// per-row actions underneath as plain sibling buttons -- kept out of the
// row button itself since a <button> can't contain further interactive
// controls. Hide/Show is offered for every companion; Edit/Delete only for
// a custom (non-default) one, since the backend rejects a rename/
// personality-edit/delete on a built-in with a 400.
function CompanionRow({
  companion,
  lastMessage,
  onOpen,
  onToggleHidden,
  hidingBusy,
  onEdit,
  confirmingDelete,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
  deleting,
}) {
  const hasHistory = Boolean(lastMessage);
  const preview = hasHistory
    ? truncate(`${lastMessage.sender === 'user' ? 'You: ' : ''}${lastMessage.text}`)
    : companion.greeting;

  return (
    <div className="chat-list-row-wrap">
      <button type="button" className="chat-list-row" onClick={onOpen}>
        {companion.avatar ? (
          <img className="chat-list-avatar" src={companion.avatar} alt="" aria-hidden="true" />
        ) : (
          <span className="chat-list-avatar avatar-initial" aria-hidden="true">
            {companion.initial}
          </span>
        )}
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

      <div className="chat-list-row-actions">
        {confirmingDelete ? (
          <span className="chat-clear-confirm">
            <span>Delete {companion.name} and their whole chat history?</span>
            <button type="button" className="btn-quiet" onClick={onDeleteConfirm} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Yes, delete'}
            </button>
            <button type="button" className="btn-quiet" onClick={onDeleteCancel} disabled={deleting}>
              Cancel
            </button>
          </span>
        ) : (
          <>
            {!companion.is_default && (
              <button type="button" className="btn-quiet" onClick={onEdit}>
                Edit
              </button>
            )}
            <button type="button" className="btn-quiet" onClick={onToggleHidden} disabled={hidingBusy}>
              {hidingBusy ? 'Working…' : companion.hidden ? 'Show' : 'Hide'}
            </button>
            {!companion.is_default && (
              <button type="button" className="btn-quiet" onClick={onDeleteRequest}>
                Delete
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Shared form for both "Add a friend" (mode="create") and editing an
// existing custom companion's name/personality/photo (mode="edit") -- the
// two only differ in which API calls they make and what they're
// pre-filled with. Photo picking reuses the same pattern as Profile.jsx's
// photo upload (a visually-hidden <input type="file"> triggered by a
// button, with a local preview before it's actually uploaded).
function CompanionForm({ mode, companion, onCancel, onDone }) {
  const showToast = useToast();
  const isEdit = mode === 'edit';
  const [name, setName] = useState(isEdit ? companion.name : '');
  const [personality, setPersonality] = useState(isEdit ? companion.personality_prompt || '' : '');
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  // Revoke the local preview blob URL on unmount (form closed/submitted).
  useEffect(() => {
    return () => {
      if (photoPreview) {
        try {
          URL.revokeObjectURL(photoPreview);
        } catch {
          // ignore
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePickPhoto() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (photoPreview) {
      try {
        URL.revokeObjectURL(photoPreview);
      } catch {
        // ignore
      }
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Please give your friend a name.');
      return;
    }

    setSubmitting(true);
    try {
      let result;
      if (isEdit) {
        result = await api.updateCompanion(companion.id, {
          name: trimmedName,
          personality_prompt: personality.trim(),
        });
      } else {
        result = await api.createCompanion({
          name: trimmedName,
          personalityPrompt: personality.trim() || undefined,
        });
      }
      if (photoFile) {
        try {
          result = await api.uploadCompanionAvatar(result.id, photoFile);
        } catch (err) {
          showToast(err.message || "Couldn't attach that photo, but your friend was saved.");
        }
      }
      onDone(result);
    } catch (err) {
      setError(err.message || "Couldn't save that. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const previewAvatar = photoPreview || (isEdit ? companion.avatar : null);

  return (
    <form className="chat-friend-form" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="friend-name">Name</label>
        <input
          id="friend-name"
          type="text"
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="What should we call them?"
        />
      </div>

      <div className="field">
        <label htmlFor="friend-personality">Personality &amp; tone (optional)</label>
        <textarea
          id="friend-personality"
          value={personality}
          maxLength={PERSONALITY_MAX}
          onChange={(e) => setPersonality(e.target.value.slice(0, PERSONALITY_MAX))}
          placeholder="e.g. warm, a little cheeky, keeps replies short"
        />
        <span className="field-hint">
          {personality.length}/{PERSONALITY_MAX}
        </span>
      </div>

      <div className="chat-friend-photo-row">
        {previewAvatar ? (
          <img className="chat-list-avatar" src={previewAvatar} alt="" aria-hidden="true" />
        ) : (
          <span className="chat-list-avatar avatar-initial" aria-hidden="true">
            {initialFor(name)}
          </span>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="visually-hidden-input"
          onChange={handleFileChange}
          aria-label="Choose a photo"
        />
        <button type="button" className="btn-quiet" onClick={handlePickPhoto} disabled={submitting}>
          <span className="icon">
            <CameraIcon />
          </span>
          {previewAvatar ? 'Change photo' : 'Add a photo (optional)'}
        </button>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="chat-friend-form-actions">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Add friend'}
        </button>
        <button type="button" className="btn-quiet" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// Chat is a WhatsApp-contact-list-style router: `activeKey` null shows the
// companion list, picking a row (or arriving via a Sidebar search deep
// link, see below) opens straight into that companion's own full thread
// (Topbar + ChatPanel), and the Topbar's back arrow steps back out to the
// list. Each companion is a fully separate conversation server-side (see
// api.js/companions.js) -- there is no shared history or sticky "current
// companion" setting.
//
// The companion list itself now comes from the backend (GET
// /api/companions -- see api.js's getCompanions), not a static table: it
// always includes the two built-ins (auto-created server-side on first
// call) plus whatever custom companions this user has added.
export default function Chat() {
  const showToast = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  const [companions, setCompanions] = useState([]);
  const [loaded, setLoaded] = useState(false);
  // Custom companion id -> blob object URL for its uploaded avatar (see
  // api.getCompanionAvatarBlobUrl) -- same lazy-fetch-once pattern as
  // Journal.jsx's photoUrls. Built-ins never go through this map; they
  // always resolve to their bundled image (see companions.js).
  const [avatarUrls, setAvatarUrls] = useState({});
  const avatarUrlsRef = useRef({});

  const [activeKey, setActiveKey] = useState(null);
  const [lastMessages, setLastMessages] = useState({});

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [hideBusy, setHideBusy] = useState({});
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  useEffect(() => {
    avatarUrlsRef.current = avatarUrls;
  }, [avatarUrls]);

  // Revoke every remaining blob URL when the Chat screen unmounts.
  useEffect(() => {
    return () => {
      Object.values(avatarUrlsRef.current).forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      });
    };
  }, []);

  function forgetAvatarUrl(id) {
    setAvatarUrls((prev) => {
      const url = prev[id];
      if (url) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      }
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  // Fetches the companion list once on mount -- this also seeds the two
  // built-ins server-side the first time it's called for a user, so
  // nothing else on this page needs to know or care about that.
  useEffect(() => {
    let cancelled = false;
    api
      .getCompanions()
      .then((data) => {
        if (cancelled) return;
        setCompanions(Array.isArray(data) ? data : []);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Lazily fetch an avatar blob URL for any custom companion reporting
  // has_avatar that isn't cached yet.
  useEffect(() => {
    companions.forEach((c) => {
      if (!isBuiltinCompanion(c.key) && c.has_avatar && !avatarUrls[c.id]) {
        api
          .getCompanionAvatarBlobUrl(c.id)
          .then((url) => {
            setAvatarUrls((prev) => ({ ...prev, [c.id]: url }));
          })
          .catch(() => {
            // Falls back to the initial-letter circle; the row itself is
            // unaffected.
          });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companions]);

  // Only (re)fetch last-message previews while the list itself is showing
  // -- this also means stepping back from a thread to the list refreshes
  // all of them, so whichever companion was just messaged shows its real
  // last message instead of a stale greeting placeholder.
  useEffect(() => {
    if (activeKey !== null || !loaded) return undefined;
    let cancelled = false;
    companions.forEach((c) => {
      api
        .getChatHistory(c.key)
        .then((data) => {
          if (cancelled) return;
          const list = Array.isArray(data) ? data : [];
          setLastMessages((prev) => ({
            ...prev,
            [c.key]: list.length ? list[list.length - 1] : null,
          }));
        })
        .catch(() => {
          if (!cancelled) setLastMessages((prev) => ({ ...prev, [c.key]: null }));
        });
    });
    return () => {
      cancelled = true;
    };
  }, [activeKey, loaded, companions]);

  // Deep-link support: Sidebar.jsx's search results send
  // navigate('/chat', { state: { openCompanionKey } }) for a companion hit
  // (same navigate(path, { state }) + useLocation().state mechanism Login.jsx
  // already uses for its own post-login redirect). Once the companion list
  // has loaded, open straight into that thread if the key matches one, then
  // clear the location state so revisiting /chat later via the sidebar nav
  // link doesn't re-trigger it.
  const openCompanionKey = location.state?.openCompanionKey;
  useEffect(() => {
    if (!loaded || !openCompanionKey) return;
    const match = companions.find((c) => c.key === openCompanionKey);
    if (match) setActiveKey(match.key);
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, companions, openCompanionKey]);

  async function handleToggleHidden(c) {
    setHideBusy((prev) => ({ ...prev, [c.id]: true }));
    try {
      const updated = await api.updateCompanion(c.id, { hidden: !c.hidden });
      setCompanions((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (err) {
      showToast(err.message || "Couldn't do that. Please try again.");
    } finally {
      setHideBusy((prev) => ({ ...prev, [c.id]: false }));
    }
  }

  async function handleDeleteConfirm(c) {
    setDeleting(true);
    try {
      await api.deleteCompanion(c.id);
      setCompanions((prev) => prev.filter((x) => x.id !== c.id));
      forgetAvatarUrl(c.id);
      setDeleteConfirmId(null);
      showToast(`${c.name} was removed.`);
    } catch (err) {
      showToast(err.message || "Couldn't delete that. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  function handleAddDone(created) {
    setCompanions((prev) => [...prev, created]);
    setShowAddForm(false);
    setActiveKey(created.key);
  }

  function handleEditDone(updated) {
    setCompanions((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    forgetAvatarUrl(updated.id);
    setEditingId(null);
    showToast('Saved.');
  }

  const resolved = companions.map((c) => resolveCompanion(c, avatarUrls[c.id]));
  const visible = resolved.filter((c) => !c.hidden);
  const hidden = resolved.filter((c) => c.hidden);

  if (activeKey) {
    const companion = resolved.find((c) => c.key === activeKey);
    if (companion) {
      return (
        <>
          <Topbar
            title={companion.name}
            avatarSrc={companion.avatar || undefined}
            onBack={() => setActiveKey(null)}
          />
          <div className="screen-inner chat-screen">
            <ChatPanel companion={companion} />
          </div>
        </>
      );
    }
  }

  function renderRow(c) {
    if (editingId === c.id) {
      return (
        <CompanionForm
          key={c.id}
          mode="edit"
          companion={c}
          onCancel={() => setEditingId(null)}
          onDone={handleEditDone}
        />
      );
    }
    return (
      <CompanionRow
        key={c.id}
        companion={c}
        lastMessage={lastMessages[c.key]}
        onOpen={() => setActiveKey(c.key)}
        onToggleHidden={() => handleToggleHidden(c)}
        hidingBusy={Boolean(hideBusy[c.id])}
        onEdit={() => setEditingId(c.id)}
        confirmingDelete={deleteConfirmId === c.id}
        onDeleteRequest={() => setDeleteConfirmId(c.id)}
        onDeleteConfirm={() => handleDeleteConfirm(c)}
        onDeleteCancel={() => setDeleteConfirmId(null)}
        deleting={deleting && deleteConfirmId === c.id}
      />
    );
  }

  return (
    <>
      <Topbar title="Chat" />
      <div className="screen-inner chat-screen">
        <div className="chat-list">
          {!showAddForm && (
            <button
              type="button"
              className="btn btn-primary chat-add-friend-btn"
              onClick={() => setShowAddForm(true)}
            >
              + Add a friend
            </button>
          )}
          {showAddForm && (
            <CompanionForm mode="create" onCancel={() => setShowAddForm(false)} onDone={handleAddDone} />
          )}

          {!loaded && <p className="mood-empty">Loading…</p>}
          {loaded && visible.map(renderRow)}
        </div>

        {hidden.length > 0 && (
          <div className="chat-hidden-section">
            <button type="button" className="btn-quiet" onClick={() => setShowHidden((s) => !s)}>
              {showHidden ? 'Hide hidden friends' : `Show hidden friends (${hidden.length})`}
            </button>
            {showHidden && <div className="chat-list chat-list-hidden">{hidden.map(renderRow)}</div>}
          </div>
        )}
      </div>
    </>
  );
}
