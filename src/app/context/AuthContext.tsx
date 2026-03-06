import React, { createContext, useContext, useState } from 'react';
import type { User } from '../data/types';
import { useApp } from './AppContext';

interface AuthContextValue {
  currentUser: User | null;
  login: (email: string, password: string) => { success: boolean; error?: string };
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  currentUser: null,
  login: () => ({ success: false }),
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { users } = useApp();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const currentUser = currentUserId ? users.find((u) => u.id === currentUserId) ?? null : null;

  const login = (email: string, password: string) => {
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
