// Calls go through /api on whatever origin the page was loaded from. In dev,
// Vite proxies /api/* to the backend on port 3001 (see vite.config.ts), so
// only one URL/tunnel needs to be shared for the whole app to work.
const API_BASE = `${window.location.origin}/api`;

export interface Customer {
  id: string;
  name: string;
  created_at: string;
  // Running balance: positive = customer owes the shop (due), negative =
  // shop owes the customer (credit).
  balance: number;
}

export interface CartItem {
  id: number;
  customer_id: string;
  name: string;
  unit_amount: number;
  quantity: number;
  tax_rate: number;
  tax: number;
  total: number;
  created_at: string;
  updated_at: string;
}

// Current cart totals plus the customer's running balance, merged together
// (mirrors what GET /customers/:id/bill returns).
export interface Bill {
  subtotal: number;
  tax: number;
  total: number;
  itemCount: number;
  lineCount: number;
  balance: number;
  due: number;
  credit: number;
}

export interface Balance {
  balance: number;
  due: number;
  credit: number;
}

export type TransactionType = 'purchase' | 'payment' | 'adjustment';
export type TransactionStatus = 'paid' | 'partial' | 'due';

export interface TransactionItem {
  id: number;
  transaction_id: number;
  name: string;
  unit_amount: number;
  quantity: number;
  tax_rate: number;
  tax: number;
  total: number;
}

export interface Transaction {
  id: number;
  customer_id: string;
  type: TransactionType;
  subtotal: number;
  tax: number;
  total: number;
  paid: number;
  previous_balance: number;
  balance_after: number;
  due: number;
  credit: number;
  status: TransactionStatus;
  note: string | null;
  created_at: string;
  updated_at: string;
  edited: boolean;
  items: TransactionItem[];
}

export interface AdminTransaction extends Transaction {
  customer_name: string;
}

export interface AdminStats {
  totalCustomers: number;
  totalTransactions: number;
  totalRevenue: number;
  totalCollected: number;
  totalOutstandingDue: number;
  totalOutstandingCredit: number;
}

async function parseOrThrow(response: Response) {
  if (response.status === 204) return null;
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${response.status})`);
  }
  return response.json();
}

export const api = {
  // ---- Customers ----
  createCustomer: (name: string): Promise<{ customer: Customer }> =>
    fetch(`${API_BASE}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }).then(parseOrThrow),

  getCustomer: (id: string): Promise<{ customer: Customer }> =>
    fetch(`${API_BASE}/customers/${encodeURIComponent(id)}`).then(parseOrThrow),

  // ---- Cart ----
  getCart: (customerId: string): Promise<CartItem[]> =>
    fetch(`${API_BASE}/customers/${encodeURIComponent(customerId)}/cart`).then(parseOrThrow),

  getBill: (customerId: string): Promise<Bill> =>
    fetch(`${API_BASE}/customers/${encodeURIComponent(customerId)}/bill`).then(parseOrThrow),

  getBalance: (customerId: string): Promise<Balance> =>
    fetch(`${API_BASE}/customers/${encodeURIComponent(customerId)}/balance`).then(parseOrThrow),

  addToCart: (
    customerId: string,
    payload: { name: string; amount: number; taxRate: number; quantity?: number }
  ): Promise<{ message: string; item: CartItem }> =>
    fetch(`${API_BASE}/customers/${encodeURIComponent(customerId)}/cart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(parseOrThrow),

  setCartItemQuantity: (
    customerId: string,
    itemId: number,
    quantity: number
  ): Promise<{ item: CartItem }> =>
    fetch(`${API_BASE}/customers/${encodeURIComponent(customerId)}/cart/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity }),
    }).then(parseOrThrow),

  removeCartItem: (customerId: string, itemId: number): Promise<null> =>
    fetch(`${API_BASE}/customers/${encodeURIComponent(customerId)}/cart/${itemId}`, {
      method: 'DELETE',
    }).then(parseOrThrow),

  // ---- Transactions ----
  settle: (customerId: string, paid: number): Promise<{ transaction: Transaction }> =>
    fetch(`${API_BASE}/customers/${encodeURIComponent(customerId)}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paid }),
    }).then(parseOrThrow),

  getTransactions: (customerId: string): Promise<Transaction[]> =>
    fetch(`${API_BASE}/customers/${encodeURIComponent(customerId)}/transactions`).then(parseOrThrow),

  // Records a brand-new payment against the customer's running balance.
  // This always ADDS to what's already been paid — it can never overwrite
  // or erase a previous payment, because each payment is its own
  // transaction rather than an edit of an old one.
  recordPayment: (customerId: string, amount: number): Promise<{ transaction: Transaction }> =>
    fetch(`${API_BASE}/customers/${encodeURIComponent(customerId)}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }),
    }).then(parseOrThrow),
};

// ---------- Admin ----------
// Every admin call sends the password as a header; the backend checks it on
// every request (no session/token to manage).

function adminHeaders(password: string) {
  return { 'Content-Type': 'application/json', 'x-admin-password': password };
}

export const adminApi = {
  login: (password: string): Promise<{ ok: true }> =>
    fetch(`${API_BASE}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    }).then(parseOrThrow),

  getStats: (password: string): Promise<AdminStats> =>
    fetch(`${API_BASE}/admin/stats`, { headers: adminHeaders(password) }).then(parseOrThrow),

  getCustomers: (password: string, query?: string): Promise<Customer[]> =>
    fetch(`${API_BASE}/admin/customers${query ? `?q=${encodeURIComponent(query)}` : ''}`, {
      headers: adminHeaders(password),
    }).then(parseOrThrow),

  getCustomerTransactions: (password: string, customerId: string): Promise<Transaction[]> =>
    fetch(`${API_BASE}/admin/customers/${encodeURIComponent(customerId)}/transactions`, {
      headers: adminHeaders(password),
    }).then(parseOrThrow),

  getAllTransactions: (password: string): Promise<AdminTransaction[]> =>
    fetch(`${API_BASE}/admin/transactions`, { headers: adminHeaders(password) }).then(parseOrThrow),

  updateTransaction: (
    password: string,
    transactionId: number,
    edits: Partial<{ subtotal: number; tax: number; total: number; paid: number; note: string }>
  ): Promise<{ transaction: Transaction }> =>
    fetch(`${API_BASE}/admin/transactions/${transactionId}`, {
      method: 'PATCH',
      headers: adminHeaders(password),
      body: JSON.stringify(edits),
    }).then(parseOrThrow),

  deleteTransaction: (password: string, transactionId: number): Promise<null> =>
    fetch(`${API_BASE}/admin/transactions/${transactionId}`, {
      method: 'DELETE',
      headers: adminHeaders(password),
    }).then(parseOrThrow),
};

export interface GstSlab {
  label: string;
  value: number;
}

// Common Indian GST slabs. Value is stored as a decimal (0.18 = 18%).
export const GST_SLABS: GstSlab[] = [
  { label: '0% — Exempt', value: 0 },
  { label: '0.25% — Rough precious stones', value: 0.0025 },
  { label: '3% — Gold, silver, jewellery', value: 0.03 },
  { label: '5% — Essentials', value: 0.05 },
  { label: '12% — Standard (lower)', value: 0.12 },
  { label: '18% — Standard', value: 0.18 },
  { label: '28% — Luxury / sin goods', value: 0.28 },
];

export function formatINR(amount: number): string {
  return `₹${amount.toFixed(2)}`;
}
