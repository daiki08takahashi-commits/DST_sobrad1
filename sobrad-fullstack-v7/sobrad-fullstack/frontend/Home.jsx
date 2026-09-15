import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import dstLogo from '../assets/dst_logo.png';
import ChatPanel from '../components/ChatPanel.jsx';
import {
  BreatheIcon,
  ChatIcon,
  GoalIcon,
  JournalIcon,
  MoodIcon,
  ProgressIcon,
  StudyIcon,
} from '../components/icons.jsx';

const DESKTOP_QUERY = '(min-width: 900px)';

function greetingForHour(hour) {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// The persistent sidebar (Journal/Mood/Chat/Breathe/Study/Progress) only
// exists at >=900px, so only there is Home's own tile grid + stats
// redundant -- there Home renders the shared ChatPanel instead, becoming a
// chat landing screen (greeting + hero message + live conversation), same
// backend/conversation as the dedicated Chat screen. Below 900px there is
// no sidebar, so mobile/tablet still need Home's tile grid as their only
// way to reach those screens -- it (and the stats row) render unchanged
// there.
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(DESKTOP_QUERY).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY);
    const onChange = (e) => setIsDesktop(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isDesktop;
}

export default function Home() {
  const navigate = useNavigate();
  const { username } = useAuth();
  const [now] = useState(() => new Date());
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState(false);
  const isDesktop = useIsDesktop();

  const greeting = greetingForHour(now.getHours());
  const dateStr = now.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  useEffect(() => {
    if (isDesktop) return undefined; // stat chips only render below 900px
    let cancelled = false;
    api
      .getStats()
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {
        if (!cancelled) setStatsError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isDesktop]);

  return (
    <>
      <div className="home-topbar">
        <div className="home-topbar-text">
          <p className="eyebrow">{dateStr}</p>
          <h1>{greeting}{username ? `, ${username}` : ''}</h1>
        </div>
        <div className="home-topbar-brand">
          <img className="dst-mark-home" src={dstLogo} alt="DST logo" />
        </div>
      </div>

      <div className="screen-inner home-screen" style={{ paddingTop: 14 }}>
        <div className="hero-card">
          <p className="hero-date">{dateStr}</p>
          <p className="hero-line">However today feels, you&rsquo;re welcome here.</p>
        </div>

        {isDesktop ? (
          <ChatPanel />
        ) : (
          <>
            <div className="stats-row">
              <div className="stat-chip">
                <span className="icon"><BreatheIcon /></span>
                <strong>{stats ? stats.grounding_minutes : statsError ? '—' : '…'}</strong>
                <span>grounding minutes</span>
              </div>
              <div className="stat-chip">
                <span className="icon"><JournalIcon /></span>
                <strong>{stats ? stats.journal_entries : statsError ? '—' : '…'}</strong>
                <span>journal entries</span>
              </div>
              <div className="stat-chip">
                <span className="icon"><GoalIcon /></span>
                <strong>{stats ? stats.goals_reached : statsError ? '—' : '…'}</strong>
                <span>goals reached</span>
              </div>
            </div>

            <div className="nav-field">
              <p className="eyebrow">Today&rsquo;s step</p>
              <button
                className="nav-circle-primary"
                onClick={() => navigate('/breathing')}
                aria-label="Breathe — today's suggested step"
              >
                <span className="icon"><BreatheIcon /></span>
                <span>Breathe</span>
                <small>4 minutes</small>
              </button>

              <div className="nav-cluster">
                <button className="nav-circle-small" onClick={() => navigate('/journal')} aria-label="Journal">
                  <span className="icon"><JournalIcon /></span>
                  <span>Journal</span>
                </button>
                <button className="nav-circle-small" onClick={() => navigate('/chat')} aria-label="Chat">
                  <span className="icon"><ChatIcon /></span>
                  <span>Chat</span>
                </button>
                <button className="nav-circle-small" onClick={() => navigate('/mood')} aria-label="Mood">
                  <span className="icon"><MoodIcon /></span>
                  <span>Mood</span>
                </button>
                <button className="nav-circle-small" onClick={() => navigate('/progress')} aria-label="Progress">
                  <span className="icon"><ProgressIcon /></span>
                  <span>Progress</span>
                </button>
                <button className="nav-circle-small" onClick={() => navigate('/study')} aria-label="Study">
                  <span className="icon"><StudyIcon /></span>
                  <span>Study</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
