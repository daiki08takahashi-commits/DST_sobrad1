import { useEffect, useRef, useState } from 'react';
import Topbar from '../components/Topbar.jsx';
import { MoonIcon, SoundOnIcon, SoundOffIcon } from '../components/icons.jsx';

const SESSION_SECONDS = 2 * 60 * 60; // 2 hours
const MUSIC_VOLUME = 0.45;
const TIDE_PEAK_GAIN = 0.32; // sits a bit under the music layer
const FOAM_PEAK_GAIN = 0.12; // crash/foam accent -- modest relative to the main body
const DISPLAY_TICK_MS = 15000; // recompute remaining time a few times a minute
const FADE_MS = 4000; // gentle fade-out when the timer runs out on its own

// Builds the tide's main "body" noise buffer. Instead of flat white noise
// (Math.random()*2-1 for every sample), each sample runs through a one-pole
// "leaky integrator" -- a running value that only nudges a little toward
// the new white-noise sample each step -- which biases the result toward
// the low end (pink/brown-ish) instead of being flat across the spectrum.
// That low-end weight is what reads as deep, "watery" rumble rather than
// the airy, hissy texture flat white noise gives, which is what made the
// old tide sound like wind. Output is clamped to [-1, 1] since the gain
// makeup (`* 3.5`) can otherwise push a rare sample past full scale.
function createNoiseBuffer(ctx, seconds = 5) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = (b0 + 0.02 * white) / 1.02;
    data[i] = Math.max(-1, Math.min(1, b0 * 3.5));
  }
  return buffer;
}

// Builds the shorter, brighter noise buffer for the "foam/crash" transient
// (see scheduleSwellCycle). Only lightly colored -- this layer gets its
// character mainly from the higher-cutoff filter it's routed through in
// start(), not from the buffer itself, so it reads as foam/spray rather
// than another low rumble stacked on top of the main body.
function createFoamNoiseBuffer(ctx, seconds = 2) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = (b0 + 0.35 * white) / 1.35;
    data[i] = Math.max(-1, Math.min(1, b0 * 1.8));
  }
  return buffer;
}

function formatRemaining(totalSeconds) {
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  if (minutes > 0) return `${minutes}m remaining`;
  return 'Less than a minute remaining';
}

