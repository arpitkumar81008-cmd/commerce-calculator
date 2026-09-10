import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Customer } from './api';

const STORAGE_KEY = 'commerce-calculator:customer';

interface CustomerContextValue {
  customer: Customer | null;
  setCustomer: (customer: Customer) => void;
  logout: () => void;
}

const CustomerContext = createContext<CustomerContextValue | undefined>(undefined);

export function CustomerProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomerState] = useState<Customer | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Customer) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (customer) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(customer));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [customer]);

  const value = useMemo<CustomerContextValue>(
    () => ({
      customer,
      setCustomer: (c: Customer) => setCustomerState(c),
      logout: () => setCustomerState(null),
    }),
    [customer]
  );

  return <CustomerContext.Provider value={value}>{children}</CustomerContext.Provider>;
}

export function useCustomer(): CustomerContextValue {
  const ctx = useContext(CustomerContext);
  if (!ctx) {
    throw new Error('useCustomer must be used within a CustomerProvider');
  }
  return ctx;
}
