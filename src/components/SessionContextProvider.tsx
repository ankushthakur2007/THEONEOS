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

  const checkProfileAndRedirect = async (currentSession: Session | null) => {
    if (currentSession) {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', currentSession.user.id)
        .single();

      if (error || !profile || !profile.first_name || !profile.last_name) {
        // Profile incomplete, redirect to complete profile page
        if (window.location.pathname !== '/complete-profile') {
          navigate('/complete-profile', { replace: true });
        }
      } else {
        // Profile complete, redirect to home if on login/index/complete-profile
        if (window.location.pathname === '/login' || window.location.pathname === '/' || window.location.pathname === '/complete-profile') {
          navigate('/home', { replace: true });
        }
      }
    } else {
      // No session, redirect to login
      if (window.location.pathname !== '/login') {
        navigate('/login', { replace: true });
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      checkProfileAndRedirect(currentSession);
    });

    // Initial session check
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      checkProfileAndRedirect(initialSession);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]); // Only navigate is a dependency here, checkProfileAndRedirect is stable

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