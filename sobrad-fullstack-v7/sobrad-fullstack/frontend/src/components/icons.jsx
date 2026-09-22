// Small line-icon set shared across screens. Kept as simple functional
// components (rather than one big sprite) so each screen only renders the
// icons it actually uses.

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export function BackIcon(props) {
  return (
    <svg {...base} strokeWidth="1.8" className="icon" {...props}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

// Mirror of BackIcon, pointing the other way -- used by the floating
// "expand sidebar" button in RequireAuth.jsx (BackIcon itself is reused for
// the in-sidebar collapse button, since a left chevron already reads as
// "collapse/hide toward the left edge").
export function ChevronRightIcon(props) {
  return (
    <svg {...base} strokeWidth="1.8" className="icon" {...props}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function BreatheIcon(props) {
  return (
    <svg {...base} strokeWidth="1.6" className="icon" {...props}>
      <circle cx="12" cy="12" r="3.4" />
      <circle cx="12" cy="12" r="7.6" strokeDasharray="2.4 3.4" />
    </svg>
  );
}

export function JournalIcon(props) {
  return (
    <svg {...base} strokeWidth="1.7" className="icon" {...props}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="13" y2="16" />
    </svg>
  );
}

export function ChatIcon(props) {
  return (
    <svg {...base} strokeWidth="1.7" className="icon" {...props}>
      <path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 3v-3H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
    </svg>
  );
}

export function MoodIcon(props) {
  return (
    <svg {...base} strokeWidth="1.7" className="icon" {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M9 10h.01M15 10h.01M8.5 14.5c1 1 2.2 1.5 3.5 1.5s2.5-.5 3.5-1.5" />
    </svg>
  );
}

export function ProgressIcon(props) {
  return (
    <svg {...base} strokeWidth="1.7" className="icon" {...props}>
      <path d="M4 20V11M10.5 20V4M17 20v-8.5" />
    </svg>
  );
}

export function GoalIcon(props) {
  return (
    <svg {...base} strokeWidth="1.7" className="icon" {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M9 12.5l2 2 4-4.5" />
    </svg>
  );
}

export function StudyIcon(props) {
  return (
    <svg {...base} strokeWidth="1.7" className="icon" {...props}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <line x1="4" y1="9.5" x2="20" y2="9.5" />
      <line x1="8" y1="3" x2="8" y2="6.5" />
      <line x1="16" y1="3" x2="16" y2="6.5" />
      <line x1="7.5" y1="13" x2="10" y2="13" />
      <line x1="14" y1="13" x2="16.5" y2="13" />
      <line x1="7.5" y1="16.5" x2="10" y2="16.5" />
    </svg>
  );
}

export function FamilyIcon(props) {
  return (
    <svg {...base} strokeWidth="1.7" className="icon" {...props}>
      <circle cx="8.5" cy="8" r="2.6" />
      <circle cx="16" cy="9" r="2.1" />
      <path d="M3.5 19v-1.2A4 4 0 0 1 7.5 13.8h2a4 4 0 0 1 4 4V19" />
      <path d="M14.5 13.9A3.4 3.4 0 0 1 16.8 13a3.4 3.4 0 0 1 3.7 3.4V19" />
    </svg>
  );
}

export function ShieldIcon(props) {
  return (
    <svg {...base} strokeWidth="1.7" className="icon" {...props}>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function EmergencyIcon(props) {
  return (
    <svg {...base} strokeWidth="1.7" className="icon" {...props}>
      <path d="M12 20s-7-4.35-9.5-8.5C.5 8 2 4.5 5.5 4.5c2 0 3.5 1.2 4.5 2.7C11 5.7 12.5 4.5 14.5 4.5 18 4.5 19.5 8 18.5 11.5 16 15.65 12 20 12 20z" />
    </svg>
  );
}

export function CloseIcon(props) {
  return (
    <svg {...base} strokeWidth="1.9" className="icon" {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function HomeIcon(props) {
  return (
    <svg {...base} strokeWidth="1.7" className="icon" {...props}>
      <path d="M4 11.5L12 4l8 7.5" />
      <path d="M6 10v9a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}

export function LogoutIcon(props) {
  return (
    <svg {...base} strokeWidth="1.7" className="icon" {...props}>
      <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
      <path d="M14 8l4 4-4 4" />
      <line x1="18" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export function SoundOnIcon(props) {
  return (
    <svg {...base} strokeWidth="1.7" className="icon" {...props}>
      <path d="M4 10v4h4l5 4V6L8 10H4z" />
      <path d="M16.5 9a4.5 4.5 0 0 1 0 6" />
      <path d="M18.7 6.8a8 8 0 0 1 0 10.4" />
    </svg>
  );
}

export function SoundOffIcon(props) {
  return (
    <svg {...base} strokeWidth="1.7" className="icon" {...props}>
      <path d="M4 10v4h4l5 4V6L8 10H4z" />
      <path d="M16 9l5 6M21 9l-5 6" />
    </svg>
  );
}

export function MoonIcon(props) {
  return (
    <svg {...base} strokeWidth="1.7" className="icon" {...props}>
      <path d="M18.5 14.2A7.6 7.6 0 0 1 9.8 5.5a7.6 7.6 0 1 0 8.7 8.7z" />
    </svg>
  );
}

export function FocusIcon(props) {
  return (
    <svg {...base} strokeWidth="1.7" className="icon" {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2.6M12 18.4V21M21 12h-2.6M5.6 12H3" />
    </svg>
  );
}

export function SettingsIcon(props) {
  return (
    <svg {...base} strokeWidth="1.7" className="icon" {...props}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3v3M12 18v3M21 12h-3M6 12H3M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1M18.4 18.4l-2.1-2.1M7.7 7.7 5.6 5.6" />
    </svg>
  );
}

export function PhoneIcon(props) {
  return (
    <svg {...base} strokeWidth="1.7" className="icon" {...props}>
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2C10.5 21 3 13.5 3 6a2 2 0 0 1 2-2z" />
    </svg>
  );
}

export function CameraIcon(props) {
  return (
    <svg {...base} strokeWidth="1.7" className="icon" {...props}>
      <path d="M4 8.5a1.5 1.5 0 0 1 1.5-1.5H8l1.2-2h5.6L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-9z" />
      <circle cx="12" cy="13" r="3.4" />
    </svg>
  );
}

export function TrashIcon(props) {
  return (
    <svg {...base} strokeWidth="1.7" className="icon" {...props}>
      <path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 .8 12a1 1 0 0 0 1 .9h4.4a1 1 0 0 0 1-.9L17 7" />
    </svg>
  );
}

// "More options" kebab trigger -- a kebab menu conventionally reads as
// three solid dots even inside an otherwise stroke-only icon set, so this
// overrides `base`'s fill/stroke on each circle rather than on the <svg>
// itself, keeping the wrapper consistent with every other icon here.
export function MoreIcon(props) {
  return (
    <svg {...base} className="icon" {...props}>
      <circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
