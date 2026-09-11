import { useEffect, useState } from 'react';
import Topbar from '../components/Topbar.jsx';
import * as api from '../api.js';
import { useToast } from '../ToastContext.jsx';

const MOOD_WORDS = ['Low', 'Flat', 'Okay', 'Good', 'Great'];

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

export default function Mood() {
  const showToast = useToast();
  const [entries, setEntries] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(null);

  function loadEntries() {
    return api
      .getMoodEntries(10)
      .then((data) => {
        setEntries(Array.isArray(data) ? data : []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }

  useEffect(() => {
    loadEntries();
  }, []);

  async function handleTap(word) {
    setPending(word);
    try {
      await api.createMoodEntry(word);
      await loadEntries();
      showToast(`Logged: ${word}`);
    } catch (err) {
      showToast(err.message || "Couldn't log that. Please try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <Topbar title="Mood" />
      <div className="screen-inner screen-center">
        <p className="mood-intro">How are you feeling right now? There&rsquo;s no wrong answer.</p>
        <div className="mood-row">
          {MOOD_WORDS.map((word) => (
            <button
              key={word}
              type="button"
              className="mood-pill"
              onClick={() => handleTap(word)}
              disabled={pending !== null}
            >
              {word}
            </button>
          ))}
        </div>

        <div className="mood-list">
          {loaded && entries.length === 0 && (
            <p className="mood-empty">Nothing logged yet. A tap above takes a moment.</p>
          )}
          {entries.map((entry) => (
            <div className="mood-card" key={entry.id}>
              <span className="mood-card-date">{formatDate(entry.created_at)}</span>
              <span className="mood-card-word">{entry.word}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
