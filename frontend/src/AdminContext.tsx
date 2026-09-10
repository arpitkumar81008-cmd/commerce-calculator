import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

const STORAGE_KEY = 'commerce-calculator:admin-password';

interface AdminContextValue {
  password: string | null;
  setPassword: (password: string) => void;
  logout: () => void;
}

const AdminContext = createContext<AdminContextValue | undefined>(undefined);

export function AdminProvider({ children }: { children: ReactNode }) {
  // sessionStorage (not localStorage) so an admin session doesn't silently
  // persist forever on a shared computer — it clears when the tab/browser closes.
  const [password, setPasswordState] = useState<string | null>(() =>
    sessionStorage.getItem(STORAGE_KEY)
  );

  useEffect(() => {
    if (password) {
      sessionStorage.setItem(STORAGE_KEY, password);
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }, [password]);

  const value = useMemo<AdminContextValue>(
    () => ({
      password,
      setPassword: (p: string) => setPasswordState(p),
      logout: () => setPasswordState(null),
    }),
    [password]
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) {
    throw new Error('useAdmin must be used within an AdminProvider');
  }
  return ctx;
}
