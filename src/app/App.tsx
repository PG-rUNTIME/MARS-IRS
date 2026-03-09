import { useMemo, useRef } from 'react';
import { RouterProvider } from 'react-router';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import { LoginPage } from './components/LoginPage';
import { createAppRouter } from './routes';

function AppInner() {
  const { currentUser, logout } = useAuth();
  // Track whether user has ever been logged in this session.
  // Once true, never go back to LoginPage due to a transient null currentUser.
  const everLoggedIn = useRef(false);
  if (currentUser) everLoggedIn.current = true;

  // Wire up logout on the stable router by keeping a ref to latest logout fn
  const logoutRef = useRef(logout);
  logoutRef.current = logout;

  // Stable router whose logout callback always calls the latest logout fn
  const router = useMemo(() => createAppRouter(() => logoutRef.current()), []);

  if (!currentUser && !everLoggedIn.current) {
    return <LoginPage onLogin={() => {}} />;
  }

  if (!currentUser && everLoggedIn.current) {
    // User explicitly logged out — reset and show login
    everLoggedIn.current = false;
    return <LoginPage onLogin={() => {}} />;
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