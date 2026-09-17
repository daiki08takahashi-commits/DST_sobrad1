import { useNavigate } from 'react-router-dom';
import { BackIcon } from './icons.jsx';

// Shared back-arrow + title header used by every non-Home authenticated
// screen. Always returns to Home, matching the original prototype's nav.
// `avatarSrc` is optional -- only Chat passes it, for the open companion's
// (Sõbrad or Friends -- see companions.js) profile photo next to the title;
// every other screen renders exactly as before.
// `onBack` is optional too -- when given, it replaces the "go to Home" back
// action entirely (Chat uses this so the back arrow steps out of an open
// companion thread to its own chat list, instead of leaving the Chat page).
// Every other screen omits it and keeps the normal navigate('/home').
export default function Topbar({ title, avatarSrc, onBack }) {
  const navigate = useNavigate();
  return (
    <div className="topbar">
      <button
        className="back-btn"
        onClick={onBack || (() => navigate('/home'))}
        aria-label={onBack ? 'Back' : 'Back to home'}
      >
        <BackIcon />
      </button>
      {avatarSrc && <img className="topbar-avatar" src={avatarSrc} alt="" aria-hidden="true" />}
      <h2>{title}</h2>
    </div>
  );
}
