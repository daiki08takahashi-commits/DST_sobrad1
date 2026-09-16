import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Topbar from '../components/Topbar.jsx';
import * as api from '../api.js';
import { useToast } from '../ToastContext.jsx';

// Focus Session Timer + Emergency Focus Mode.
//
// Three "modes" the countdown can be started with -- the two fixed Pomodoro
// shapes plus a free-typed custom length. Break length isn't tracked here
// (see task brief): planned_minutes is the *focus* length only.
const MODES = [
  { id: 'pomodoro_25_5', label: 'Pomodoro 25/5', minutes: 25, blurb: '25 min focus, 5 min break' },
  { id: 'pomodoro_50_10', label: 'Pomodoro 50/10', minutes: 50, blurb: '50 min focus, 10 min break' },
  { id: 'custom', label: 'Custom', minutes: null, blurb: 'Set your own focus length' },
];

const EMERGENCY_MODE = 'pomodoro_25_5';
const EMERGENCY_MINUTES = 25;

function formatClock(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// A short, gentle two-note chime synthesized with the Web Audio API -- no
// audio file needed. Kept quiet (low gain, sine wave, slow fade in/out)
// since this is a calm app for people who may already be stressed; this is
// a nudge, not an alarm.
function playGentleChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notes = [587.33, 783.99]; // D5, G5 -- a soft, non-alarming interval
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.32;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.14, start + 0.08);
      gain.gain.linearRampToValueAtTime(0, start + 1.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 1.2);
    });
    setTimeout(() => ctx.close().catch(() => {}), 2000);
  } catch {
    // Best effort -- silence is an acceptable degradation if Web Audio
    // isn't available.
  }
}

