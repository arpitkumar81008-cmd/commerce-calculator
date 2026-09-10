import { useEffect, useState } from 'react';
import { api, formatINR } from '../api';
import type { CartItem, Bill, Balance, Transaction } from '../api';
import { useCustomer } from '../CustomerContext';
import AppHeader from '../components/AppHeader';

function statusLabel(status: Transaction['status']): string {
  if (status === 'paid') return 'Paid';
  if (status === 'partial') return 'Partially paid';
  return 'Due';
}

function BillPage() {
  const { customer } = useCustomer();
  const customerId = customer!.id;

  const [items, setItems] = useState<CartItem[]>([]);
  const [bill, setBill] = useState<Bill | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [paidInput, setPaidInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [settling, setSettling] = useState(false);
  const [settledMessage, setSettledMessage] = useState<string | null>(null);

  const [duePaymentInput, setDuePaymentInput] = useState('');
  const [payingDue, setPayingDue] = useState(false);
  const [duePaymentMessage, setDuePaymentMessage] = useState<string | null>(null);

  const refreshAll = () => {
    Promise.all([
      api.getCart(customerId),
      api.getBill(customerId),
      api.getBalance(customerId),
      api.getTransactions(customerId),
    ])
      .then(([cartItems, billData, balanceData, txs]) => {
        setItems(cartItems);
        setBill(billData);
        setBalance(balanceData);
        setTransactions(txs);
      })
      .catch(() => setError('Could not reach the backend. Is it running?'));
  };

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const paidValue = Number(paidInput);
  const hasValidPaid = Number.isFinite(paidValue) && paidValue >= 0;
  // The obligation for this bill includes anything already owed (or offset
  // by existing credit) from before — this is what makes an overpayment
  // roll forward correctly instead of being tracked per-transaction.
  const obligation = bill ? round2(bill.total + (balance?.balance ?? 0)) : null;
  const livePreviewBalance =
    obligation !== null && hasValidPaid ? round2(obligation - paidValue) : null;

  function round2(n: number) {
    return Math.round(n * 100) / 100;
  }

  const handleSettle = async () => {
    setError(null);
    setSettledMessage(null);

    if (!bill || items.length === 0) {
      setError('Your ledger is empty — add articles before settling the bill.');
      return;
    }
    if (!hasValidPaid) {
      setError('Enter a valid amount received (0 or more).');
      return;
    }

    setSettling(true);
    try {
      const { transaction } = await api.settle(customerId, paidValue);
      const summary =
        transaction.due > 0
          ? `${formatINR(transaction.due)} still due.`
          : transaction.credit > 0
            ? `${formatINR(transaction.credit)} credit carried forward.`
            : `Fully settled.`;
      setSettledMessage(
        `Settled: ${formatINR(transaction.total)} for this bill, ${formatINR(transaction.paid)} received now. ${summary}`
      );
      setPaidInput('');
      refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not settle the bill.');
    } finally {
      setSettling(false);
    }
  };

  const handlePayDue = async () => {
    setError(null);
    setDuePaymentMessage(null);
    const amount = Number(duePaymentInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid payment amount (greater than 0).');
      return;
    }

    setPayingDue(true);
    try {
      const { transaction } = await api.recordPayment(customerId, amount);
      setDuePaymentMessage(
        transaction.due > 0
          ? `Payment recorded. ${formatINR(transaction.due)} still due.`
          : transaction.credit > 0
            ? `Payment recorded. Fully cleared, with ${formatINR(transaction.credit)} credit remaining.`
            : `Payment recorded. You're all settled up.`
      );
      setDuePaymentInput('');
      refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record that payment.');
    } finally {
      setPayingDue(false);
    }
  };

  return (
    <div className="page">
      <AppHeader eyebrow="Billing" title="Bill" activeLink="bill" />

      {error && <p className="error">{error}</p>}

      {balance && (
        <div
          className={`balance-banner ${
            balance.due > 0 ? 'balance-due' : balance.credit > 0 ? 'balance-credit' : 'balance-clear'
          }`}
        >
          {balance.due > 0 && (
            <span>
              Outstanding due: <strong>{formatINR(balance.due)}</strong>
            </span>
          )}
          {balance.due === 0 && balance.credit > 0 && (
            <span>
              You have <strong>{formatINR(balance.credit)}</strong> credit — it'll be applied to
              your next bill.
            </span>
          )}
          {balance.due === 0 && balance.credit === 0 && <span>You're all settled up.</span>}
        </div>
      )}

      {balance && balance.due > 0 && (
        <section className="settle-card pay-due-card">
          <div>
            <h2 className="pay-due-title">Pay off your due</h2>
            <p className="settle-hint">
              Record a payment against your outstanding balance — no need to buy anything first.
            </p>
          </div>
          <label>
            <span>Payment amount (₹)</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={duePaymentInput}
              onChange={(e) => setDuePaymentInput(e.target.value)}
              placeholder="0.00"
            />
          </label>
          <button type="button" className="primary-button" onClick={handlePayDue} disabled={payingDue}>
            {payingDue ? 'Recording…' : 'Record payment'}
          </button>
          {duePaymentMessage && <p className="confirmation">{duePaymentMessage}</p>}
        </section>
      )}

      <section className="ledger">
        <div className="ledger-heading">
          <h2>Current bill</h2>
        </div>

        {items.length === 0 ? (
          <p className="empty-state">
            Nothing to bill yet — add articles on the ledger page first.
          </p>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Article</th>
                    <th>Qty</th>
                    <th>Unit</th>
                    <th>Tax</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td className="cell-name">{item.name}</td>
                      <td className="cell-num">{item.quantity}</td>
                      <td className="cell-num">{formatINR(item.unit_amount)}</td>
                      <td className="cell-num">{formatINR(item.tax)}</td>
                      <td className="cell-num cell-total">{formatINR(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
                {bill && (
                  <tfoot>
                    <tr>
                      <td colSpan={4} className="foot-label">
                        Subtotal
                      </td>
                      <td className="cell-num">{formatINR(bill.subtotal)}</td>
                    </tr>
                    <tr>
                      <td colSpan={4} className="foot-label">
                        Tax
                      </td>
                      <td className="cell-num">{formatINR(bill.tax)}</td>
                    </tr>
                    {balance && balance.balance !== 0 && (
                      <tr>
                        <td colSpan={4} className="foot-label">
                          {balance.balance > 0 ? 'Previous due' : 'Previous credit applied'}
                        </td>
                        <td className="cell-num">
                          {balance.balance > 0 ? '+' : '−'}
                          {formatINR(Math.abs(balance.balance))}
                        </td>
                      </tr>
                    )}
                    <tr className="foot-total-row">
                      <td colSpan={4} className="foot-label foot-total-label">
                        {balance && balance.balance !== 0 ? 'Total now owed' : 'Total'}
                      </td>
                      <td className="cell-num cell-total foot-total-value">
                        {formatINR(obligation ?? bill.total)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <div className="settle-card">
              <label>
                <span>Amount received now (₹)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={paidInput}
                  onChange={(e) => setPaidInput(e.target.value)}
                  placeholder="0.00"
                />
              </label>
              {livePreviewBalance !== null && (
                <p className="due-preview">
                  {livePreviewBalance > 0 ? (
                    <>
                      Due after this payment: <strong>{formatINR(livePreviewBalance)}</strong>
                    </>
                  ) : livePreviewBalance < 0 ? (
                    <>
                      Credit after this payment: <strong>{formatINR(-livePreviewBalance)}</strong>
                    </>
                  ) : (
                    <strong>Fully settled</strong>
                  )}
                </p>
              )}
              <button type="button" className="primary-button" onClick={handleSettle} disabled={settling}>
                {settling ? 'Settling…' : 'Settle bill'}
              </button>
              <p className="settle-hint">
                Settling records this as a transaction and clears the ledger for next time. Any
                existing due or credit is automatically rolled in above.
              </p>
            </div>

            {settledMessage && <p className="confirmation">{settledMessage}</p>}
          </>
        )}
      </section>

      <section className="ledger">
        <div className="ledger-heading">
          <h2>Past transactions</h2>
          <span className="ledger-count">
            {transactions.length} record{transactions.length === 1 ? '' : 's'}
          </span>
        </div>

        {transactions.length === 0 ? (
          <p className="empty-state">No settled transactions yet.</p>
        ) : (
          <div className="transaction-list">
            {transactions.map((tx) => (
              <div key={tx.id} className="transaction-card">
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
                      {tx.edited && <span className="edited-tag"> · corrected by admin</span>}
                    </p>
                    {tx.type === 'purchase' ? (
                      <p className="transaction-items-summary">
                        {tx.items.map((i) => `${i.name} ×${i.quantity}`).join(', ')}
                      </p>
                    ) : (
                      <p className="transaction-items-summary">{tx.note ?? 'Payment recorded'}</p>
                    )}
                  </div>
                  <span className={`status-badge status-${tx.status}`}>{statusLabel(tx.status)}</span>
                </div>

                <div className="transaction-amounts">
                  {tx.type === 'purchase' && (
                    <div>
                      <span className="amount-label">Bill total</span>
                      <span className="amount-value">{formatINR(tx.total)}</span>
                    </div>
                  )}
                  <div>
                    <span className="amount-label">Paid now</span>
                    <span className="amount-value">{formatINR(tx.paid)}</span>
                  </div>
                  <div>
                    <span className="amount-label">{tx.balance_after >= 0 ? 'Due after' : 'Credit after'}</span>
                    <span className={`amount-value ${tx.balance_after > 0 ? 'amount-due' : ''}`}>
                      {formatINR(Math.abs(tx.balance_after))}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default BillPage;
