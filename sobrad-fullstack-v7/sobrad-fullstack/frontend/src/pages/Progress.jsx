import { useEffect, useState } from 'react';
import Topbar from '../components/Topbar.jsx';
import * as api from '../api.js';
import { BreatheIcon, GoalIcon, JournalIcon, MoodIcon } from '../components/icons.jsx';

export default function Progress() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getStats()
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const dash = '—';
  const rows = [
    {
      icon: <BreatheIcon />,
      value: stats ? stats.grounding_minutes : dash,
      label: 'grounding minutes, in total',
    },
    {
      icon: <JournalIcon />,
      value: stats ? stats.journal_entries : dash,
      label: 'journal entries, in total',
    },
    {
      icon: <GoalIcon />,
      value: stats ? stats.goals_reached : dash,
      label: 'goals reached, in total',
    },
    {
      icon: <MoodIcon />,
      value: stats ? stats.mood_checkins : dash,
      label: 'mood check-ins logged',
    },
  ];

  return (
    <>
      <Topbar title="Progress" />
      <div className="screen-inner screen-center">
        <p className="progress-note">
          Everything you see here only ever adds up. There&rsquo;s no streak to lose.
        </p>
        <div className="progress-list">
          {rows.map((row) => (
            <div className="progress-row" key={row.label}>
              <span className="icon">{row.icon}</span>
              <div className="progress-row-text">
                <span className="progress-row-num">{row.value}</span>
                <span className="progress-row-label">{row.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
