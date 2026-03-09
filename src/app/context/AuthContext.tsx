import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User, UserRole } from '../data/types';
import { isApiEnabled, loginApi, type ApiUser } from '../api/client';
import { useApp } from './AppContext';

function apiUserToUser(u: ApiUser): User {
  return {
    id: String(u.id),
    name: u.name,
    email: u.email,
    password: '',
    roles: u.roles as UserRole[],
    department: u.department,
    active: u.active,
    joinedDate: u.joined_date || '',
    phone: u.phone || '',
    avatar: u.avatar || '',
    mustChangePassword: u.must_change_password,
    passwordChangedAt: u.password_changed_at || undefined,
  };
}

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
  // Store the full user object in state so it NEVER becomes null due to
  // transient re-renders (e.g. file picker opening causes context re-render).
  // It only becomes null on explicit logout.
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Sync currentUser whenever users list updates — but only update, never clear,
  // unless there is no session.
  useEffect(() => {
    if (!currentUserId) {
      setCurrentUser(null);
      return;
    }
    const found = users.find((u) => u.id === currentUserId);
    if (found) setCurrentUser(found);
    // If not found yet (users still loading), keep existing currentUser value
  }, [currentUserId, users]);

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
        sessionStorage.setItem(SESSION_KEY, id);
        setCurrentUserId(id);
        setCurrentUser(apiUserToUser(apiUser)); // set immediately so UI transitions without waiting for reload()
        reload();
        return { success: true };
      } catch (e: any) {
        return { success: false, error: e.message || 'Invalid email or password.' };
      }
    }
    return { success: false, error: 'API not available. Please try again.' };
  };

  const logout = () => {
    sessionStorage.removeItem(SESSION_KEY);
    setCurrentUserId(null);
    setCurrentUser(null);
  };

  return (
    <AuthContext.Provider value={{ currentUser, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
