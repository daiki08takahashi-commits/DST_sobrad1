import { useNavigate } from 'react-router-dom';
import { BackIcon } from './icons.jsx';

// Shared back-arrow + title header used by every non-Home authenticated
// screen. Always returns to Home, matching the original prototype's nav.
// `avatarSrc` is optional -- only Chat passes it, for Sõbrad's profile
// photo next to the title; every other screen renders exactly as before.
export default function Topbar({ title, avatarSrc }) {
  const navigate = useNavigate();
  return (
    <div className="topbar">
      <button className="back-btn" onClick={() => navigate('/home')} aria-label="Back to home">
        <BackIcon />
      </button>
      {avatarSrc && <img className="topbar-avatar" src={avatarSrc} alt="" aria-hidden="true" />}
      <h2>{title}</h2>
    </div>
  );
}
