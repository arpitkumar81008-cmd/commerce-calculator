import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, formatINR, GST_SLABS } from '../api';
import type { CartItem } from '../api';
import { useCustomer } from '../CustomerContext';
import AppHeader from '../components/AppHeader';

const CUSTOM_SLAB = 'custom';

function LedgerPage() {
  const { customer } = useCustomer();
  const customerId = customer!.id;

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [taxSlab, setTaxSlab] = useState<string>('0.18');
  const [customTaxRate, setCustomTaxRate] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Per-row editable quantity drafts, keyed by item id, so the input can be
  // typed into freely (e.g. entering 500) before committing on "Update".
  const [quantityDrafts, setQuantityDrafts] = useState<Record<number, string>>({});
  const [busyRowId, setBusyRowId] = useState<number | null>(null);

  const refreshCart = () => {
    api.getCart(customerId).then((data) => {
      setItems(data);
      setQuantityDrafts((prev) => {
        const next = { ...prev };
        data.forEach((item) => {
          if (!(item.id in next)) next[item.id] = String(item.quantity);
        });
        return next;
      });
    }).catch(() => {
      /* backend not reachable yet — leave the ledger empty */
    });
  };

  useEffect(() => {
    refreshCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setResult(null);

    const trimmedName = name.trim();
    const parsedAmount = Number(amount);
    const parsedQuantity = Number(quantity);
    const parsedTaxRate = taxSlab === CUSTOM_SLAB ? Number(customTaxRate) : Number(taxSlab);

    if (!trimmedName) {
      setError('Enter an article name.');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Enter a positive amount.');
      return;
    }
    if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
      setError('Enter a valid quantity (a positive whole number).');
      return;
    }
    if (taxSlab === CUSTOM_SLAB && (!Number.isFinite(parsedTaxRate) || parsedTaxRate < 0)) {
      setError('Enter a valid custom tax rate.');
      return;
    }

    setLoading(true);
    try {
      const data = await api.addToCart(customerId, {
        name: trimmedName,
        amount: parsedAmount,
        taxRate: parsedTaxRate,
        quantity: parsedQuantity,
      });
      setResult(data.message);
      setName('');
      setAmount('');
      setQuantity('1');
      refreshCart();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the backend.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateQuantity = async (item: CartItem) => {
    setError(null);
    const draft = Number(quantityDrafts[item.id]);
    if (!Number.isInteger(draft) || draft <= 0) {
      setError('Quantity must be a positive whole number.');
      return;
    }
    setBusyRowId(item.id);
    try {
      await api.setCartItemQuantity(customerId, item.id, draft);
      refreshCart();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update that item.');
    } finally {
      setBusyRowId(null);
    }
  };

  const handleIncrement = async (item: CartItem) => {
    setError(null);
    setBusyRowId(item.id);
    try {
      await api.setCartItemQuantity(customerId, item.id, item.quantity + 1);
      refreshCart();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update that item.');
    } finally {
      setBusyRowId(null);
    }
  };

  const handleRemove = async (item: CartItem) => {
    setError(null);
    setBusyRowId(item.id);
    try {
      await api.removeCartItem(customerId, item.id);
      refreshCart();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that item.');
    } finally {
      setBusyRowId(null);
    }
  };

  return (
    <div className="page">
      <AppHeader eyebrow="Ledger" title="Commerce Calculator" activeLink="ledger" />

      <form onSubmit={handleSubmit} className="entry-card">
        <div className="field-row">
          <label>
            <span>Article name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Handwoven Basket"
            />
          </label>
        </div>

        <div className="field-row three-up">
          <label>
            <span>Amount per item (₹)</span>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </label>

          <label>
            <span>Quantity</span>
            <input
              type="number"
              step="1"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="1"
            />
          </label>

          <label>
            <span>GST slab</span>
            <select value={taxSlab} onChange={(e) => setTaxSlab(e.target.value)}>
              {GST_SLABS.map((slab) => (
                <option key={slab.value} value={slab.value}>
                  {slab.label}
                </option>
              ))}
              <option value={CUSTOM_SLAB}>Custom rate…</option>
            </select>
          </label>
        </div>

        {taxSlab === CUSTOM_SLAB && (
          <div className="field-row">
            <label>
              <span>Custom tax rate (e.g. 0.08 = 8%)</span>
              <input
                type="number"
                step="0.001"
                min="0"
                value={customTaxRate}
                onChange={(e) => setCustomTaxRate(e.target.value)}
                placeholder="0.08"
              />
            </label>
          </div>
        )}

        <button type="submit" className="primary-button" disabled={loading}>
          {loading ? 'Adding…' : 'Add to ledger'}
        </button>
      </form>

      {error && <p className="error">{error}</p>}
      {result && <p className="confirmation">{result}</p>}

      <section className="ledger">
        <div className="ledger-heading">
          <h2>Line items</h2>
          <span className="ledger-count">
            {items.length} article{items.length === 1 ? '' : 's'}
          </span>
        </div>

        {items.length === 0 ? (
          <p className="empty-state">Nothing on the ledger yet — add an article above to get started.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Article</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th>Tax</th>
                  <th>Total</th>
                  <th aria-hidden="true"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="cell-name">{item.name}</td>
                    <td>
                      <div className="qty-editor">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          className="qty-input"
                          value={quantityDrafts[item.id] ?? String(item.quantity)}
                          onChange={(e) =>
                            setQuantityDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                          }
                        />
                        <button
                          type="button"
                          className="increment-button"
                          onClick={() => handleUpdateQuantity(item)}
                          disabled={busyRowId === item.id}
                          title="Set exact quantity (useful for large restocks)"
                        >
                          Set
                        </button>
                        <button
                          type="button"
                          className="increment-button"
                          onClick={() => handleIncrement(item)}
                          disabled={busyRowId === item.id}
                          title={`Add one more ${item.name}`}
                        >
                          +1
                        </button>
                      </div>
                    </td>
                    <td className="cell-num">{formatINR(item.unit_amount)}</td>
                    <td className="cell-num">{formatINR(item.tax)}</td>
                    <td className="cell-num cell-total">{formatINR(item.total)}</td>
                    <td>
                      <button
                        type="button"
                        className="remove-button"
                        onClick={() => handleRemove(item)}
                        disabled={busyRowId === item.id}
                        title={`Remove ${item.name} from the ledger`}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {items.length > 0 && (
          <Link to="/bill" className="view-bill-button">
            View total bill
          </Link>
        )}
      </section>
    </div>
  );
}

export default LedgerPage;
