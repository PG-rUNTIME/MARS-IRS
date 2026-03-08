import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User } from '../data/types';
import { isApiEnabled, loginApi } from '../api/client';
import { useApp } from './AppContext';

interface AuthContextValue {
  currentUser: User | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const SESSION_KEY = 'mars_irs_user_id';

const AuthContext = createContext<AuthContextValue>({
  currentUser: null,
  login: async () => ({ success: false }),
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { users, reload } = useApp();
  const [currentUserId, setCurrentUserId] = useState<string | null>(
    () => sessionStorage.getItem(SESSION_KEY)
  );

  // Re-resolve user whenever the users list changes (e.g. after reload())
  const currentUser = currentUserId ? users.find((u) => u.id === currentUserId) ?? null : null;

  // If we have a stored session id but the users list hasn't loaded yet,
  // trigger a reload so we can resolve the user.
  useEffect(() => {
    if (currentUserId && users.length === 0 && isApiEnabled()) {
      reload();
    }
  }, [currentUserId, users.length, reload]);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    if (isApiEnabled()) {
      try {
        const apiUser = await loginApi(email, password);
        const id = String(apiUser.id);
        // Set session before reload so the useEffect doesn't race
        sessionStorage.setItem(SESSION_KEY, id);
        setCurrentUserId(id);
        // Reload all app data in the background — currentUser will resolve
        // automatically once users state updates
        reload();
        return { success: true };
      } catch (e: any) {
        return { success: false, error: e.message || 'Invalid email or password.' };
      }
    }
    // Fallback: local lookup (no API configured)
    const user = users.find(
      (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
    );
    if (!user) return { success: false, error: 'Invalid email or password.' };
    if (!user.active) return { success: false, error: 'Your account has been deactivated. Please contact the administrator.' };
    sessionStorage.setItem(SESSION_KEY, user.id);
    setCurrentUserId(user.id);
    return { success: true };
  };

  const logout = () => {
    sessionStorage.removeItem(SESSION_KEY);
    setCurrentUserId(null);
  };

  return (
    <AuthContext.Provider value={{ currentUser, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
