import { Link, useNavigate } from 'react-router-dom';
import { useCustomer } from '../CustomerContext';

interface AppHeaderProps {
  eyebrow: string;
  title: string;
  activeLink: 'ledger' | 'bill';
}

function AppHeader({ eyebrow, title, activeLink }: AppHeaderProps) {
  const { customer, logout } = useCustomer();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <header className="masthead">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {customer && (
          <p className="customer-chip">
            {customer.name} · <span className="customer-id">{customer.id}</span>
          </p>
        )}
      </div>
      <div className="masthead-actions">
        {activeLink === 'ledger' ? (
          <Link to="/bill" className="nav-link">
            View Bill →
          </Link>
        ) : (
          <Link to="/ledger" className="nav-link">
            ← Back to ledger
          </Link>
        )}
        <button type="button" className="text-button" onClick={handleLogout}>
          Switch ID
        </button>
      </div>
    </header>
  );
}

export default AppHeader;
