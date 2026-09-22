import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import * as api from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { useTheme } from '../ThemeContext.jsx';
import dstLogo from '../assets/dst_logo.png';
import dstLogoWhite from '../assets/dst_logo_white.png';
import {
  BackIcon,
  BreatheIcon,
  ChatIcon,
  EmergencyIcon,
  FamilyIcon,
  FocusIcon,
  HomeIcon,
  JournalIcon,
  LogoutIcon,
  MoodIcon,
  MoonIcon,
  ProgressIcon,
  SettingsIcon,
  StudyIcon,
} from './icons.jsx';

// Persistent, Gemini-style left navigation -- desktop only (hidden below the
// 900px breakpoint via CSS; see .app-sidebar in index.css). It gives desktop
// users a way to jump straight to any section from anywhere. Because this
// nav covers Journal/Mood/Chat/Breathe/Study/Progress/Sleep at that width, Home's
// own tile grid + stats are redundant there and Home.jsx renders a chat
// panel in their place instead (see Home.jsx); below 900px, with no
// sidebar, Home keeps its original tile grid + stats and the per-screen
// Topbar back-arrow is still how every screen is unaffected either way.
const NAV_ITEMS = [
  { to: '/home', label: 'Home', Icon: HomeIcon },
  { to: '/journal', label: 'Journal', Icon: JournalIcon },
  { to: '/mood', label: 'Mood', Icon: MoodIcon },
  { to: '/chat', label: 'Chat', Icon: ChatIcon },
  { to: '/breathing', label: 'Breathe', Icon: BreatheIcon },
  { to: '/insomnia', label: 'Sleep', Icon: MoonIcon },
  { to: '/study', label: 'Study', Icon: StudyIcon },
  { to: '/focus', label: 'Focus', Icon: FocusIcon },
  { to: '/progress', label: 'Progress', Icon: ProgressIcon },
  { to: '/family', label: 'Family', Icon: FamilyIcon },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon },
];

// Result groups in display order -- the keys match the /api/search response
// shape exactly (see api.js's search()).
const SEARCH_GROUPS = [
  { key: 'journal', label: 'Journal', path: '/journal' },
  { key: 'tasks', label: 'Tasks', path: '/study' },
  { key: 'subjects', label: 'Subjects', path: '/study' },
  { key: 'goals', label: 'Goals', path: '/study' },
];

// Journal text can run long -- a short single-line preview reads much
// better in a narrow sidebar dropdown than a wrapped paragraph would.
function truncate(text, max = 60) {
  const trimmed = (text || '').trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

function resultLabel(group, item) {
  if (group === 'journal') return truncate(item.text);
  if (group === 'subjects') return item.name;
  return item.title;
}

export default function Sidebar({ collapsed, onToggle }) {
  const navigate = useNavigate();
  const { username, profilePhoto, signOut } = useAuth();
  const { resolvedTheme } = useTheme();

  // ---- content search (journal / tasks / subjects / goals) ----------------
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null); // null until a search has run
  const [open, setOpen] = useState(false);
  const searchBoxRef = useRef(null);

  function handleLogout() {
    signOut();
    navigate('/login', { replace: true });
  }

  const initial = (username || '?').trim().charAt(0).toUpperCase() || '?';

  // Debounces the actual /api/search call ~300ms behind typing, and skips
  // the network entirely for an empty/whitespace query (mirrors the search
  // debounce in Study.jsx's TasksTab).
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults(null);
      return undefined;
    }
    const t = setTimeout(() => {
      api
        .search(trimmed)
        .then((data) => setResults(data))
        .catch(() => setResults(null));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  // Escape, or a click outside the search box, closes the results dropdown.
  useEffect(() => {
    if (!open) return undefined;
    function handleKeyDown(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    function handlePointerDown(e) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [open]);

  function goToResult(path) {
    setOpen(false);
    setQuery('');
    setResults(null);
    navigate(path);
  }

  const showDropdown = open && query.trim().length > 0;
  const hasAnyResults = Boolean(
    results && SEARCH_GROUPS.some(({ key }) => (results[key] || []).length > 0)
  );

  return (
    <nav className="app-sidebar" aria-label="Main navigation" aria-hidden={collapsed}>
      <div className="sidebar-brand">
        <img
          className="sidebar-logo"
          src={resolvedTheme === 'dark' ? dstLogoWhite : dstLogo}
          alt=""
        />
        <span>Sõbrad</span>
        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={() => onToggle?.(true)}
          aria-label="Hide sidebar"
          title="Hide sidebar"
        >
          <BackIcon />
        </button>
      </div>

      <div className="sidebar-search" ref={searchBoxRef}>
        <input
          type="search"
          className="sidebar-search-input"
          placeholder="Search journal, tasks, study…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          aria-label="Search journal, tasks, subjects and goals"
        />
        {showDropdown && (
          <div className="sidebar-search-results" role="listbox">
            {results && hasAnyResults && (
              <>
                {SEARCH_GROUPS.map(({ key, label, path }) => {
                  const items = results[key] || [];
                  if (items.length === 0) return null;
                  return (
                    <div className="search-group" key={key}>
                      <div className="search-group-header">{label}</div>
                      {items.map((item) => (
                        <button
                          key={`${key}-${item.id}`}
                          type="button"
                          className="search-result-row"
                          onClick={() => goToResult(path)}
                        >
                          <span className="search-result-text">{resultLabel(key, item)}</span>
                          {key === 'tasks' && item.status && (
                            <span className="search-result-badge">{item.status}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </>
            )}
            {results && !hasAnyResults && <p className="sidebar-search-empty">No results</p>}
            {!results && <p className="sidebar-search-empty">Searching…</p>}
          </div>
        )}
      </div>

      <div className="sidebar-nav">
        {NAV_ITEMS.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `sidebar-row${isActive ? ' active' : ''}`}
          >
            <span className="icon">
              <Icon />
            </span>
            <span>{label}</span>
          </NavLink>
        ))}
      </div>

      <div className="sidebar-bottom">
        <NavLink
          to="/emergency"
          className={({ isActive }) => `sidebar-row sidebar-row-emergency${isActive ? ' active' : ''}`}
        >
          <span className="icon">
            <EmergencyIcon />
          </span>
          <span>Emergency</span>
        </NavLink>

        <button type="button" className="sidebar-row sidebar-row-button" onClick={handleLogout}>
          <span className="icon">
            <LogoutIcon />
          </span>
          <span>Log out</span>
        </button>

        <button
          type="button"
          className="sidebar-account"
          onClick={() => navigate('/profile')}
        >
          {profilePhoto ? (
            <img className="sidebar-avatar" src={profilePhoto} alt="" aria-hidden="true" />
          ) : (
            <span className="sidebar-avatar" aria-hidden="true">
              {initial}
            </span>
          )}
          <span className="sidebar-account-name">{username || 'Account'}</span>
        </button>
      </div>
    </nav>
  );
}
