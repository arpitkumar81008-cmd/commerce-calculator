import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// A plain JSON file on disk, not an in-memory array — this is what makes
// customer records and transaction history survive server restarts. We
// deliberately avoid any package that needs native compilation (like
// better-sqlite3) so `npm install` can never fail due to a missing C++
// toolchain on someone's machine; this only depends on Node's built-in fs.
const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, '..', 'data.json');

// ---------- Types ----------

export interface Customer {
  id: string;
  name: string;
  created_at: string;
  // Running balance: positive = customer owes the shop (due), negative =
  // shop owes the customer (credit), zero = fully settled. This is the
  // single source of truth for "how much is outstanding" and is what lets
  // an overpayment on one bill automatically clear (or reduce) due amounts
  // on the next one.
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

export type TransactionType = 'purchase' | 'payment' | 'adjustment';
export type TransactionStatus = 'paid' | 'partial' | 'due';

export interface Transaction {
  id: number;
  customer_id: string;
  type: TransactionType;
  // Bill amounts. Zero for pure 'payment' transactions (a payment isn't a
  // new purchase, it's money applied against an existing balance).
  subtotal: number;
  tax: number;
  total: number;
  // Amount actually received at the time of this transaction.
  paid: number;
  // Running balance immediately before and after this transaction, so the
  // due/credit carried forward is always visible and auditable.
  previous_balance: number;
  balance_after: number;
  due: number; // max(balance_after, 0) — convenience for display
  credit: number; // max(-balance_after, 0) — convenience for display
  status: TransactionStatus;
  note: string | null;
  created_at: string;
  updated_at: string;
  edited: boolean; // true if an admin has corrected this record
}

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

interface Store {
  customers: Record<string, Customer>;
  cartItems: CartItem[];
  transactions: Transaction[];
  transactionItems: TransactionItem[];
  nextCartItemId: number;
  nextTransactionId: number;
  nextTransactionItemId: number;
}

function emptyStore(): Store {
  return {
    customers: {},
    cartItems: [],
    transactions: [],
    transactionItems: [],
    nextCartItemId: 1,
    nextTransactionId: 1,
    nextTransactionItemId: 1,
  };
}

function load(): Store {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<Store>;
    const merged = { ...emptyStore(), ...parsed };
    // Backfill balance for any customer record written before this field
    // existed, so older data files don't crash or silently misbehave.
    for (const id of Object.keys(merged.customers)) {
      if (typeof merged.customers[id].balance !== 'number') {
        merged.customers[id].balance = 0;
      }
    }
    return merged;
  } catch {
    return emptyStore();
  }
}

let store = load();

function save() {
  // Synchronous, atomic-ish write (write to a temp file then rename) so a
  // crash mid-write can't corrupt the main data file.
  const tmpPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), 'utf-8');
  fs.renameSync(tmpPath, DB_PATH);
}

// Persist the initial (possibly freshly-created) store so the file exists
// on disk from the very first run.
save();

// ---------- Helpers ----------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeLine(unitAmount: number, quantity: number, taxRate: number) {
  const subtotal = round2(unitAmount * quantity);
  const tax = round2(subtotal * taxRate);
  const total = round2(subtotal + tax);
  return { tax, total };
}

function statusFor(balanceAfter: number, paidThisTransaction: number): TransactionStatus {
  if (balanceAfter <= 0) return 'paid';
  if (paidThisTransaction > 0) return 'partial';
  return 'due';
}

function generateCandidateId(): string {
  // e.g. CUST-7F3K9Q — short, human-typeable, unambiguous character set
  // (no 0/O/1/I) so customers can read it back over the phone if needed.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += alphabet[crypto.randomInt(alphabet.length)];
  }
  return `CUST-${code}`;
}

// ---------- Customers ----------

export function createCustomer(name: string): Customer {
  let id = generateCandidateId();
  while (store.customers[id]) {
    id = generateCandidateId();
  }
  const created_at = new Date().toISOString();
  const customer: Customer = { id, name, created_at, balance: 0 };
  store.customers[id] = customer;
  save();
  return customer;
}

export function getCustomer(id: string): Customer | undefined {
  return store.customers[id.trim().toUpperCase()];
}

