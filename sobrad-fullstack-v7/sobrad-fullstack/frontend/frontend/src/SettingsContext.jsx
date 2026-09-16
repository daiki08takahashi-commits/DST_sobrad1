import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as api from './api.js';
import { useAuth } from './AuthContext.jsx';

// Sensory-friendly / accessibility settings, applied globally as classes on
// <body> so their effects (see index.css: .reduce-motion / .high-contrast /
// .low-stimulation) are active everywhere in the app, not just while the
// Settings page itself is mounted. Fetched once per sign-in.

const SettingsContext = createContext(null);

const DEFAULTS = {
  reduce_animations: false,
  low_stimulation_mode: false,
  high_contrast: false,
  sound_enabled: true,
};

const BODY_CLASS_MAP = {
  reduce_animations: 'reduce-motion',
  low_stimulation_mode: 'low-stimulation',
  high_contrast: 'high-contrast',
};

function applyBodyClasses(settings) {
  if (typeof document === 'undefined') return;
  const body = document.body;
  for (const [key, className] of Object.entries(BODY_CLASS_MAP)) {
    body.classList.toggle(className, Boolean(settings[key]));
  }
}

export function SettingsProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [settings, setSettings] = useState(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    if (!isAuthenticated) return Promise.resolve();
    return api
      .getAccessibilitySettings()
      .then((data) => {
        if (data) setSettings({ ...DEFAULTS, ...data });
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      load();
    } else {
      setSettings(DEFAULTS);
      applyBodyClasses(DEFAULTS);
    }
  }, [isAuthenticated, load]);

  useEffect(() => {
    applyBodyClasses(settings);
  }, [settings]);

  const updateSettings = useCallback(async (patch) => {
    const previous = settings;
    setSettings((s) => ({ ...s, ...patch })); // optimistic
    try {
      const data = await api.updateAccessibilitySettings(patch);
      if (data) setSettings({ ...DEFAULTS, ...data });
      return data;
    } catch (err) {
      setSettings(previous); // roll back on failure
      throw err;
    }
  }, [settings]);

  const value = useMemo(
    () => ({ settings, loaded, updateSettings, refreshSettings: load }),
    [settings, loaded, updateSettings, load]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider');
  return ctx;
}
