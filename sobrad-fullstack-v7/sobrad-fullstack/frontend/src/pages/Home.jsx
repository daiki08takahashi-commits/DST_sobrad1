import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { useTheme } from '../ThemeContext.jsx';
import dstLogo from '../assets/dst_logo.png';
import dstLogoWhite from '../assets/dst_logo_white.png';
import {
  BreatheIcon,
  ChatIcon,
  JournalIcon,
  MoonIcon,
  StudyIcon,
} from '../components/icons.jsx';

function greetingForHour(hour) {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// Note: "Today Mode" (the today-due checklist + Start Focus/Help me focus
// card) used to live here, between the hero card and the stats row. It's
// moved to Study's new "Today" tab (see TodayTab in Study.jsx). The stats
// row itself has since moved too -- to the new Profile page (see
// pages/Profile.jsx) -- so Home now stays just hero card + nav ring, no
// card clutter or stats mixed in.

export default function Home() {
  const navigate = useNavigate();
  const { username } = useAuth();
  const { resolvedTheme } = useTheme();
  const [now] = useState(() => new Date());

  const greeting = greetingForHour(now.getHours());
  const dateStr = now.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <>
      <div className="home-topbar">
        <div className="home-topbar-text">
          <p className="eyebrow">{dateStr}</p>
          <h1>{greeting}{username ? `, ${username}` : ''}</h1>
        </div>
        <div className="home-topbar-brand">
          <img
            className="dst-mark-home"
            src={resolvedTheme === 'dark' ? dstLogoWhite : dstLogo}
            alt="DST logo"
          />
        </div>
      </div>

      <div className="screen-inner home-screen" style={{ paddingTop: 14 }}>
        <div className="hero-card">
          <p className="hero-date">{dateStr}</p>
          <p className="hero-line">However today feels, you&rsquo;re welcome here.</p>
        </div>

        <div className="nav-field">
          <p className="eyebrow">Today&rsquo;s step</p>

          {/* Small circles sit in a ring around this container (see .nav-cluster
              in index.css) -- order here matches the CSS's nth-child angles,
              starting with Sleep at the top and going clockwise. Breathe is
              the 5th (last) child so it doesn't shift the nth-child(1..4)
              angle mapping for the four small circles -- it's positioned dead
              centre by its own CSS rule instead of a ring angle. */}
          <div className="nav-cluster">
            <button className="nav-circle-small" onClick={() => navigate('/insomnia')} aria-label="Sleep">
              <span className="icon"><MoonIcon /></span>
              <span>Sleep</span>
            </button>
            <button className="nav-circle-small" onClick={() => navigate('/journal')} aria-label="Journal">
              <span className="icon"><JournalIcon /></span>
              <span>Journal</span>
            </button>
            <button className="nav-circle-small" onClick={() => navigate('/chat')} aria-label="Chat">
              <span className="icon"><ChatIcon /></span>
              <span>Chat</span>
            </button>
            <button className="nav-circle-small" onClick={() => navigate('/study')} aria-label="Study">
              <span className="icon"><StudyIcon /></span>
              <span>Study</span>
            </button>
            <button
              className="nav-circle-primary"
              onClick={() => navigate('/breathing')}
              aria-label="Breathe — today's suggested step"
            >
              <span className="icon"><BreatheIcon /></span>
              <span>Breathe</span>
              <small>4 minutes</small>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
