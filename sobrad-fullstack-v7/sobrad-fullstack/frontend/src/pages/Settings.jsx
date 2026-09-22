import { useEffect, useState } from 'react';
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

// Lets the account add/update an email, which the backend then also accepts
// in the login form's username field (see Login.jsx) -- so this account has
// two ways in, not a separate credential. Follows the exact same
// "call the API, then applyUser() the response" pattern Profile.jsx already
// uses after a photo upload, so the change shows up everywhere (Sidebar,
// this very form's pre-fill) right away.
function EmailSection() {
  const { email, applyUser } = useAuth();
  const showToast = useToast();
  const [value, setValue] = useState(email || '');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Keeps the field pre-filled with whatever's actually on the account,
  // including on first load (email starts null until AuthContext's own
  // getMe() hydration resolves).
  useEffect(() => {
    setValue(email || '');
  }, [email]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!value.trim()) {
      setError('Please enter an email address.');
      return;
    }

    setSubmitting(true);
    try {
      const updatedUser = await api.updateEmail(value.trim());
      applyUser(updatedUser);
      showToast('Email updated.');
    } catch (err) {
      setError(err.message || "Couldn't save that email. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="settings-section">
      <h3>Email</h3>
      <p className="settings-section-hint">
        Once it&rsquo;s set, you can log in with either your username or this email.
      </p>
      <form onSubmit={handleSubmit} className="reset-flow" style={{ marginBottom: 0 }}>
        <div className="field">
          <label htmlFor="account-email">Email</label>
          <input
            id="account-email"
            type="email"
            autoComplete="email"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="you@example.com"
          />
        </div>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save email'}
        </button>
      </form>
    </section>
  );
}

// ---- Family sharing: invite a parent to a read-only view of Study data ----
// (grades/trends/the AI insight summary only -- see FamilyChildView.jsx).
// Not called out as its own page in the brief, but sendFamilyInvite /
// getFamilyInvites / revokeFamilyInvite need *some* place to be called from
// on the student's side, or a parent could never receive a token to accept
// via FamilyJoin.jsx -- Settings is the natural, low-key home for it,
// following the same .settings-section pattern as everything else here.
function FamilySharingSection() {
  const showToast = useToast();
  const [invites, setInvites] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [parentEmail, setParentEmail] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [revokingId, setRevokingId] = useState(null);

  function loadInvites() {
    return api
      .getFamilyInvites()
      .then((data) => {
        setInvites(Array.isArray(data) ? data : []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }

  useEffect(() => {
    loadInvites();
  }, []);

  async function handleSend(e) {
    e.preventDefault();
    setError('');

    if (!parentEmail.trim()) {
      setError("Please enter a parent's email address.");
      return;
    }

    setSending(true);
    try {
      await api.sendFamilyInvite(parentEmail.trim());
      setParentEmail('');
      await loadInvites();
      showToast('Invite sent.');
    } catch (err) {
      setError(err.message || "Couldn't send that invite. Please try again.");
    } finally {
      setSending(false);
    }
  }

  async function handleRevoke(id, wasAccepted) {
    setRevokingId(id);
    try {
      await api.revokeFamilyInvite(id);
      await loadInvites();
      showToast(wasAccepted ? 'Access removed.' : 'Invite revoked.');
    } catch (err) {
      showToast(err.message || "Couldn't do that. Please try again.");
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <section className="settings-section">
      <h3>Family sharing</h3>
      <p className="settings-section-hint">
        Invite a parent or guardian to see your study progress -- grades, trends and the AI
        summary. Nothing else here -- not your journal, chats or anything from Focus or
        Emergency -- is ever part of what they see.
      </p>
      <form onSubmit={handleSend} className="reset-flow" style={{ marginBottom: 0 }}>
        <div className="field">
          <label htmlFor="family-parent-email">Parent&rsquo;s email</label>
          <input
            id="family-parent-email"
            type="email"
            autoComplete="off"
            value={parentEmail}
            onChange={(e) => setParentEmail(e.target.value)}
            placeholder="parent@example.com"
          />
        </div>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn-primary" disabled={sending}>
          {sending ? 'Sending…' : 'Send invite'}
        </button>
      </form>

      {loaded && invites.length === 0 && (
        <p className="mood-empty">No invites sent yet.</p>
      )}

      {invites.length > 0 && (
        <div className="family-invite-list">
          {invites.map((inv) => (
            <div className="family-invite-row" key={inv.id}>
              <div className="family-invite-row-text">
                <span className="family-invite-email">{inv.parent_email}</span>
                <span className={`family-invite-status family-invite-status-${inv.status}`}>
                  {inv.status}
                </span>
              </div>
              {/* Revoke works on a pending invite (withdraw it before it's
                  ever accepted) and, just as importantly, on an already-
                  accepted one -- that's what actually cuts off a parent
                  who's been viewing for a while. Only a revoked invite has
                  nothing left to revoke. */}
              {(inv.status === 'pending' || inv.status === 'accepted') && (
                <button
                  type="button"
                  className="btn-quiet"
                  onClick={() => handleRevoke(inv.id, inv.status === 'accepted')}
                  disabled={revokingId === inv.id}
                >
                  {revokingId === inv.id
                    ? 'Removing…'
                    : inv.status === 'accepted'
                      ? 'Remove access'
                      : 'Revoke'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
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
        <EmailSection />
        <SecurityQuestionSection />
        <FamilySharingSection />
        <AppearanceSection />
        <AccessibilitySection />
      </div>
    </>
  );
}
