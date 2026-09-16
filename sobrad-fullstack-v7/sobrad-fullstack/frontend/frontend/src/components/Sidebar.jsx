import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import dstLogo from '../assets/dst_logo.png';
import {
  BreatheIcon,
  ChatIcon,
  EmergencyIcon,
  FocusIcon,
  HomeIcon,
  JournalIcon,
  LogoutIcon,
  MoodIcon,
  MoonIcon,
  ProgressIcon,
  SettingsIcon,
  StudyIcon,
} from './icons.jsx';

// Persistent, Gemini-style left navigation -- desktop only (hidden below the
// 900px breakpoint via CSS; see .app-sidebar in index.css). It gives desktop
// users a way to jump straight to any section from anywhere. Because this
// nav covers Journal/Mood/Chat/Breathe/Study/Progress/Sleep at that width, Home's
// own tile grid + stats are redundant there and Home.jsx renders a chat
// panel in their place instead (see Home.jsx); below 900px, with no
// sidebar, Home keeps its original tile grid + stats and the per-screen
// Topbar back-arrow is still how every screen is unaffected either way.
const NAV_ITEMS = [
  { to: '/home', label: 'Home', Icon: HomeIcon },
  { to: '/journal', label: 'Journal', Icon: JournalIcon },
  { to: '/mood', label: 'Mood', Icon: MoodIcon },
  { to: '/chat', label: 'Chat', Icon: ChatIcon },
  { to: '/breathing', label: 'Breathe', Icon: BreatheIcon },
  { to: '/insomnia', label: 'Sleep', Icon: MoonIcon },
  { to: '/study', label: 'Study', Icon: StudyIcon },
  { to: '/focus', label: 'Focus', Icon: FocusIcon },
  { to: '/progress', label: 'Progress', Icon: ProgressIcon },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const { username, signOut } = useAuth();

  function handleLogout() {
    signOut();
    navigate('/login', { replace: true });
  }

  const initial = (username || '?').trim().charAt(0).toUpperCase() || '?';

  return (
    <nav className="app-sidebar" aria-label="Main navigation">
      <div className="sidebar-brand">
        <img className="sidebar-logo" src={dstLogo} alt="" />
        <span>Sõbrad</span>
      </div>

      <div className="sidebar-nav">
        {NAV_ITEMS.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `sidebar-row${isActive ? ' active' : ''}`}
          >
            <span className="icon">
              <Icon />
            </span>
            <span>{label}</span>
          </NavLink>
        ))}
      </div>

      <div className="sidebar-bottom">
        <NavLink
          to="/emergency"
          className={({ isActive }) => `sidebar-row sidebar-row-emergency${isActive ? ' active' : ''}`}
        >
          <span className="icon">
            <EmergencyIcon />
          </span>
          <span>Emergency</span>
        </NavLink>

        <button type="button" className="sidebar-row sidebar-row-button" onClick={handleLogout}>
          <span className="icon">
            <LogoutIcon />
          </span>
          <span>Log out</span>
        </button>

        <div className="sidebar-account">
          <span className="sidebar-avatar" aria-hidden="true">
            {initial}
          </span>
          <span className="sidebar-account-name">{username || 'Account'}</span>
        </div>
      </div>
    </nav>
  );
}
