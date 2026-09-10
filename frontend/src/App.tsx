import { Routes, Route } from 'react-router-dom';
import IdentityPage from './pages/IdentityPage';
import LedgerPage from './pages/LedgerPage';
import BillPage from './pages/BillPage';
import AdminPage from './pages/AdminPage';
import RequireCustomer from './components/RequireCustomer';
import './App.css';

function App() {
  return (
    <Routes>
      <Route path="/" element={<IdentityPage />} />
      <Route
        path="/ledger"
        element={
          <RequireCustomer>
            <LedgerPage />
          </RequireCustomer>
        }
      />
      <Route
        path="/bill"
        element={
          <RequireCustomer>
            <BillPage />
          </RequireCustomer>
        }
      />
      <Route path="/admin" element={<AdminPage />} />
    </Routes>
  );
}

export default App;
