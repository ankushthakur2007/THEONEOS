import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useSession } from '@/components/SessionContextProvider';

const ProtectedRoute: React.FC = () => {
  const { session } = useSession();

  return session ? <Outlet /> : <Navigate to="/login" replace />;
};

export default ProtectedRoute;