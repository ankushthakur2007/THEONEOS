import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/components/SessionContextProvider';

const Index: React.FC = () => {
  const navigate = useNavigate();
  const { session } = useSession(); // Use the session from context

  useEffect(() => {
    // SessionContextProvider already handles initial redirects and auth state changes.
    // This page can simply act as a loading screen or initial entry point.
    // If session is already known, redirect immediately.
    if (session) {
      navigate('/home', { replace: true });
    } else {
      navigate('/login', { replace: true });
    }
  }, [session, navigate]); // Depend on session to trigger redirect

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
      <p className="text-xl text-gray-600 dark:text-gray-400">Loading application...</p>
    </div>
  );
};

export default Index;