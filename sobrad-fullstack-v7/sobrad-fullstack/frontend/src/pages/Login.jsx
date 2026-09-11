import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import * as api from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import dstLogo from '../assets/dst_logo.png';

const ROTATOR_LINES = [
  'Take your time.',
  'One step is enough today.',
  "You're allowed to rest here.",
  'Nothing to prove, nothing to rush.',
];

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [lineIndex, setLineIndex] = useState(0);
  const [lineVisible, setLineVisible] = useState(true);
  const rotateTimer = useRef(null);

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const interval = setInterval(() => {
      setLineVisible(false);
      rotateTimer.current = setTimeout(
        () => {
          setLineIndex((i) => (i + 1) % ROTATOR_LINES.length);
          setLineVisible(true);
        },
        reduceMotion ? 0 : 250
      );
    }, 4000);
    return () => {
      clearInterval(interval);
      clearTimeout(rotateTimer.current);
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password) {
      setError('Please enter a username and password.');
      return;
    }

    setSubmitting(true);
    try {
      const action = mode === 'register' ? api.register : api.login;
      const result = await action(username.trim(), password);
      signIn(result.token, result.user?.username || username.trim());
      const redirectTo = location.state?.from || '/home';
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="app-shell login-page">
      <div className="screen-inner">
        <div className="login-top">
          <img className="dst-mark-login" src={dstLogo} alt="DST logo" />
          <div className="brand">DST Sõbrad</div>
          <p className="tagline">a quiet place to land</p>
          <p className={`rotator${lineVisible ? '' : ' hidden-line'}`} aria-live="polite">
            {ROTATOR_LINES[lineIndex]}
          </p>
        </div>

        <form className="login-form" onSubmit={handleSubmit} id="login-form">
          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              name="username"
              type="text"
              placeholder="your username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="your password"
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </form>

        <div className="login-actions">
          <button
            type="submit"
            form="login-form"
            className="btn btn-primary"
            style={{ width: '100%' }}
            disabled={submitting}
          >
            {submitting
              ? mode === 'register'
                ? 'Creating account…'
                : 'Logging in…'
              : mode === 'register'
                ? 'Create account'
                : 'Log in'}
          </button>
          <button
            type="button"
            className="btn-quiet"
            onClick={() => {
              setError('');
              setMode((m) => (m === 'login' ? 'register' : 'login'));
            }}
          >
            {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Log in'}
          </button>
        </div>
      </div>
    </div>
  );
}
