import { useState } from 'react';
import Topbar from '../components/Topbar.jsx';
import * as api from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { useToast } from '../ToastContext.jsx';
import { useSettings } from '../SettingsContext.jsx';
import { useTheme } from '../ThemeContext.jsx';

// A small labelled pill switch, shared by all four accessibility toggles
// below. Renders as a real <button role="switch"> so it's keyboard- and
// screen-reader-operable, not just a styled div.
function Switch({ id, checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch${checked ? ' on' : ''}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-knob" />
    </button>
  );
}

function ChangePasswordSection() {
  const { signIn, username } = useAuth();
  const showToast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const mismatch = newPassword && confirmPassword && newPassword !== confirmPassword;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Please fill in all three fields.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Those two new passwords don't match — please type it the same way twice.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.changePassword({ currentPassword, newPassword });
      // Success returns a fresh token/user, same shape as login — treat it
      // exactly like a successful login so the session stays valid.
      signIn(result.token, result.user?.username || username);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('Password changed.');
    } catch (err) {
      setError(err.message || 'That current password looks wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="settings-section">
      <h3>Change password</h3>
      <form onSubmit={handleSubmit} className="reset-flow" style={{ marginBottom: 0 }}>
        <div className="field">
          <label htmlFor="current-password">Current password</label>
          <input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="confirm-new-password">Confirm new password</label>
          <input
            id="confirm-new-password"
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

        <button
          type="submit"
          className="btn btn-primary"
          disabled={submitting || Boolean(mismatch)}
        >
          {submitting ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </section>
  );
}

const PRESET_QUESTIONS = [
  "First pet's name?",
  'City you were born in?',
  'Favorite teacher’s name?',
  'custom',
];

function SecurityQuestionSection() {
  const showToast = useToast();
  const [preset, setPreset] = useState(PRESET_QUESTIONS[0]);
  const [customQuestion, setCustomQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  const question = preset === 'custom' ? customQuestion.trim() : preset;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaved(false);

    if (!question || !answer.trim()) {
      setError('Please choose (or write) a question and give an answer.');
      return;
    }

    setSubmitting(true);
    try {
      await api.setSecurityQuestion({ securityQuestion: question, securityAnswer: answer.trim() });
      setSaved(true);
      setAnswer('');
      showToast('Security question saved.');
    } catch (err) {
      setError(err.message || "Couldn't save that. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="settings-section">
      <h3>Security question</h3>
      <p className="settings-section-hint">
        Used only if you ever forget your password. There&rsquo;s no way for us to show you what
        it&rsquo;s currently set to — this form always sets (or replaces) it.
      </p>
      <form onSubmit={handleSubmit} className="reset-flow" style={{ marginBottom: 0 }}>
        <div className="field">
          <label htmlFor="security-question-preset">Question</label>
          <select
            id="security-question-preset"
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
          >
            <option value="First pet's name?">First pet&rsquo;s name?</option>
            <option value="City you were born in?">City you were born in?</option>
            <option value="Favorite teacher's name?">Favorite teacher&rsquo;s name?</option>
            <option value="custom">Write my own…</option>
          </select>
        </div>
        {preset === 'custom' && (
          <div className="field">
            <label htmlFor="security-question-custom">Your question</label>
            <input
              id="security-question-custom"
              type="text"
              placeholder="e.g. What street did you grow up on?"
              value={customQuestion}
              onChange={(e) => setCustomQuestion(e.target.value)}
            />
          </div>
        )}
        <div className="field">
          <label htmlFor="security-answer">Answer</label>
          <input
            id="security-answer"
            type="text"
            autoComplete="off"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
        </div>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {saved && !error && <p className="settings-success-text">Saved.</p>}

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save security question'}
        </button>
      </form>
    </section>
  );
}

const APPEARANCE_OPTIONS = [
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
  { key: 'system', label: 'System' },
];

function AppearanceSection() {
  const { theme, setTheme } = useTheme();

  return (
    <section className="settings-section">
      <h3>Appearance</h3>
      <p className="settings-section-hint">
        System matches your device&rsquo;s light/dark setting automatically. Light and Dark
        override it and apply everywhere in Sõbrad right away.
      </p>
      <div className="appearance-options" role="radiogroup" aria-label="Appearance">
        {APPEARANCE_OPTIONS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={theme === key}
            className={`appearance-option${theme === key ? ' active' : ''}`}
            onClick={() => setTheme(key)}
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}

function AccessibilitySection() {
  const { settings, updateSettings } = useSettings();
  const showToast = useToast();
  const [pending, setPending] = useState(null);

  async function handleToggle(key, value) {
    setPending(key);
    try {
      await updateSettings({ [key]: value });
    } catch (err) {
      showToast(err.message || "Couldn't save that setting. Please try again.");
    } finally {
      setPending(null);
    }
  }

  const rows = [
    {
      key: 'reduce_animations',
      label: 'Reduce animations',
      desc: 'Shortens and calms motion across the whole app.',
    },
    {
      key: 'low_stimulation_mode',
      label: 'Low stimulation mode',
      desc: 'Flattens shadows and softens colour so screens feel quieter.',
    },
    {
      key: 'high_contrast',
      label: 'High contrast',
      desc: 'Stronger borders and text for easier reading.',
    },
    {
      key: 'sound_enabled',
      label: 'Sound',
      desc: 'Lets sounds (like the Focus timer chime) play.',
    },
    {
      key: 'screen_break_reminders_enabled',
      label: 'Screen break reminders',
      desc: 'A gentle nudge to rest your eyes after 45 minutes of use — Study, Breathing and Sleep don’t count toward it, since those are already time well spent.',
    },
  ];

  return (
    <section className="settings-section">
      <h3>Sensory-friendly settings</h3>
      <p className="settings-section-hint">
        These apply everywhere in Sõbrad right away, and stay set the next time you sign in.
      </p>
      {rows.map(({ key, label, desc }) => (
        <div className="settings-toggle-row" key={key}>
          <div className="settings-toggle-copy">
            <label className="settings-toggle-label" htmlFor={`toggle-${key}`}>
              {label}
            </label>
            <span className="settings-toggle-desc">{desc}</span>
          </div>
          <Switch
            id={`toggle-${key}`}
            checked={Boolean(settings[key])}
            disabled={pending === key}
            label={label}
            onChange={(next) => handleToggle(key, next)}
          />
        </div>
      ))}
    </section>
  );
}

export default function Settings() {
  return (
    <>
      <Topbar title="Settings" />
      <div className="screen-inner">
        <ChangePasswordSection />
        <SecurityQuestionSection />
        <AppearanceSection />
        <AccessibilitySection />
      </div>
    </>
  );
}
