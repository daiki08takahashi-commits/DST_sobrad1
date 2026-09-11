import { useNavigate } from 'react-router-dom';
import { BackIcon } from './icons.jsx';

// Shared back-arrow + title header used by every non-Home authenticated
// screen. Always returns to Home, matching the original prototype's nav.
export default function Topbar({ title }) {
  const navigate = useNavigate();
  return (
    <div className="topbar">
      <button className="back-btn" onClick={() => navigate('/home')} aria-label="Back to home">
        <BackIcon />
      </button>
      <h2>{title}</h2>
    </div>
  );
}
