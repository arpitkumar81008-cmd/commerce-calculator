import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useCustomer } from '../CustomerContext';

function RequireCustomer({ children }: { children: ReactNode }) {
  const { customer } = useCustomer();
  if (!customer) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export default RequireCustomer;
