import { useLocation, useNavigate } from 'react-router-dom';
import { EmergencyIcon } from './icons.jsx';

// Pinned on every authenticated screen (including Emergency itself, where it
// simply has nothing new to do). Remembers where it was pressed from so the
// Emergency screen's close control can return there.
export default function EmergencyFab() {
  const navigate = useNavigate();
  const location = useLocation();

  function handleClick() {
    if (location.pathname === '/emergency') return;
    navigate('/emergency', { state: { from: location.pathname } });
  }

  return (
    <button className="emergency-fab" onClick={handleClick} aria-label="Get emergency help now">
      <EmergencyIcon />
    </button>
  );
}