export default function Focus() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const showToast = useToast();

  const taskIdParam = searchParams.get('task');
  const isEmergencyParam = searchParams.get('emergency') === '1';

  // loading -> checking for an already-open session
  // picker  -> mode picker, nothing running
  // running -> countdown in progress
  // done    -> just finished/stopped, offering to start again
  const [phase, setPhase] = useState('loading');
  const [session, setSession] = useState(null);
  const [remaining, setRemaining] = useState(0);
  const [minimal, setMinimal] = useState(false);
  const [taskTitle, setTaskTitle] = useState(null);
  const [selectedMode, setSelectedMode] = useState('pomodoro_25_5');
  const [customMinutes, setCustomMinutes] = useState('30');
  const [starting, setStarting] = useState(false);
  const [lastCompleted, setLastCompleted] = useState(true);

  const tickRef = useRef(null);
  const completedRef = useRef(false);
  const emergencyKickedOffRef = useRef(false);

  const endSession = useCallback(
    async (completed) => {
      clearInterval(tickRef.current);
      tickRef.current = null;
      setSession((current) => {
        if (current && !completedRef.current) {
          completedRef.current = true;
          api.completeFocusSession(current.id, completed).catch(() => {
            // Best effort -- the local UI still ends the session even if
            // the network call fails.
          });
        }
        return current;
      });
      if (completed) {
        playGentleChime();
        showToast('Nice focus. Session complete.');
      }
      setLastCompleted(completed);
      setMinimal(false);
      setPhase('done');
    },
    [showToast]
  );

  const beginSession = useCallback(
    async (mode, minutes, taskId, makeMinimal) => {
      setStarting(true);
      completedRef.current = false;
      try {
        const created = await api.startFocusSession({
          mode,
          plannedMinutes: minutes,
          taskId: taskId || undefined,
        });
        setSession(created);
        setPhase('running');
        setMinimal(Boolean(makeMinimal));
      } catch {
        showToast("Couldn't start the session. Please try again.");
        setPhase('picker');
      } finally {
        setStarting(false);
      }
    },
    [showToast]
  );

  // Countdown tick, driven off session.started_at + session.planned_minutes
  // rather than a locally-counted number, so a page reload (see the resume
  // effect below) picks up exactly where it should be instead of drifting
  // or restarting.
  useEffect(() => {
    if (phase !== 'running' || !session) return undefined;

    function tick() {
      const startedAt = new Date(session.started_at).getTime();
      const secsLeft = session.planned_minutes * 60 - (Date.now() - startedAt) / 1000;
      setRemaining(secsLeft);
      if (secsLeft <= 0) {
        endSession(true);
      }
    }

    tick();
    tickRef.current = setInterval(tick, 1000);
    return () => clearInterval(tickRef.current);
  }, [phase, session, endSession]);

  // On load: resume an already-open session ("Continue Session") if one
  // exists, otherwise honour ?emergency=1 (Help me focus, deep-linked from
  // Home) or fall back to the mode picker. Also resolves ?task=<id> (or an
  // active session's own task_id) to a title to show during the session.
  useEffect(() => {
    let cancelled = false;

    if (taskIdParam) {
      api
        .getTask(taskIdParam)
        .then((t) => {
          if (!cancelled) setTaskTitle(t.title);
        })
        .catch(() => {});
    }

    api
      .getActiveFocusSession()
      .then((active) => {
        if (cancelled) return;
        if (active) {
          completedRef.current = false;
          setSession(active);
          setPhase('running');
          if (active.task_id && !taskIdParam) {
            api
              .getTask(active.task_id)
              .then((t) => {
                if (!cancelled) setTaskTitle(t.title);
              })
              .catch(() => {});
          }
          return;
        }
        if (isEmergencyParam && !emergencyKickedOffRef.current) {
          emergencyKickedOffRef.current = true;
          beginSession(EMERGENCY_MODE, EMERGENCY_MINUTES, null, true);
          return;
        }
        setPhase('picker');
      })
      .catch(() => {
        if (!cancelled) setPhase('picker');
      });

    return () => {
      cancelled = true;
    };
    // Intentionally only on mount -- query params are read once to decide
    // the initial phase, not re-applied on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Emergency Focus Mode hides the app's normal chrome (sidebar + emergency
  // FAB) for as long as it's active -- a body class flips CSS rules added
  // alongside the rest of this page's styles (see .focus-minimal-view /
  // body.focus-minimal in index.css). The minimal view below renders no
  // Topbar of its own either way, so this is a genuine hide, not a
  // visually-behind overlay.
  useEffect(() => {
    document.body.classList.toggle('focus-minimal', minimal);
    return () => document.body.classList.remove('focus-minimal');
  }, [minimal]);

  function handleStart() {
    const mode = MODES.find((m) => m.id === selectedMode) || MODES[0];
    const minutes =
      mode.id === 'custom' ? Math.max(1, Math.min(180, parseInt(customMinutes, 10) || 25)) : mode.minutes;
    beginSession(mode.id, minutes, taskIdParam ? Number(taskIdParam) : null, false);
  }

  function handleEmergency() {
    beginSession(EMERGENCY_MODE, EMERGENCY_MINUTES, null, true);
  }

  function handleStop() {
    endSession(false);
  }

  function handleStartAnother() {
    setSession(null);
    setTaskTitle(null);
    setPhase('picker');
  }

  const plannedSeconds = session ? session.planned_minutes * 60 : 0;
  const percentLeft = plannedSeconds ? Math.max(0, Math.min(1, remaining / plannedSeconds)) : 0;
  const ringRadius = 88;
  const ringCircumference = 2 * Math.PI * ringRadius;

  const ring = (
    <div className="focus-ring-wrap">
      <svg viewBox="0 0 200 200" className="focus-ring" aria-hidden="true">
        <circle cx="100" cy="100" r={ringRadius} className="focus-ring-track" />
        <circle
          cx="100"
          cy="100"
          r={ringRadius}
          className="focus-ring-progress"
          strokeDasharray={ringCircumference}
          strokeDashoffset={ringCircumference * (1 - percentLeft)}
          transform="rotate(-90 100 100)"
        />
      </svg>
      <div className="focus-ring-label">{formatClock(remaining)}</div>
    </div>
  );

  if (phase === 'loading') {
    return (
      <>
        <Topbar title="Focus" />
        <div className="screen-inner screen-center">
          <p className="eyebrow">Checking for a session…</p>
        </div>
      </>
    );
  }

  // Emergency / minimal mode: deliberately nothing but the countdown, the
  // task (if any), and a Stop button -- no Topbar, no sidebar, no FAB.
  if (phase === 'running' && minimal) {
    return (
      <div className="focus-minimal-view">
        <p className="focus-minimal-eyebrow">Emergency Focus</p>
        {taskTitle && <p className="focus-minimal-task">{taskTitle}</p>}
        {ring}
        <button type="button" className="btn btn-outline focus-minimal-stop" onClick={handleStop}>
          Stop
        </button>
      </div>
    );
  }

  return (
    <>
      <Topbar title="Focus" />
      <div className="screen-inner screen-center">
        {phase === 'picker' && (
          <div className="focus-card">
            {taskTitle && (
              <p className="focus-task-note">
                Starting focus on <strong>{taskTitle}</strong>
              </p>
            )}
            <p className="eyebrow">Choose a session</p>
            <div className="focus-mode-list">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`focus-mode-option${selectedMode === m.id ? ' selected' : ''}`}
                  onClick={() => setSelectedMode(m.id)}
                  aria-pressed={selectedMode === m.id}
                >
                  <span className="focus-mode-label">{m.label}</span>
                  <span className="focus-mode-blurb">{m.blurb}</span>
                </button>
              ))}
            </div>
            {selectedMode === 'custom' && (
              <div className="field focus-custom-field">
                <label htmlFor="focus-custom-minutes">Focus minutes</label>
                <input
                  id="focus-custom-minutes"
                  type="number"
                  min="1"
                  max="180"
                  inputMode="numeric"
                  value={customMinutes}
                  onChange={(e) => setCustomMinutes(e.target.value)}
                />
              </div>
            )}
            <button type="button" className="btn btn-primary" onClick={handleStart} disabled={starting}>
              {starting ? 'Starting…' : 'Start focus session'}
            </button>
            <button type="button" className="btn-quiet focus-emergency-link" onClick={handleEmergency}>
              Help me focus right now
            </button>
          </div>
        )}

        {phase === 'running' && session && (
          <div className="focus-card">
            {taskTitle && (
              <p className="focus-task-note">
                Focusing on <strong>{taskTitle}</strong>
              </p>
            )}
            {ring}
            <p className="focus-status">Stay with it if you can. You can stop any time.</p>
            <button type="button" className="btn btn-outline" onClick={handleStop}>
              Stop session
            </button>
          </div>
        )}

        {phase === 'done' && (
          <div className="focus-card">
            <p className="focus-status">
              {lastCompleted
                ? 'Session complete. Well done for showing up for it.'
                : 'Session stopped. That still counts -- you can pick it back up any time.'}
            </p>
            <button type="button" className="btn btn-primary" onClick={handleStartAnother}>
              Start another session
            </button>
            <button type="button" className="btn-quiet" onClick={() => navigate('/home')}>
              Back to Home
            </button>
          </div>
        )}
      </div>
    </>
  );
}
