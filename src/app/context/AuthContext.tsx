import React, { createContext, useContext, useState } from 'react';
import type { User } from '../data/types';
import { isApiEnabled, loginApi } from '../api/client';
import { useApp } from './AppContext';

interface AuthContextValue {
  currentUser: User | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  currentUser: null,
  login: async () => ({ success: false }),
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { users, reload } = useApp();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const currentUser = currentUserId ? users.find((u) => u.id === currentUserId) ?? null : null;

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    if (isApiEnabled()) {
      try {
        const apiUser = await loginApi(email, password);
        // Ensure users list is fresh then set current user
        reload();
        setCurrentUserId(String(apiUser.id));
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
    setCurrentUserId(user.id);
    return { success: true };
  };

  const logout = () => setCurrentUserId(null);

  return (
    <AuthContext.Provider value={{ currentUser, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
