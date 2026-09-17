import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import dstLogo from '../assets/dst_logo.png';
import {
  BreatheIcon,
  ChatIcon,
  GoalIcon,
  JournalIcon,
  MoodIcon,
  MoonIcon,
  ProgressIcon,
  StudyIcon,
} from '../components/icons.jsx';

function greetingForHour(hour) {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// ---- Today Mode helpers -----------------------------------------------
// Tasks carry an ISO due_date (or null). These compare by *calendar day*
// in the viewer's local time, not by timestamp, since "due today" should
// mean today regardless of what time of day the due_date happens to be.
function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameLocalDay(isoString, ref) {
  if (!isoString) return false;
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return false;
  return startOfLocalDay(d).getTime() === startOfLocalDay(ref).getTime();
}

function isAfterLocalDay(isoString, ref) {
  if (!isoString) return false;
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return false;
  return startOfLocalDay(d).getTime() > startOfLocalDay(ref).getTime();
}

export default function Home() {
  const navigate = useNavigate();
  const { username } = useAuth();
  const [now] = useState(() => new Date());
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState(false);

  // "Today Mode" -- a short today checklist + the single next-upcoming
  // task, additive alongside the existing hero/stats/ring below (see the
  // .today-card JSX further down). Fetched client-side from the active
  // task list rather than a dedicated backend filter, per the task brief.
  const [todayTasks, setTodayTasks] = useState([]);
  const [nextTask, setNextTask] = useState(null);
  const [todayLoaded, setTodayLoaded] = useState(false);
  const [activeFocusSession, setActiveFocusSession] = useState(null);

  const greeting = greetingForHour(now.getHours());
  const dateStr = now.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .getTasks({ status: 'active' })
      .then((tasks) => {
        if (cancelled) return;
        const due = tasks.filter((t) => isSameLocalDay(t.due_date, now));
        const upcoming = tasks
          .filter((t) => isAfterLocalDay(t.due_date, now))
          .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
        setTodayTasks(due);
        setNextTask(upcoming[0] || null);
        setTodayLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setTodayLoaded(true);
      });
    api
      .getActiveFocusSession()
      .then((session) => {
        if (!cancelled) setActiveFocusSession(session || null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [now]);

  function handleTodayCheckOff(id) {
    setTodayTasks((prev) => prev.filter((t) => t.id !== id));
    api.updateTask(id, { status: 'done' }).catch(() => {
      // Best effort -- if this fails the task simply reappears next visit.
    });
  }

  function handleTodaySkip(id) {
    setTodayTasks((prev) => prev.filter((t) => t.id !== id));
    api.rescheduleTaskTomorrow(id).catch(() => {
      // Best effort -- same as above.
    });
  }

  function handleStartFocus() {
    const topTaskId = todayTasks[0]?.id;
    navigate(topTaskId ? `/focus?task=${topTaskId}` : '/focus');
  }

  function handleHelpMeFocus() {
    navigate('/focus?emergency=1');
  }

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

        {/* "Today Mode" -- additive, sits between the hero card and the
            existing stats row. Does not replace or restructure either. */}
        <div className="today-card">
          <p className="today-card-title">Today</p>

          {todayLoaded && todayTasks.length === 0 && (
            <p className="today-empty">
              Nothing due today — a good day to get ahead, or just rest.
            </p>
          )}

          {todayTasks.length > 0 && (
            <div className="today-list">
              {todayTasks.map((task) => (
                <div className="today-item" key={task.id}>
                  <button
                    type="button"
                    className="today-item-check"
                    onClick={() => handleTodayCheckOff(task.id)}
                    aria-label={`Mark "${task.title}" done`}
                  >
                    ✓
                  </button>
                  <span className="today-item-title">{task.title}</span>
                  <button
                    type="button"
                    className="today-item-skip"
                    onClick={() => handleTodaySkip(task.id)}
                  >
                    skip → tomorrow
                  </button>
                </div>
              ))}
            </div>
          )}

          {nextTask && (
            <p className="today-next">
              Next: <strong>{nextTask.title}</strong>
            </p>
          )}

          <div className="today-actions">
            <button type="button" className="btn btn-primary" onClick={handleStartFocus}>
              {activeFocusSession ? 'Continue Session' : 'Start Focus'}
            </button>
            <button type="button" className="btn-quiet today-help-link" onClick={handleHelpMeFocus}>
              Help me focus
            </button>
          </div>
        </div>

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

          {/* Small circles sit in a ring around this container (see .nav-cluster
              in index.css) -- order here matches the CSS's nth-child angles,
              starting with Sleep at the top and going clockwise. Breathe is
              the 7th (last) child so it doesn't shift the nth-child(1..6)
              angle mapping for the six small circles -- it's positioned dead
              centre by its own CSS rule instead of a ring angle. */}
          <div className="nav-cluster">
            <button className="nav-circle-small" onClick={() => navigate('/insomnia')} aria-label="Sleep">
              <span className="icon"><MoonIcon /></span>
              <span>Sleep</span>
            </button>
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
            <button
              className="nav-circle-primary"
              onClick={() => navigate('/breathing')}
              aria-label="Breathe — today's suggested step"
            >
              <span className="icon"><BreatheIcon /></span>
              <span>Breathe</span>
              <small>4 minutes</small>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
