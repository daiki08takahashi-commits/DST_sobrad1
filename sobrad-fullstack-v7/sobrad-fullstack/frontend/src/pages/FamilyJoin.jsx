import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as api from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { useToast } from '../ToastContext.jsx';
import { useTheme } from '../ThemeContext.jsx';
import dstLogo from '../assets/dst_logo.png';
import dstLogoWhite from '../assets/dst_logo_white.png';

// Public landing page for a family-sharing invite link (?token=...), reached
// before the parent is necessarily signed in at all. Mirrors Login.jsx's own
// centered-card shell (.app-shell.login-page > .screen-inner) so it doesn't
// look like a different app, but keeps its own small content card rather
// than reusing the login form itself.
export default function FamilyJoin() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const navigate = useNavigate();
  const showToast = useToast();
  const { isAuthenticated } = useAuth();
  const { resolvedTheme } = useTheme();

  const [info, setInfo] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api
      .getFamilyInviteInfo(token)
      .then((data) => {
        if (!cancelled) setInfo(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // No token at all is the same "not a valid invite" outcome as a fetch
  // failure, just knowable without a round trip -- checked at render time
  // rather than via a setState-on-mount effect for just this one case.
  const invalidLink = loadError || !token;

  function goToLogin() {
    // Stashed so Login.jsx can finish accepting this invite right after a
    // successful sign-in/registration, whichever the visitor picks next.
    try {
      sessionStorage.setItem('sobrad_pending_invite_token', token);
    } catch {
      // sessionStorage unavailable -- the invite just won't auto-complete
      // after login; the visitor can still open this same link again.
    }
    navigate('/login');
  }

  async function handleAccept() {
    setAccepting(true);
    try {
      await api.acceptFamilyInvite(token);
      showToast('Invite accepted.');
      navigate('/family');
    } catch (err) {
      showToast(err.message || "Couldn't accept that invite. Please try again.");
    } finally {
      setAccepting(false);
    }
  }

  let body;
  if (invalidLink) {
    body = (
      <>
        <p className="family-join-message">This invite link doesn&rsquo;t look valid.</p>
        <button type="button" className="btn btn-primary" onClick={() => navigate('/login')}>
          Back to log in
        </button>
      </>
    );
  } else if (!info) {
    body = <p className="family-join-message">Checking your invite…</p>;
  } else if (info.status === 'accepted') {
    body = (
      <>
        <p className="family-join-message">This invite has already been accepted.</p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => navigate(isAuthenticated ? '/home' : '/login')}
        >
          {isAuthenticated ? 'Go home' : 'Back to log in'}
        </button>
      </>
    );
  } else if (info.status === 'revoked') {
    body = (
      <>
        <p className="family-join-message">This invite is no longer active.</p>
        <button type="button" className="btn btn-primary" onClick={() => navigate('/login')}>
          Back to log in
        </button>
      </>
    );
  } else if (!isAuthenticated) {
    body = (
      <>
        <p className="family-join-message">
          <strong>{info.child_username}</strong> wants to share their study progress with you.
        </p>
        <div className="family-join-actions">
          <button type="button" className="btn btn-primary" onClick={goToLogin}>
            Log in
          </button>
          <button type="button" className="btn btn-outline" onClick={goToLogin}>
            Create an account
          </button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <p className="family-join-message">Accept the invite from {info.child_username}?</p>
        <button type="button" className="btn btn-primary" onClick={handleAccept} disabled={accepting}>
          {accepting ? 'Accepting…' : 'Accept'}
        </button>
      </>
    );
  }

  return (
    <div className="app-shell login-page">
      <div className="screen-inner">
        <div className="login-top">
          <img
            className="dst-mark-login"
            src={resolvedTheme === 'dark' ? dstLogoWhite : dstLogo}
            alt="DST logo"
          />
          <div className="brand">DST Sõbrad</div>
        </div>
        <div className="family-join-card">{body}</div>
      </div>
    </div>
  );
}