export function listCustomers(query?: string): Customer[] {
  const all = Object.values(store.customers).sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (!query) return all;
  const q = query.trim().toLowerCase();
  return all.filter((c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
}

// ---------- Cart ----------

export function listCart(customerId: string): CartItem[] {
  return store.cartItems
    .filter((item) => item.customer_id === customerId)
    .sort((a, b) => a.id - b.id);
}

function findCartItemByName(customerId: string, name: string): CartItem | undefined {
  const key = name.trim().toLowerCase();
  return store.cartItems.find(
    (item) => item.customer_id === customerId && item.name.trim().toLowerCase() === key
  );
}

export function addOrMergeCartItem(
  customerId: string,
  name: string,
  unitAmount: number,
  taxRate: number,
  quantity: number
): CartItem {
  const existing = findCartItemByName(customerId, name);
  const now = new Date().toISOString();

  if (existing) {
    const newQuantity = existing.quantity + quantity;
    const { tax, total } = computeLine(existing.unit_amount, newQuantity, existing.tax_rate);
    existing.quantity = newQuantity;
    existing.tax = tax;
    existing.total = total;
    existing.updated_at = now;
    save();
    return existing;
  }

  const { tax, total } = computeLine(unitAmount, quantity, taxRate);
  const item: CartItem = {
    id: store.nextCartItemId++,
    customer_id: customerId,
    name,
    unit_amount: unitAmount,
    quantity,
    tax_rate: taxRate,
    tax,
    total,
    created_at: now,
    updated_at: now,
  };
  store.cartItems.push(item);
  save();
  return item;
}

export function setCartItemQuantity(
  customerId: string,
  itemId: number,
  quantity: number
): CartItem | undefined {
  const item = store.cartItems.find((i) => i.id === itemId && i.customer_id === customerId);
  if (!item) return undefined;

  const { tax, total } = computeLine(item.unit_amount, quantity, item.tax_rate);
  item.quantity = quantity;
  item.tax = tax;
  item.total = total;
  item.updated_at = new Date().toISOString();
  save();
  return item;
}

export function removeCartItem(customerId: string, itemId: number): boolean {
  const index = store.cartItems.findIndex(
    (i) => i.id === itemId && i.customer_id === customerId
  );
  if (index === -1) return false;
  store.cartItems.splice(index, 1);
  save();
  return true;
}

export function getCartBill(customerId: string) {
  const items = listCart(customerId);
  const subtotal = round2(items.reduce((sum, i) => sum + i.unit_amount * i.quantity, 0));
  const tax = round2(items.reduce((sum, i) => sum + i.tax, 0));
  const total = round2(items.reduce((sum, i) => sum + i.total, 0));
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  return { subtotal, tax, total, itemCount, lineCount: items.length };
}

// ---------- Balance ----------

export function getBalance(customerId: string) {
  const customer = getCustomer(customerId);
  const balance = customer?.balance ?? 0;
  return {
    balance,
    due: round2(Math.max(balance, 0)),
    credit: round2(Math.max(-balance, 0)),
  };
}

// ---------- Transactions ----------

function attachItems(transaction: Transaction) {
  const items = store.transactionItems
    .filter((i) => i.transaction_id === transaction.id)
    .sort((a, b) => a.id - b.id);
  return { ...transaction, items };
}

export function getTransactionWithItems(customerId: string, transactionId: number) {
  const transaction = store.transactions.find(
    (t) => t.id === transactionId && t.customer_id === customerId
  );
  if (!transaction) return undefined;
  return attachItems(transaction);
}

// Settle the current cart into a permanent "purchase" transaction. Any
// existing due (or credit) is rolled in automatically: paying more than
// this bill's total first clears old dues, and anything left over becomes
// credit that will reduce the total owed on the *next* bill.
export function settleCart(customerId: string, paid: number) {
  const items = listCart(customerId);
  if (items.length === 0) {
    return null;
  }

  const customer = getCustomer(customerId);
  if (!customer) return null;

  const bill = getCartBill(customerId);
  const previousBalance = customer.balance;
  const balanceAfter = round2(previousBalance + bill.total - paid);
  const due = round2(Math.max(balanceAfter, 0));
  const credit = round2(Math.max(-balanceAfter, 0));
  const status = statusFor(balanceAfter, paid);
  const now = new Date().toISOString();

  const transaction: Transaction = {
    id: store.nextTransactionId++,
    customer_id: customerId,
    type: 'purchase',
    subtotal: bill.subtotal,
    tax: bill.tax,
    total: bill.total,
    paid: round2(paid),
    previous_balance: previousBalance,
    balance_after: balanceAfter,
    due,
    credit,
    status,
    note: null,
    created_at: now,
    updated_at: now,
    edited: false,
  };
  store.transactions.push(transaction);

  for (const item of items) {
    const transactionItem: TransactionItem = {
      id: store.nextTransactionItemId++,
      transaction_id: transaction.id,
      name: item.name,
      unit_amount: item.unit_amount,
      quantity: item.quantity,
      tax_rate: item.tax_rate,
      tax: item.tax,
      total: item.total,
    };
    store.transactionItems.push(transactionItem);
  }

  // Clear the cart now that it's been snapshotted into the transaction.
  store.cartItems = store.cartItems.filter((i) => i.customer_id !== customerId);
  customer.balance = balanceAfter;

  save();
  return attachItems(transaction);
}

// Record a standalone payment against the customer's running balance —
// used for "coming back later to pay off a due amount." This always adds
// to what's already been paid rather than overwriting it, because it's a
// brand-new transaction, not an edit of a past one.
export function recordPayment(customerId: string, amount: number, note?: string) {
  const customer = getCustomer(customerId);
  if (!customer) return null;

  const previousBalance = customer.balance;
  const balanceAfter = round2(previousBalance - amount);
  const due = round2(Math.max(balanceAfter, 0));
  const credit = round2(Math.max(-balanceAfter, 0));
  const status = statusFor(balanceAfter, amount);
  const now = new Date().toISOString();

  const transaction: Transaction = {
    id: store.nextTransactionId++,
    customer_id: customerId,
    type: 'payment',
    subtotal: 0,
    tax: 0,
    total: 0,
    paid: round2(amount),
    previous_balance: previousBalance,
    balance_after: balanceAfter,
    due,
    credit,
    status,
    note: note ?? 'Payment recorded',
    created_at: now,
    updated_at: now,
    edited: false,
  };
  store.transactions.push(transaction);
  customer.balance = balanceAfter;

  save();
  return attachItems(transaction);
}

export function listTransactions(customerId: string) {
  return store.transactions
    .filter((t) => t.customer_id === customerId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)
    .map(attachItems);
}

// ---------- Admin ----------

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin123';

export function checkAdminPassword(password: string): boolean {
  return password === ADMIN_PASSWORD;
}

export function listAllTransactions() {
  return store.transactions
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)
    .map((t) => ({
      ...attachItems(t),
      customer_name: store.customers[t.customer_id]?.name ?? '(deleted customer)',
    }));
}

export function getAdminStats() {
  const customers = Object.values(store.customers);
  const purchases = store.transactions.filter((t) => t.type === 'purchase');
  const totalRevenue = round2(purchases.reduce((sum, t) => sum + t.total, 0));
  const totalCollected = round2(store.transactions.reduce((sum, t) => sum + t.paid, 0));
  const totalOutstandingDue = round2(
    customers.reduce((sum, c) => sum + Math.max(c.balance, 0), 0)
  );
  const totalOutstandingCredit = round2(
    customers.reduce((sum, c) => sum + Math.max(-c.balance, 0), 0)
  );

  return {
    totalCustomers: customers.length,
    totalTransactions: store.transactions.length,
    totalRevenue,
    totalCollected,
    totalOutstandingDue,
    totalOutstandingCredit,
  };
}

// Replays every transaction for a customer in chronological order,
// recalculating previous_balance/balance_after/due/credit/status for each
// one. This is what keeps the ledger consistent after an admin edits or
// deletes a past transaction — every later record (and the customer's
// current balance) is recomputed from that point forward.
function recomputeCustomerBalances(customerId: string) {
  const customer = getCustomer(customerId);
  if (!customer) return;

  const txs = store.transactions
    .filter((t) => t.customer_id === customerId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);

  let running = 0;
  for (const t of txs) {
    t.previous_balance = running;
    const delta = t.type === 'payment' ? -t.paid : t.total - t.paid;
    running = round2(running + delta);
    t.balance_after = running;
    t.due = round2(Math.max(running, 0));
    t.credit = round2(Math.max(-running, 0));
    t.status = statusFor(running, t.paid);
  }

  customer.balance = running;
}

export interface AdminTransactionEdit {
  subtotal?: number;
  tax?: number;
  total?: number;
  paid?: number;
  note?: string;
}

export function adminUpdateTransaction(transactionId: number, edits: AdminTransactionEdit) {
  const transaction = store.transactions.find((t) => t.id === transactionId);
  if (!transaction) return undefined;

  if (edits.subtotal !== undefined) transaction.subtotal = round2(edits.subtotal);
  if (edits.tax !== undefined) transaction.tax = round2(edits.tax);
  if (edits.total !== undefined) transaction.total = round2(edits.total);
  if (edits.paid !== undefined) transaction.paid = round2(edits.paid);
  if (edits.note !== undefined) transaction.note = edits.note;
  transaction.edited = true;
  transaction.updated_at = new Date().toISOString();

  recomputeCustomerBalances(transaction.customer_id);
  save();

  return attachItems(transaction);
}

export function adminDeleteTransaction(transactionId: number): boolean {
  const index = store.transactions.findIndex((t) => t.id === transactionId);
  if (index === -1) return false;

  const [removed] = store.transactions.splice(index, 1);
  store.transactionItems = store.transactionItems.filter(
    (i) => i.transaction_id !== transactionId
  );

  recomputeCustomerBalances(removed.customer_id);
  save();
  return true;
}
