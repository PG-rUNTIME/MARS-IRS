import { useState, useMemo, useCallback } from 'react';
import { RouterProvider } from 'react-router';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import { LoginPage } from './components/LoginPage';
import { createAppRouter } from './routes';

function AppInner() {
  const { currentUser, logout } = useAuth();
  const [loggedIn, setLoggedIn] = useState(!!currentUser);

  const handleLogin = useCallback(() => setLoggedIn(true), []);

  const handleLogout = useCallback(() => {
    logout();
    setLoggedIn(false);
  }, [logout]);

  const router = useMemo(() => createAppRouter(handleLogout), [handleLogout]);

  if (!loggedIn || !currentUser) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return <RouterProvider router={router} />;
}

export default function App() {
  return (
    <AppProvider>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </AppProvider>
  );
}