import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as api from './api.js';

// Light / Dark / System appearance preference. Deliberately separate from
// SettingsContext (which holds *account* accessibility settings synced with
// the backend) -- this is a pure client-side display preference stored only
// in localStorage (see api.js's getThemePreference/setThemePreference), so
// it works before sign-in and never needs a network round trip.
//
// The actual flip happens by setting/removing `data-theme` on <html>; every
// token in index.css cascades from that attribute (or, for 'system', from
// the plain prefers-color-scheme media query), so a single attribute change
// here is all it takes to re-theme the whole app instantly. The same
// data-theme value is also applied synchronously by an inline script in
// index.html before React ever mounts, so there is no flash of the wrong
// theme on load -- the useState initializer below just picks up whatever
// that script (and localStorage) already agree on.

const ThemeContext = createContext(null);

function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') {
    root.setAttribute('data-theme', theme);
  } else {
    // 'system' -- remove any override so the prefers-color-scheme media
    // query in index.css is the only thing deciding, exactly like before
    // this preference existed. Also lets the app react live to the OS
    // theme changing while it's open, since that's plain CSS from here.
    root.removeAttribute('data-theme');
  }
}

function systemPrefersDark() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => api.getThemePreference());

  // Live-tracked OS preference, only consulted when theme === 'system'. Kept
  // as its own bit of state (rather than derived inline) so components can
  // get a single always-'light'|'dark' resolvedTheme without each having to
  // know about matchMedia themselves.
  const [systemIsDark, setSystemIsDark] = useState(systemPrefersDark);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => setSystemIsDark(e.matches);
    // Safari < 14 only supports addListener/removeListener; modern browsers
    // support addEventListener/removeEventListener. Support both.
    if (mql.addEventListener) {
      mql.addEventListener('change', handleChange);
      return () => mql.removeEventListener('change', handleChange);
    }
    mql.addListener(handleChange);
    return () => mql.removeListener(handleChange);
  }, []);

  const setTheme = useCallback((next) => {
    api.setThemePreference(next);
    applyTheme(next);
    setThemeState(next);
  }, []);

  // Always 'light' or 'dark', never 'system' -- resolves the live OS
  // preference when the user's raw choice is 'system'.
  const resolvedTheme = theme === 'light' || theme === 'dark' ? theme : systemIsDark ? 'dark' : 'light';

  const value = useMemo(
    () => ({ theme, setTheme, resolvedTheme }),
    [theme, setTheme, resolvedTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
