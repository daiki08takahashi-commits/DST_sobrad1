import { useEffect, useRef, useState } from 'react';
import Topbar from '../components/Topbar.jsx';
import * as api from '../api.js';
import { useToast } from '../ToastContext.jsx';
import { CameraIcon, ShieldIcon, TrashIcon } from '../components/icons.jsx';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

function preview(text) {
  return text.length > 90 ? `${text.slice(0, 90)}…` : text;
}

export default function Journal() {
  const showToast = useToast();
  const [entries, setEntries] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Entry id -> blob object URL for that entry's photo thumbnail. Fetched
  // lazily (only for entries reporting has_photo) and only once per entry --
  // see the effect below.
  const [photoUrls, setPhotoUrls] = useState({});
  // Entry id -> true while an upload/delete for that entry's photo is in
  // flight, so its button can show a calm "Working…" state instead of
  // allowing a second click mid-request.
  const [photoBusy, setPhotoBusy] = useState({});
  const fileInputRefs = useRef({});
  // Entry id -> true while an upload/delete for that entry's FILE attachment
  // (as opposed to its photo, above) is in flight -- fully parallel to
  // photoBusy, kept separate so a photo action and a file action on the same
  // entry never disable each other's buttons.
  const [fileBusy, setFileBusy] = useState({});
  const attachmentInputRefs = useRef({});
  // Mirrors `photoUrls` so the unmount-cleanup effect below always revokes
  // whatever was most recently in state, not a stale closure over the
  // value from when that effect was first set up.
  const photoUrlsRef = useRef({});

  useEffect(() => {
    photoUrlsRef.current = photoUrls;
  }, [photoUrls]);

  // Revoke every remaining blob URL when the Journal screen unmounts, so
  // navigating away doesn't leak memory.
  useEffect(() => {
    return () => {
      Object.values(photoUrlsRef.current).forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      });
    };
  }, []);

  function loadEntries() {
    return api
      .getJournalEntries()
      .then((data) => {
        setEntries(Array.isArray(data) ? data : []);
        setLoaded(true);
      })
      .catch(() => {
        setLoaded(true);
      });
  }

  useEffect(() => {
    loadEntries();
  }, []);

  // Fetch a thumbnail (as a blob object URL, since the endpoint needs the
  // Authorization header a plain <img src> can't send) for any entry that
  // reports has_photo but doesn't have one loaded yet. Only ever fetched
  // once per entry -- replacing/removing a photo updates or clears the map
  // directly instead of relying on this effect to notice.
  useEffect(() => {
    entries.forEach((entry) => {
      if (entry.has_photo && !photoUrls[entry.id]) {
        api
          .getJournalPhotoBlobUrl(entry.id)
          .then((url) => {
            setPhotoUrls((prev) => ({ ...prev, [entry.id]: url }));
          })
          .catch(() => {
            // Thumbnail just won't show; the entry itself is unaffected.
          });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  function replaceEntry(updated) {
    setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  }

  function forgetPhotoUrl(entryId) {
    setPhotoUrls((prev) => {
      const url = prev[entryId];
      if (url) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      }
      const next = { ...prev };
      delete next[entryId];
      return next;
    });
  }

  async function handleSave() {
    const text = value.trim();
    if (!text) return;
    setSaving(true);
    setError('');
    try {
      await api.createJournalEntry(text);
      setValue('');
      await loadEntries();
      showToast('Entry saved.');
    } catch (err) {
      setError(err.message || "Couldn't save your entry. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoChosen(entryId, file) {
    if (!file) return;
    setPhotoBusy((prev) => ({ ...prev, [entryId]: true }));
    try {
      const updated = await api.uploadJournalPhoto(entryId, file);
      replaceEntry(updated);
      // Drop any previously-loaded thumbnail for this entry -- if it's a
      // replacement, the old blob URL would otherwise keep showing the
      // photo that was just replaced. The effect above will fetch the new
      // one once it sees has_photo with nothing cached.
      forgetPhotoUrl(entryId);
      showToast('Photo added.');
    } catch (err) {
      showToast(err.message || "Couldn't attach that photo. Please try again.");
    } finally {
      setPhotoBusy((prev) => ({ ...prev, [entryId]: false }));
    }
  }

  async function handleRemovePhoto(entryId) {
    setPhotoBusy((prev) => ({ ...prev, [entryId]: true }));
    try {
      const updated = await api.deleteJournalPhoto(entryId);
      replaceEntry(updated);
      forgetPhotoUrl(entryId);
      showToast('Photo removed.');
    } catch (err) {
      showToast(err.message || "Couldn't remove that photo. Please try again.");
    } finally {
      setPhotoBusy((prev) => ({ ...prev, [entryId]: false }));
    }
  }

  function openPhoto(entryId) {
    const url = photoUrls[entryId];
    if (url) window.open(url, '_blank', 'noopener');
  }

  // ---- file attachment -- fully parallel to the photo handlers above,
  // sitting beside them rather than replacing anything. A file isn't shown
  // inline (see api.js's downloadJournalFile), so there's no blob-URL cache
  // or unmount cleanup to mirror here.

  async function handleFileChosen(entryId, file) {
    if (!file) return;
    setFileBusy((prev) => ({ ...prev, [entryId]: true }));
    try {
      const updated = await api.uploadJournalFile(entryId, file);
      replaceEntry(updated);
      showToast('File added.');
    } catch (err) {
      showToast(err.message || "Couldn't attach that file. Please try again.");
    } finally {
      setFileBusy((prev) => ({ ...prev, [entryId]: false }));
    }
  }

  async function handleRemoveFile(entryId) {
    setFileBusy((prev) => ({ ...prev, [entryId]: true }));
    try {
      const updated = await api.deleteJournalFile(entryId);
      replaceEntry(updated);
      showToast('File removed.');
    } catch (err) {
      showToast(err.message || "Couldn't remove that file. Please try again.");
    } finally {
      setFileBusy((prev) => ({ ...prev, [entryId]: false }));
    }
  }

  async function handleOpenFile(entryId, fileName) {
    try {
      await api.downloadJournalFile(entryId, fileName);
    } catch (err) {
      showToast(err.message || "Couldn't download that file. Please try again.");
    }
  }

  return (
    <>
      <Topbar title="Journal" />
      <div className="screen-inner journal-screen">
        <div className="encrypt-note">
          <span className="icon"><ShieldIcon /></span>
          <span>Saved securely to your account.</span>
        </div>

        <div className="journal-entry-card">
          <div className="field">
            <label htmlFor="journal-input">New entry</label>
            <textarea
              id="journal-input"
              placeholder="What's on your mind?"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="btn btn-primary"
            style={{ alignSelf: 'flex-start' }}
            onClick={handleSave}
            disabled={saving || !value.trim()}
          >
            {saving ? 'Saving…' : 'Save entry'}
          </button>
        </div>

        <div className="journal-list">
          {loaded && entries.length === 0 && (
            <p className="mood-empty">Nothing saved yet. Whenever you&rsquo;re ready.</p>
          )}
          {entries.map((entry) => (
            <div className="journal-card" key={entry.id}>
              <p className="journal-date">{formatDate(entry.created_at)}</p>
              <p className="journal-preview">{preview(entry.text)}</p>

              {entry.has_photo && photoUrls[entry.id] && (
                <button
                  type="button"
                  className="journal-photo-thumb"
                  onClick={() => openPhoto(entry.id)}
                  aria-label="Open full-size photo in a new tab"
                >
                  <img src={photoUrls[entry.id]} alt="" />
                </button>
              )}

              <input
                type="file"
                accept="image/*"
                ref={(el) => {
                  fileInputRefs.current[entry.id] = el;
                }}
                onChange={(e) => {
                  const file = e.target.files && e.target.files[0];
                  handlePhotoChosen(entry.id, file);
                  e.target.value = '';
                }}
                style={{ display: 'none' }}
              />
              <div className="journal-photo-actions">
                <button
                  type="button"
                  className="btn-quiet"
                  disabled={photoBusy[entry.id]}
                  onClick={() => fileInputRefs.current[entry.id]?.click()}
                >
                  <span className="icon"><CameraIcon /></span>
                  {entry.has_photo ? 'Change photo' : 'Add photo'}
                </button>
                {entry.has_photo && (
                  <button
                    type="button"
                    className="btn-quiet"
                    disabled={photoBusy[entry.id]}
                    onClick={() => handleRemovePhoto(entry.id)}
                  >
                    <span className="icon"><TrashIcon /></span>
                    Remove photo
                  </button>
                )}
              </div>

              <input
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv"
                ref={(el) => {
                  attachmentInputRefs.current[entry.id] = el;
                }}
                onChange={(e) => {
                  const file = e.target.files && e.target.files[0];
                  handleFileChosen(entry.id, file);
                  e.target.value = '';
                }}
                style={{ display: 'none' }}
              />
              <div className="journal-file-actions">
                {entry.has_file && (
                  <button
                    type="button"
                    className="journal-file-chip"
                    disabled={fileBusy[entry.id]}
                    onClick={() => handleOpenFile(entry.id, entry.file_name)}
                  >
                    {entry.file_name}
                  </button>
                )}
                <button
                  type="button"
                  className="btn-quiet"
                  disabled={fileBusy[entry.id]}
                  onClick={() => attachmentInputRefs.current[entry.id]?.click()}
                >
                  {entry.has_file ? 'Change file' : 'Add file'}
                </button>
                {entry.has_file && (
                  <button
                    type="button"
                    className="btn-quiet"
                    disabled={fileBusy[entry.id]}
                    onClick={() => handleRemoveFile(entry.id)}
                  >
                    <span className="icon"><TrashIcon /></span>
                    Remove file
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