export default function Insomnia() {
  const [active, setActive] = useState(false);
  const [muted, setMuted] = useState(false);
  const [tideOn, setTideOn] = useState(true);
  const [remaining, setRemaining] = useState(SESSION_SECONDS);

  const audioRef = useRef(null);
  const activeRef = useRef(false);
  const mutedRef = useRef(false);
  const tideOnRef = useRef(true);

  const endAtRef = useRef(null);
  const displayTimerRef = useRef(null);
  const swellTimeoutRef = useRef(null);

  // Web Audio graph for the synthesized "tide" layer: two noise sources --
  // the main watery body, and a brief foam/crash accent -- each through
  // their own filter and gain envelope, mixed together into a shared
  // on/off gain (tide toggle) -> mute gain (session mute) -> destination.
  const audioCtxRef = useRef(null);
  const tideSourceRef = useRef(null);
  const swellGainRef = useRef(null);
  const foamSourceRef = useRef(null);
  const foamGainRef = useRef(null);
  const onOffGainRef = useRef(null);
  const tideMuteGainRef = useRef(null);

  // Schedules one "wave" of the tide layer. A real wave builds toward its
  // break relatively fast and then recedes/hisses out much more slowly --
  // not a smooth, symmetric swell -- so the rise here (2-4s) is roughly a
  // quarter of the fall (the remainder of the 10-14s cycle). The foam/crash
  // layer is gated open right at the top of that rise (a fast ~0.3-0.6s
  // attack) so the crash transient lands exactly as the main body peaks,
  // then fades over ~1-2s, mirroring how a wave's foam trails its crest.
  // Depth/timing are randomized per cycle (as before), and it reschedules
  // itself for as long as the session stays active.
  function scheduleSwellCycle() {
    if (!activeRef.current) return;
    const ctx = audioCtxRef.current;
    const gainNode = swellGainRef.current;
    const foamGain = foamGainRef.current;
    if (!ctx || !gainNode) return;

    const now = ctx.currentTime;
    const cycleSeconds = 10 + Math.random() * 4; // 10-14s per wave
    const riseSeconds = 2 + Math.random() * 2; // 2-4s fast build toward the crash
    const peak = TIDE_PEAK_GAIN * (0.55 + Math.random() * 0.45);
    const trough = TIDE_PEAK_GAIN * (0.05 + Math.random() * 0.08);

    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.linearRampToValueAtTime(peak, now + riseSeconds);
    gainNode.gain.linearRampToValueAtTime(trough, now + cycleSeconds); // slow ~6-10s recede/hiss-out

    if (foamGain) {
      const foamPeak = FOAM_PEAK_GAIN * (0.6 + Math.random() * 0.4);
      const attackSeconds = 0.3 + Math.random() * 0.3; // 0.3-0.6s fast attack
      const releaseSeconds = 1 + Math.random(); // 1-2s quick fade
      const attackStart = Math.max(now, now + riseSeconds - attackSeconds);
      foamGain.gain.cancelScheduledValues(now);
      foamGain.gain.setValueAtTime(0.0001, now);
      foamGain.gain.setValueAtTime(0.0001, attackStart);
      foamGain.gain.linearRampToValueAtTime(foamPeak, now + riseSeconds);
      foamGain.gain.linearRampToValueAtTime(0.0001, now + riseSeconds + releaseSeconds);
    }

    swellTimeoutRef.current = setTimeout(scheduleSwellCycle, cycleSeconds * 1000);
  }

  function tickDisplay() {
    const endAt = endAtRef.current;
    if (endAt == null) return;
    const remainingSeconds = Math.max(0, Math.round((endAt - Date.now()) / 1000));
    setRemaining(remainingSeconds);
    if (remainingSeconds <= 0) {
      stopWithFade();
    }
  }

  // Stops and tears down both audio layers: pauses/rewinds the <audio>
  // element and stops + closes the tide's AudioContext graph, mirroring the
  // cleanup pattern in Breathing.jsx. Deliberately touches only refs (not
  // React state) so it's also safe to call from the unmount cleanup below.
  function teardownAudio() {
    clearInterval(displayTimerRef.current);
    displayTimerRef.current = null;
    clearTimeout(swellTimeoutRef.current);
    swellTimeoutRef.current = null;

    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = MUSIC_VOLUME;
    }

    const source = tideSourceRef.current;
    if (source) {
      try {
        source.stop();
      } catch {
        // already stopped -- nothing to do
      }
      try {
        source.disconnect();
      } catch {
        // already disconnected -- nothing to do
      }
    }
    const foamSource = foamSourceRef.current;
    if (foamSource) {
      try {
        foamSource.stop();
      } catch {
        // already stopped -- nothing to do
      }
      try {
        foamSource.disconnect();
      } catch {
        // already disconnected -- nothing to do
      }
    }
    tideSourceRef.current = null;
    swellGainRef.current = null;
    foamSourceRef.current = null;
    foamGainRef.current = null;
    onOffGainRef.current = null;
    tideMuteGainRef.current = null;

    const ctx = audioCtxRef.current;
    if (ctx && ctx.state !== 'closed') {
      ctx.close().catch(() => {});
    }
    audioCtxRef.current = null;
    activeRef.current = false;
  }

  function hardStop() {
    teardownAudio();
    setActive(false);
    endAtRef.current = null;
    setRemaining(SESSION_SECONDS);
  }

  // Used when the 2-hour timer runs out on its own: a short fade instead of
  // a hard cut, then the same cleanup as a manual stop.
  function stopWithFade() {
    const ctx = audioCtxRef.current;
    const muteGain = tideMuteGainRef.current;
    if (ctx && muteGain) {
      const now = ctx.currentTime;
      muteGain.gain.cancelScheduledValues(now);
      muteGain.gain.setValueAtTime(muteGain.gain.value, now);
      muteGain.gain.linearRampToValueAtTime(0, now + FADE_MS / 1000);
    }
    const audio = audioRef.current;
    if (audio) {
      const startVolume = audio.volume;
      const steps = 10;
      let step = 0;
      const fadeInterval = setInterval(() => {
        step += 1;
        audio.volume = Math.max(0, startVolume * (1 - step / steps));
        if (step >= steps) clearInterval(fadeInterval);
      }, FADE_MS / steps);
    }
    setTimeout(hardStop, FADE_MS + 50);
  }

  function start() {
    let ctx = audioCtxRef.current;
    if (!ctx || ctx.state === 'closed') {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = ctx;
    } else if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const source = ctx.createBufferSource();
    source.buffer = createNoiseBuffer(ctx);
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400; // warm, low "body" -- well under the old 750Hz, which read as windy hiss

    const swellGain = ctx.createGain();
    swellGain.gain.value = 0.05;

    // Foam/crash layer: a second, shorter noise buffer through a brighter
    // bandpass filter, silent most of the time and briefly gated open by
    // scheduleSwellCycle right as the main swell peaks -- the sound of a
    // wave breaking, layered under the main body rather than replacing it.
    const foamSource = ctx.createBufferSource();
    foamSource.buffer = createFoamNoiseBuffer(ctx);
    foamSource.loop = true;

    const foamFilter = ctx.createBiquadFilter();
    foamFilter.type = 'bandpass';
    foamFilter.frequency.value = 2400;
    foamFilter.Q.value = 0.8;

    const foamGain = ctx.createGain();
    foamGain.gain.value = 0.0001;

    const onOffGain = ctx.createGain();
    onOffGain.gain.value = tideOnRef.current ? 1 : 0;

    const muteGain = ctx.createGain();
    muteGain.gain.value = mutedRef.current ? 0 : 1;

    source.connect(filter);
    filter.connect(swellGain);
    swellGain.connect(onOffGain);

    foamSource.connect(foamFilter);
    foamFilter.connect(foamGain);
    foamGain.connect(onOffGain);

    onOffGain.connect(muteGain);
    muteGain.connect(ctx.destination);
    source.start();
    foamSource.start();

    tideSourceRef.current = source;
    swellGainRef.current = swellGain;
    foamSourceRef.current = foamSource;
    foamGainRef.current = foamGain;
    onOffGainRef.current = onOffGain;
    tideMuteGainRef.current = muteGain;

    activeRef.current = true;
    setActive(true);

    // Started inside the same click handler as the tide graph above, so
    // this still counts as a user gesture and autoplay-with-sound isn't
    // blocked.
    const audio = audioRef.current;
    if (audio) {
      audio.volume = MUSIC_VOLUME;
      audio.muted = mutedRef.current;
      audio.currentTime = 0;
      audio.play().catch(() => {
        // Best-effort: the tide layer still plays even if this is blocked.
      });
    }

    endAtRef.current = Date.now() + SESSION_SECONDS * 1000;
    setRemaining(SESSION_SECONDS);
    scheduleSwellCycle();
    displayTimerRef.current = setInterval(tickDisplay, DISPLAY_TICK_MS);
  }

  function stop() {
    hardStop();
  }

  function toggleMute() {
    setMuted((prev) => {
      const next = !prev;
      mutedRef.current = next;
      if (audioRef.current) audioRef.current.muted = next;
      const ctx = audioCtxRef.current;
      const muteGain = tideMuteGainRef.current;
      if (ctx && muteGain) {
        const now = ctx.currentTime;
        muteGain.gain.cancelScheduledValues(now);
        muteGain.gain.setTargetAtTime(next ? 0 : 1, now, 0.05);
      }
      return next;
    });
  }

  function toggleTide() {
    setTideOn((prev) => {
      const next = !prev;
      tideOnRef.current = next;
      const ctx = audioCtxRef.current;
      const onOffGain = onOffGainRef.current;
      if (ctx && onOffGain) {
        const now = ctx.currentTime;
        onOffGain.gain.cancelScheduledValues(now);
        onOffGain.gain.setTargetAtTime(next ? 1 : 0, now, 0.15);
      }
      return next;
    });
  }

  // Leaving the screen mid-session stops both layers, same as Breathing.jsx.
  useEffect(() => {
    return () => {
      teardownAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Topbar title="Sleep" />
      <div className="screen-inner screen-center">
        <div className="insomnia-card">
          <button
            type="button"
            className="mute-toggle"
            onClick={toggleMute}
            aria-label={muted ? 'Unmute sound' : 'Mute sound'}
            aria-pressed={muted}
          >
            {muted ? <SoundOffIcon /> : <SoundOnIcon />}
          </button>

          <div className={`insomnia-moon${active ? ' active' : ''}`} aria-hidden="true">
            <MoonIcon />
          </div>

          <p className="insomnia-status">
            {active ? formatRemaining(remaining) : 'A calm, looping sound for up to two hours.'}
          </p>

          <button className="btn btn-primary insomnia-toggle" onClick={active ? stop : start}>
            {active ? 'Stop' : 'Start'}
          </button>

          <button
            type="button"
            className={`insomnia-tide-toggle${tideOn ? ' on' : ''}`}
            onClick={toggleTide}
            aria-pressed={tideOn}
          >
            <span className="insomnia-tide-dot" aria-hidden="true" />
            Tide sounds {tideOn ? 'on' : 'off'}
          </button>
        </div>

        <p className="breathe-note">
          Let the sound settle in the background while you drift off. It fades out on its own
          after two hours, or you can stop it any time.
        </p>

        <audio ref={audioRef} src="/audio/insomnia-track.mp3" loop preload="none" />
      </div>
    </>
  );
}
