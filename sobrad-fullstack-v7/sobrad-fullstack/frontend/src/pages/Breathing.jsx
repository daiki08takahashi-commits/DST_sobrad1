import { useEffect, useRef, useState } from 'react';
import Topbar from '../components/Topbar.jsx';
import * as api from '../api.js';

const TICK_MS = 4000;

export default function Breathing() {
  const [breathing, setBreathing] = useState(false);
  const [inhaling, setInhaling] = useState(false);
  const [label, setLabel] = useState('Breathe in…');

  const timerRef = useRef(null);
  const startedAtRef = useRef(null);
  const breathingRef = useRef(false);

  function tick() {
    setInhaling((prev) => {
      const next = !prev;
      setLabel(next ? 'Breathe in…' : 'Breathe out…');
      return next;
    });
  }

  function saveElapsed() {
    const startedAt = startedAtRef.current;
    startedAtRef.current = null;
    if (startedAt == null) return;
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs <= 0) return;
    const minutes = Math.max(1, Math.round(elapsedMs / 60000));
    api.createBreathingSession(minutes).catch(() => {
      // Best-effort: a dropped save here isn't worth interrupting the user.
    });
  }

  function start() {
    breathingRef.current = true;
    setBreathing(true);
    setInhaling(false);
    tick(); // flips straight to "Breathe in…", matching the original prototype
    startedAtRef.current = Date.now();
    timerRef.current = setInterval(tick, TICK_MS);
  }

  function pause() {
    breathingRef.current = false;
    setBreathing(false);
    clearInterval(timerRef.current);
    setLabel('Paused');
    saveElapsed();
  }

  // Leaving the screen mid-session counts as a stop, so time is still saved.
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      if (breathingRef.current) saveElapsed();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Topbar title="Breathing" />
      <div className="screen-inner screen-center">
        <div className="breathe-card">
          <div className="breath-stage">
            <div className="breath-ring" aria-hidden="true"></div>
            <div className={`breath-circle${inhaling ? ' inhale' : ''}`}></div>
          </div>
          <p className="breath-label">{label}</p>
          <button className="btn btn-primary breathe-toggle" onClick={breathing ? pause : start}>
            {breathing ? 'Pause' : 'Start'}
          </button>
        </div>
        <p className="breathe-note">Follow the circle. There&rsquo;s no wrong way to do this.</p>
      </div>
    </>
  );
}
