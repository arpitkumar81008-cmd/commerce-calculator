import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { adminApi, formatINR } from '../api';
import type { AdminStats, AdminTransaction, Customer, Transaction } from '../api';
import { useAdmin } from '../AdminContext';

function AdminLogin() {
  const [passwordInput, setPasswordInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { setPassword } = useAdmin();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await adminApi.login(passwordInput);
      setPassword(passwordInput);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page identity-page">
      <div className="identity-card">
        <p className="eyebrow">Restricted</p>
        <h1 className="identity-title">Admin Login</h1>
        <form onSubmit={handleSubmit} className="identity-form">
          <label>
            <span>Password</span>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              autoFocus
            />
          </label>
          <div className="identity-actions">
            <button type="submit" className="primary-button" disabled={loading}>
              {loading ? 'Checking…' : 'Log in'}
            </button>
          </div>
        </form>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}

function statusLabel(status: string): string {
  if (status === 'paid') return 'Paid';
  if (status === 'partial') return 'Partially paid';
  return 'Due';
}

function balanceLabel(balance: number): string {
  if (balance > 0) return `${formatINR(balance)} due`;
  if (balance < 0) return `${formatINR(-balance)} credit`;
  return 'Settled';
}

interface EditDraft {
  subtotal: string;
  tax: string;
  total: string;
  paid: string;
  note: string;
}

function TransactionRow({
  tx,
  showCustomer,
  onEdited,
  onDeleted,
}: {
  tx: AdminTransaction | Transaction;
  showCustomer: boolean;
  onEdited: () => void;
  onDeleted: () => void;
}) {
  const { password, logout } = useAdmin();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditDraft>({
    subtotal: String(tx.subtotal),
    tax: String(tx.tax),
    total: String(tx.total),
    paid: String(tx.paid),
    note: tx.note ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const withAuth = async <T,>(fn: (pw: string) => Promise<T>): Promise<T | undefined> => {
    if (!password) return undefined;
    try {
      return await fn(password);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Request failed.';
      if (message.toLowerCase().includes('invalid admin password')) {
        logout();
      }
      setError(message);
      return undefined;
    }
  };

  const handleSave = async () => {
    setError(null);
    const parsed: Record<string, number | string> = {};
    for (const key of ['subtotal', 'tax', 'total', 'paid'] as const) {
      const n = Number(draft[key]);
      if (!Number.isFinite(n) || n < 0) {
        setError(`${key} must be a non-negative number.`);
        return;
      }
      parsed[key] = n;
    }
    parsed.note = draft.note;

    setBusy(true);
    const result = await withAuth((pw) => adminApi.updateTransaction(pw, tx.id, parsed));
    setBusy(false);
    if (result) {
      setEditing(false);
      onEdited();
    }
  };

  const handleDelete = async () => {
    const confirmed = window.confirm('Permanently delete this transaction? This cannot be undone.');
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    const result = await withAuth((pw) => adminApi.deleteTransaction(pw, tx.id));
    setBusy(false);
    if (result !== undefined) {
      onDeleted();
    }
  };

  const customerLabel =
    showCustomer && 'customer_name' in tx ? `${tx.customer_name} (${tx.customer_id})` : null;

  return (
    <div className="transaction-card">
      <div className="transaction-card-header">
        <div>
          <p className="transaction-date">
            {new Date(tx.created_at).toLocaleDateString(undefined, {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}{' '}
            · {new Date(tx.created_at).toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit',
            })}
            {customerLabel && <> · {customerLabel}</>}
            {tx.edited && <span className="edited-tag"> · corrected</span>}
          </p>
          <p className="transaction-items-summary">
            {tx.type === 'purchase'
              ? tx.items.map((i) => `${i.name} ×${i.quantity}`).join(', ') || 'Purchase'
              : tx.note ?? 'Payment recorded'}
          </p>
        </div>
        <span className={`status-badge status-${tx.status}`}>{statusLabel(tx.status)}</span>
      </div>

      {editing ? (
        <div className="admin-edit-grid">
          {(['subtotal', 'tax', 'total', 'paid'] as const).map((field) => (
            <label key={field}>
              <span>{field}</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={draft[field]}
                onChange={(e) => setDraft((prev) => ({ ...prev, [field]: e.target.value }))}
              />
            </label>
          ))}
          <label className="admin-edit-note">
            <span>Correction note (optional)</span>
            <input
              type="text"
              value={draft.note}
              onChange={(e) => setDraft((prev) => ({ ...prev, note: e.target.value }))}
              placeholder="e.g. Fixed a pricing typo"
            />
          </label>
          <div className="admin-edit-actions">
            <button type="button" className="primary-button" onClick={handleSave} disabled={busy}>
              Save
            </button>
            <button type="button" className="text-button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      ) : (
        <>
          <div className="transaction-amounts">
            <div>
              <span className="amount-label">Bill total</span>
              <span className="amount-value">{formatINR(tx.total)}</span>
            </div>
            <div>
              <span className="amount-label">Paid</span>
              <span className="amount-value">{formatINR(tx.paid)}</span>
            </div>
            <div>
              <span className="amount-label">{tx.balance_after >= 0 ? 'Due after' : 'Credit after'}</span>
              <span className={`amount-value ${tx.balance_after > 0 ? 'amount-due' : ''}`}>
                {formatINR(Math.abs(tx.balance_after))}
              </span>
            </div>
          </div>
          <div className="admin-edit-actions">
            <button type="button" className="increment-button" onClick={() => setEditing(true)}>
              Fix this transaction
            </button>
            <button type="button" className="remove-button" onClick={handleDelete} disabled={busy}>
              Delete
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </>
      )}
    </div>
  );
}

function AdminDashboard() {
  const { password, logout } = useAdmin();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedTransactions, setSelectedTransactions] = useState<Transaction[]>([]);
  const [allTransactions, setAllTransactions] = useState<AdminTransaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  const withAuth = async <T,>(fn: (pw: string) => Promise<T>): Promise<T | undefined> => {
    if (!password) return undefined;
    try {
      return await fn(password);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Request failed.';
      if (message.toLowerCase().includes('invalid admin password')) {
        logout();
      }
      setError(message);
      return undefined;
    }
  };

  const refreshOverview = () => {
    withAuth((pw) => adminApi.getStats(pw)).then((s) => s && setStats(s));
    withAuth((pw) => adminApi.getAllTransactions(pw)).then((t) => t && setAllTransactions(t));
    withAuth((pw) => adminApi.getCustomers(pw)).then((c) => c && setCustomers(c));
  };

  useEffect(() => {
    refreshOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [password]);

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSelectedCustomer(null);
    const results = await withAuth((pw) => adminApi.getCustomers(pw, search.trim() || undefined));
    if (results) setCustomers(results);
  };

  const handleViewCustomer = async (customer: Customer) => {
    setError(null);
    setSelectedCustomer(customer);
    const txs = await withAuth((pw) => adminApi.getCustomerTransactions(pw, customer.id));
    if (txs) setSelectedTransactions(txs);
  };

  return (
    <div className="page">
      <header className="masthead">
        <div>
          <p className="eyebrow">Restricted</p>
          <h1>Admin Dashboard</h1>
        </div>
        <div className="masthead-actions">
          <button type="button" className="text-button" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      {stats && (
        <section className="admin-stats-grid">
          <div className="admin-stat-card">
            <span className="amount-label">Customers</span>
            <span className="admin-stat-value">{stats.totalCustomers}</span>
          </div>
          <div className="admin-stat-card">
            <span className="amount-label">Transactions</span>
            <span className="admin-stat-value">{stats.totalTransactions}</span>
          </div>
          <div className="admin-stat-card">
            <span className="amount-label">Total billed</span>
            <span className="admin-stat-value">{formatINR(stats.totalRevenue)}</span>
          </div>
          <div className="admin-stat-card">
            <span className="amount-label">Total collected</span>
            <span className="admin-stat-value">{formatINR(stats.totalCollected)}</span>
          </div>
          <div className="admin-stat-card">
            <span className="amount-label">Outstanding due</span>
            <span className="admin-stat-value admin-stat-due">
              {formatINR(stats.totalOutstandingDue)}
            </span>
          </div>
          <div className="admin-stat-card">
            <span className="amount-label">Credit owed to customers</span>
            <span className="admin-stat-value admin-stat-credit">
              {formatINR(stats.totalOutstandingCredit)}
            </span>
          </div>
        </section>
      )}

      <section className="ledger">
        <div className="ledger-heading">
          <h2>Find a customer</h2>
        </div>
        <form onSubmit={handleSearch} className="admin-search-form">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or ID (leave blank to list everyone)"
          />
          <button type="submit" className="primary-button">
            Search
          </button>
        </form>

        {customers.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>ID</th>
                  <th>Created</th>
                  <th>Balance</th>
                  <th aria-hidden="true"></th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id}>
                    <td className="cell-name">{c.name}</td>
                    <td className="cell-num customer-id-cell">{c.id}</td>
                    <td className="cell-num">
                      {new Date(c.created_at).toLocaleDateString(undefined, {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td
                      className={`cell-num ${c.balance > 0 ? 'amount-due' : ''}`}
                    >
                      {balanceLabel(c.balance)}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="increment-button"
                        onClick={() => handleViewCustomer(c)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selectedCustomer && (
          <div className="admin-customer-detail">
            <div className="transaction-card-header">
              <div>
                <p className="transaction-date">{selectedCustomer.id}</p>
                <p className="transaction-items-summary">{selectedCustomer.name}</p>
              </div>
              <span className={selectedCustomer.balance > 0 ? 'amount-due' : ''}>
                {balanceLabel(selectedCustomer.balance)}
              </span>
            </div>

            {selectedTransactions.length === 0 ? (
              <p className="empty-state">No transactions for this customer yet.</p>
            ) : (
              <div className="transaction-list">
                {selectedTransactions.map((tx) => (
                  <TransactionRow
                    key={tx.id}
                    tx={tx}
                    showCustomer={false}
                    onEdited={() => {
                      handleViewCustomer(selectedCustomer);
                      refreshOverview();
                    }}
                    onDeleted={() => {
                      handleViewCustomer(selectedCustomer);
                      refreshOverview();
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="ledger">
        <div className="ledger-heading">
          <h2>All transactions</h2>
          <span className="ledger-count">{allTransactions.length} total</span>
        </div>

        {allTransactions.length === 0 ? (
          <p className="empty-state">No transactions yet.</p>
        ) : (
          <div className="transaction-list">
            {allTransactions.map((tx) => (
              <TransactionRow
                key={tx.id}
                tx={tx}
                showCustomer
                onEdited={refreshOverview}
                onDeleted={refreshOverview}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function AdminPage() {
  const { password } = useAdmin();
  return password ? <AdminDashboard /> : <AdminLogin />;
}

export default AdminPage;
