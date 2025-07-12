import React, { useState, useEffect, createContext, useContext } from 'react';
import { Session, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

interface SessionContextType {
  session: Session | null;
  supabase: SupabaseClient;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const SessionContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      if (currentSession) {
        // User is authenticated, redirect to home if not already there
        if (window.location.pathname === '/login' || window.location.pathname === '/') {
          navigate('/home', { replace: true });
        }
      } else {
        // User is not authenticated, redirect to login if not already there
        if (window.location.pathname !== '/login') {
          navigate('/login', { replace: true });
        }
      }
      setLoading(false);
    });

    // Initial session check
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      if (initialSession) {
        if (window.location.pathname === '/login' || window.location.pathname === '/') {
          navigate('/home', { replace: true });
        }
      } else {
        if (window.location.pathname !== '/login') {
          navigate('/login', { replace: true });
        }
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <p className="text-xl text-gray-600 dark:text-gray-400">Loading application...</p>
      </div>
    );
  }

  return (
    <SessionContext.Provider value={{ session, supabase }}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionContextProvider');
  }
  return context;
};