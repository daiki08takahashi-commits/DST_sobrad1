import { useEffect, useState } from 'react';
import Topbar from '../components/Topbar.jsx';
import * as api from '../api.js';
import { useToast } from '../ToastContext.jsx';
import { ShieldIcon } from '../components/icons.jsx';

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
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
