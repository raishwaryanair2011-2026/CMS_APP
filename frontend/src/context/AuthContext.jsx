import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../api/services';
import toast from 'react-hot-toast';

const AuthContext = createContext(null);

// Decode JWT payload without any library
function decodeJwtPayload(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

// Returns true if the token's exp is in the past
function isTokenExpired(token) {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true;
  return payload.exp * 1000 < Date.now();
}

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const access = sessionStorage.getItem('access_token');

    // No access token — not logged in
    if (!access) {
      setLoading(false);
      return;
    }

    // Access token expired — try refreshing via httpOnly cookie
    // The axios interceptor in axios.js will handle this automatically
    // when authAPI.me() gets a 401, so we just call me() directly
    if (isTokenExpired(access)) {
      // Remove stale access token; interceptor will get a fresh one
      sessionStorage.removeItem('access_token');
    }

    // Verify session with backend — if access token is stale the
    // axios interceptor will transparently refresh it using the cookie
    authAPI.me()
      .then(({ data }) => setUser(data.data))
      .catch(() => {
        // Both tokens expired or invalid — clear and go to home
        sessionStorage.removeItem('access_token');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username, password) => {
    const { data } = await authAPI.login({ username, password });

    // Only store the access token — refresh token is in the httpOnly cookie
    // set by the backend and never touches JS
    sessionStorage.setItem('access_token', data.data.access);

    setUser(data.data.user);
    return data.data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      // POST to logout — backend will blacklist the refresh cookie and clear it
      await authAPI.logout();
    } catch (_) {
      // Even if the request fails, clear the local session
    } finally {
      sessionStorage.removeItem('access_token');
      setUser(null);
      toast.success('Logged out successfully.');
    }
  }, []);

  const value = { user, loading, login, logout, isAuthenticated: !!user };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}