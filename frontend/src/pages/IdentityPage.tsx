import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useCustomer } from '../CustomerContext';

type Mode = 'choose' | 'existing' | 'new';

function IdentityPage() {
  const [mode, setMode] = useState<Mode>('choose');
  const [idInput, setIdInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [createdCustomer, setCreatedCustomer] = useState<{ id: string; name: string } | null>(null);

  const { setCustomer } = useCustomer();
  const navigate = useNavigate();

  const handleExistingSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const trimmed = idInput.trim();
    if (!trimmed) {
      setError('Enter your consumer ID.');
      return;
    }

    setLoading(true);
    try {
      const { customer } = await api.getCustomer(trimmed);
      setCustomer(customer);
      navigate('/ledger');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not find that ID.');
    } finally {
      setLoading(false);
    }
  };

  const handleNewSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setError('Enter your name to generate an ID.');
      return;
    }

    setLoading(true);
    try {
      const { customer } = await api.createCustomer(trimmed);
      setCreatedCustomer({ id: customer.id, name: customer.name });
      setCustomer(customer);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create a new ID.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page identity-page">
      <div className="identity-card">
        <p className="eyebrow">Welcome</p>
        <h1 className="identity-title">Commerce Calculator</h1>

        {mode === 'choose' && (
          <>
            <p className="identity-copy">
              Enter your consumer ID to pick up where you left off, or create a new one if
              you're visiting for the first time.
            </p>
            <div className="identity-actions">
              <button type="button" className="primary-button" onClick={() => setMode('existing')}>
                I have an ID
              </button>
              <button type="button" className="secondary-button" onClick={() => setMode('new')}>
                I'm a new customer
              </button>
            </div>
          </>
        )}

        {mode === 'existing' && (
          <form onSubmit={handleExistingSubmit} className="identity-form">
            <label>
              <span>Consumer ID</span>
              <input
                type="text"
                value={idInput}
                onChange={(e) => setIdInput(e.target.value)}
                placeholder="e.g. CUST-7F3K9Q"
                autoFocus
              />
            </label>
            <div className="identity-actions">
              <button type="submit" className="primary-button" disabled={loading}>
                {loading ? 'Checking…' : 'Continue'}
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setMode('choose');
                  setError(null);
                }}
              >
                ← Back
              </button>
            </div>
          </form>
        )}

        {mode === 'new' && !createdCustomer && (
          <form onSubmit={handleNewSubmit} className="identity-form">
            <label>
              <span>Your name</span>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="e.g. Asha Verma"
                autoFocus
              />
            </label>
            <div className="identity-actions">
              <button type="submit" className="primary-button" disabled={loading}>
                {loading ? 'Generating…' : 'Generate my ID'}
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setMode('choose');
                  setError(null);
                }}
              >
                ← Back
              </button>
            </div>
          </form>
        )}

        {createdCustomer && (
          <div className="identity-generated">
            <p className="identity-copy">
              Welcome, {createdCustomer.name}! Here's your consumer ID — save it somewhere safe,
              you'll need it to come back and see your order history:
            </p>
            <div className="generated-id">{createdCustomer.id}</div>
            <button type="button" className="primary-button" onClick={() => navigate('/ledger')}>
              Continue to ledger →
            </button>
          </div>
        )}

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}

export default IdentityPage;
