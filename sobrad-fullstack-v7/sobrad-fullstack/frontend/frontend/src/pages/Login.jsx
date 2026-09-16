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

const PRESET_QUESTIONS = [
  "First pet's name?",
  'City you were born in?',
  "Favorite teacher's name?",
];

// ---- Forgot-password flow, inline on the login screen ----------------------
// This app doesn't collect email addresses, so reset is done via a security
// question set at registration (or later, from Settings) instead of an
// email link. Kept as simple state on this same page rather than a
// separate route, to stay consistent with the login/register toggle above.
function ResetFlow({ onDone, onCancel }) {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [step, setStep] = useState('username'); // 'username' | 'question' | 'no-question'
  const [username, setUsername] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const mismatch = newPassword && confirmPassword && newPassword !== confirmPassword;

  async function handleLookup(e) {
    e.preventDefault();
    setError('');
    if (!username.trim()) {
      setError('Please enter your username.');
      return;
    }
    setLoading(true);
    try {
      const data = await api.getSecurityQuestion(username.trim());
      if (data?.has_question) {
        setQuestion(data.question || '');
        setStep('question');
      } else {
        setStep('no-question');
      }
    } catch {
      // The endpoint always returns 200, so this is a real connectivity
      // problem — not "no such user" (that's indistinguishable by design).
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e) {
    e.preventDefault();
    setError('');

    if (!answer.trim() || !newPassword || !confirmPassword) {
      setError('Please fill in the answer and both new-password fields.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Those two new passwords don't match — please type it the same way twice.");
      return;
    }

    setLoading(true);
    try {
      const result = await api.resetPassword({
        username: username.trim(),
        securityAnswer: answer.trim(),
        newPassword,
      });
      signIn(result.token, result.user?.username || username.trim());
      const redirectTo = location.state?.from || '/home';
      navigate(redirectTo, { replace: true });
      onDone?.();
    } catch (err) {
      // Wrong answer / no question set / unknown username are all
      // indistinguishable by design — one generic message for all of them,
      // regardless of what the backend's detail string actually says.
      setError(
        err.status === 0
          ? "Couldn't reach the server. Please try again."
          : "That didn't match — check your username and answer and try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="reset-flow">
      {step === 'username' && (
        <form onSubmit={handleLookup} className="reset-flow" style={{ marginBottom: 0 }}>
          <p className="settings-section-hint" style={{ margin: 0 }}>
            Enter your username and we&rsquo;ll check whether you have a security question set.
          </p>
          <div className="field">
            <label htmlFor="reset-username">Username</label>
            <input
              id="reset-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="login-actions">
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Checking…' : 'Continue'}
            </button>
            <button type="button" className="btn-quiet" onClick={onCancel}>
              Back to log in
            </button>
          </div>
        </form>
      )}

      {step === 'no-question' && (
        <div className="reset-flow" style={{ marginBottom: 0 }}>
          <p className="reset-no-question">
            We couldn&rsquo;t find a security question for that account. Double-check the
            username, or try logging in normally and set one up from Settings so this works
            next time.
          </p>
          <div className="login-actions">
            <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={onCancel}>
              Back to log in
            </button>
          </div>
        </div>
      )}

      {step === 'question' && (
        <form onSubmit={handleReset} className="reset-flow" style={{ marginBottom: 0 }}>
          <p className="reset-question">{question}</p>
          <div className="field">
            <label htmlFor="reset-answer">Your answer</label>
            <input
              id="reset-answer"
              type="text"
              autoComplete="off"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="reset-new-password">New password</label>
            <input
              id="reset-new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="reset-confirm-password">Confirm new password</label>
            <input
              id="reset-confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            {mismatch && (
              <span className="field-hint" role="alert">
                Those don&rsquo;t match yet.
              </span>
            )}
          </div>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <div className="login-actions">
            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%' }}
              disabled={loading || Boolean(mismatch)}
            >
              {loading ? 'Resetting…' : 'Reset password'}
            </button>
            <button type="button" className="btn-quiet" onClick={onCancel}>
              Back to log in
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'reset'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Optional security question, collected at registration only.
  const [regQuestionPreset, setRegQuestionPreset] = useState(PRESET_QUESTIONS[0]);
  const [regQuestionCustom, setRegQuestionCustom] = useState('');
  const [regAnswer, setRegAnswer] = useState('');

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
      let result;
      if (mode === 'register') {
        const regQuestion =
          regQuestionPreset === 'custom' ? regQuestionCustom.trim() : regQuestionPreset;
        const options =
          regQuestion && regAnswer.trim()
            ? { securityQuestion: regQuestion, securityAnswer: regAnswer.trim() }
            : {};
        result = await api.register(username.trim(), password, options);
      } else {
        result = await api.login(username.trim(), password);
      }
      signIn(result.token, result.user?.username || username.trim());
      const redirectTo = location.state?.from || '/home';
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function switchMode(nextMode) {
    setError('');
    setMode(nextMode);
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

        {mode === 'reset' ? (
          <ResetFlow onDone={() => switchMode('login')} onCancel={() => switchMode('login')} />
        ) : (
          <>
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

              {mode === 'register' && (
                <>
                  <div className="field">
                    <label htmlFor="reg-question-preset">Security question</label>
                    <select
                      id="reg-question-preset"
                      value={regQuestionPreset}
                      onChange={(e) => setRegQuestionPreset(e.target.value)}
                    >
                      {PRESET_QUESTIONS.map((q) => (
                        <option key={q} value={q}>
                          {q}
                        </option>
                      ))}
                      <option value="custom">Write my own…</option>
                    </select>
                    <span className="field-hint">
                      (optional, but needed if you ever forget your password)
                    </span>
                  </div>
                  {regQuestionPreset === 'custom' && (
                    <div className="field">
                      <label htmlFor="reg-question-custom">Your question</label>
                      <input
                        id="reg-question-custom"
                        type="text"
                        placeholder="e.g. What street did you grow up on?"
                        value={regQuestionCustom}
                        onChange={(e) => setRegQuestionCustom(e.target.value)}
                      />
                    </div>
                  )}
                  <div className="field">
                    <label htmlFor="reg-answer">Answer</label>
                    <input
                      id="reg-answer"
                      type="text"
                      placeholder="optional"
                      autoComplete="off"
                      value={regAnswer}
                      onChange={(e) => setRegAnswer(e.target.value)}
                    />
                  </div>
                </>
              )}

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

              {mode === 'login' && (
                <button
                  type="button"
                  className="btn-quiet login-forgot-link"
                  onClick={() => switchMode('reset')}
                >
                  Forgot password?
                </button>
              )}

              <button
                type="button"
                className="btn-quiet"
                onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
              >
                {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Log in'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
