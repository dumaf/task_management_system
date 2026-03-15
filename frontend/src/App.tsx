import { useState, useEffect } from 'react';
import Auth from './components/Auth';
import KanbanBoard from './components/KanbanBoard';

export default function App() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    // Check local storage for an existing token on mount
    const savedToken = localStorage.getItem('token');
    if (savedToken) {
      setToken(savedToken);
    }
  }, []);

  const handleLogin = (newToken: string) => {
    setToken(newToken);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
  };

  // If there is no token, show the Login/Signup page
  if (!token) {
    return <Auth onLogin={handleLogin} />;
  }

  // Otherwise, show the Kanban Board
  return <KanbanBoard onLogout={handleLogout} />;
}
