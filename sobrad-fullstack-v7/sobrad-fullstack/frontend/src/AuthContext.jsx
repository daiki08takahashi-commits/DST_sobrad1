import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as api from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => api.getToken());
  const [username, setUsername] = useState(() => api.getUsername());
  // Profile photo (a "data:image/...;base64,..." URI, or null) -- unlike
  // token/username this is never persisted to localStorage (it can be up to
  // ~5MB, and setSession/getUsername already only round-trip small strings),
  // so it starts null on every fresh page load and is (re)hydrated below by
  // fetching the current user whenever `token` changes. This is the single
  // source of truth for the photo app-wide (Home's topbar avatar, the
  // Sidebar account block, and Profile.jsx's own photo section all read it
  // from here) so an upload/removal on Profile shows up everywhere at once
  // instead of each consumer holding its own stale copy.
  const [profilePhoto, setProfilePhoto] = useState(null);
  // Same story as profilePhoto above -- not persisted, (re)hydrated from
  // GET /api/auth/me below. Used as an alternate login identifier (see
  // Login.jsx) and set/changed from Settings.jsx's EmailSection.
  const [email, setEmail] = useState(null);

  const signIn = useCallback((nextToken, nextUsername) => {
    api.setSession(nextToken, nextUsername);
    setToken(nextToken);
    setUsername(nextUsername);
  }, []);

  const signOut = useCallback(() => {
    api.clearSession();
    setToken(null);
    setUsername(null);
    setProfilePhoto(null);
    setEmail(null);
  }, []);

  // Applies a fresh UserOut-shaped object (from GET /api/auth/me, or
  // returned directly by an upload/delete-photo call) to context state, in
  // one round trip -- no separate fetch needed after Profile.jsx uploads or
  // removes a photo.
  const applyUser = useCallback((user) => {
    if (!user) return;
    if (user.username) setUsername(user.username);
    setProfilePhoto(user.profile_photo_data_url || null);
    setEmail(user.email || null);
  }, []);

  const refreshUser = useCallback(async () => {
    const user = await api.getMe();
    applyUser(user);
    return user;
  }, [applyUser]);

  // (Re)hydrate the profile photo whenever there's a token to hydrate it
  // with -- covers first load of an already-signed-in session, and every
  // sign-in/register/reset (all of which change `token`). Failures are
  // swallowed: a stale/invalid token is already handled by whichever
  // authenticated call surfaces the 401, this is just best-effort priming.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api
      .getMe()
      .then((user) => {
        if (!cancelled) applyUser(user);
      })
      .catch(() => {
        // ignore -- see comment above
      });
    return () => {
      cancelled = true;
    };
  }, [token, applyUser]);

  const value = useMemo(
    () => ({
      token,
      username,
      profilePhoto,
      email,
      isAuthenticated: Boolean(token),
      signIn,
      signOut,
      applyUser,
      refreshUser,
    }),
    [token, username, profilePhoto, email, signIn, signOut, applyUser, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
