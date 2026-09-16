import { useEffect, useRef, useState } from 'react';
import Topbar from '../components/Topbar.jsx';
import * as api from '../api.js';
import { SoundOnIcon, SoundOffIcon } from '../components/icons.jsx';

const TICK_MS = 4000;
const AUDIO_VOLUME = 0.5;

export default function Breathing() {
  const [breathing, setBreathing] = useState(false);
  const [inhaling, setInhaling] = useState(false);
  const [label, setLabel] = useState('Breathe in…');
  const [muted, setMuted] = useState(false);

  const timerRef = useRef(null);
  const startedAtRef = useRef(null);
  const breathingRef = useRef(false);
  const audioRef = useRef(null);

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

  // Stops and rewinds the backing track. Safe to call even if it was never
  // started (e.g. play() got blocked, or the element hasn't loaded yet).
  function stopAudio() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }

  function start() {
    breathingRef.current = true;
    setBreathing(true);
    setInhaling(false);
    tick(); // flips straight to "Breathe in…", matching the original prototype
    startedAtRef.current = Date.now();
    timerRef.current = setInterval(tick, TICK_MS);

    // Kicked off inside the same click handler as the rest of `start`, so
    // this counts as a user gesture and autoplay-with-sound isn't blocked.
    const audio = audioRef.current;
    if (audio) {
      audio.volume = AUDIO_VOLUME;
      audio.muted = muted;
      audio.currentTime = 0;
      audio.play().catch(() => {
        // Best-effort: if the browser still blocks it, the breathing
        // exercise itself isn't affected.
      });
    }
  }

  function pause() {
    breathingRef.current = false;
    setBreathing(false);
    clearInterval(timerRef.current);
    setLabel('Paused');
    saveElapsed();
    stopAudio();
  }

  function toggleMute() {
    setMuted((prev) => {
      const next = !prev;
      if (audioRef.current) audioRef.current.muted = next;
      return next;
    });
  }

  // Leaving the screen mid-session counts as a stop, so time is still saved
  // and the music doesn't keep playing in the background.
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      if (breathingRef.current) saveElapsed();
      stopAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Topbar title="Breathing" />
      <div className="screen-inner screen-center">
        <div className="breathe-card">
          <button
            type="button"
            className="mute-toggle"
            onClick={toggleMute}
            aria-label={muted ? 'Unmute background music' : 'Mute background music'}
            aria-pressed={muted}
          >
            {muted ? <SoundOffIcon /> : <SoundOnIcon />}
          </button>
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
        <audio ref={audioRef} src="/audio/moss-on-glass.mp3" loop preload="none" />
      </div>
    </>
  );
}
