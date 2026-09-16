import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import * as api from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => api.getToken());
  const [username, setUsername] = useState(() => api.getUsername());

  const signIn = useCallback((nextToken, nextUsername) => {
    api.setSession(nextToken, nextUsername);
    setToken(nextToken);
    setUsername(nextUsername);
  }, []);

  const signOut = useCallback(() => {
    api.clearSession();
    setToken(null);
    setUsername(null);
  }, []);

  const value = useMemo(
    () => ({
      token,
      username,
      isAuthenticated: Boolean(token),
      signIn,
      signOut,
    }),
    [token, username, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
