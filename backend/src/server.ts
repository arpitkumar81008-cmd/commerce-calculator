import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import {
  createCustomer,
  getCustomer,
  listCustomers,
  listCart,
  addOrMergeCartItem,
  setCartItemQuantity,
  removeCartItem,
  getCartBill,
  getBalance,
  settleCart,
  recordPayment,
  listTransactions,
  checkAdminPassword,
  listAllTransactions,
  getAdminStats,
  adminUpdateTransaction,
  adminDeleteTransaction,
} from './db';

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

app.use(cors());
app.use(express.json());

const api = express.Router();

const MAX_QUANTITY = 1_000_000;

function isValidQuantity(q: unknown): q is number {
  return typeof q === 'number' && Number.isInteger(q) && q > 0 && q <= MAX_QUANTITY;
}

// ---------- Customer lookup middleware ----------
function requireCustomer(req: Request, res: Response, next: NextFunction) {
  const customer = getCustomer(req.params.customerId);
  if (!customer) {
    return res.status(404).json({ error: 'No customer found with that ID' });
  }
  next();
}

// ---------- Admin auth middleware ----------
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const password = req.header('x-admin-password') ?? '';
  if (!checkAdminPassword(password)) {
    return res.status(401).json({ error: 'Invalid admin password' });
  }
  next();
}

// ---------- Customers ----------

api.post('/customers', (req: Request, res: Response) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }
  if (name.length > 80) {
    return res.status(400).json({ error: 'name is too long' });
  }
  const customer = createCustomer(name);
  res.status(201).json({ customer });
});

api.get('/customers/:customerId', (req: Request, res: Response) => {
  const customer = getCustomer(req.params.customerId);
  if (!customer) {
    return res.status(404).json({ error: 'No customer found with that ID' });
  }
  res.json({ customer });
});

// ---------- Cart ----------

api.get('/customers/:customerId/cart', requireCustomer, (req: Request, res: Response) => {
  res.json(listCart(req.params.customerId));
});

api.get('/customers/:customerId/bill', requireCustomer, (req: Request, res: Response) => {
  const bill = getCartBill(req.params.customerId);
  const balance = getBalance(req.params.customerId);
  res.json({ ...bill, ...balance });
});

api.post('/customers/:customerId/cart', requireCustomer, (req: Request, res: Response) => {
  const { name, amount, taxRate = 0.08, quantity = 1 } = req.body ?? {};

  const parsedName = typeof name === 'string' ? name.trim() : '';
  const parsedAmount = Number(amount);
  const parsedTaxRate = Number(taxRate);
  const parsedQuantity = Number(quantity);

  if (!parsedName) {
    return res.status(400).json({ error: 'name is required' });
  }
  if (parsedName.length > 120) {
    return res.status(400).json({ error: 'name is too long' });
  }
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }
  if (!Number.isFinite(parsedTaxRate) || parsedTaxRate < 0) {
    return res.status(400).json({ error: 'taxRate must be a non-negative number' });
  }
  if (!isValidQuantity(parsedQuantity)) {
    return res.status(400).json({ error: `quantity must be a positive integer up to ${MAX_QUANTITY}` });
  }

  const item = addOrMergeCartItem(
    req.params.customerId,
    parsedName,
    parsedAmount,
    parsedTaxRate,
    parsedQuantity
  );

  res.json({
    message: `"${item.name}": ${item.quantity} x ₹${item.unit_amount.toFixed(2)} + tax = ₹${item.total.toFixed(2)}`,
    item,
  });
});

api.patch('/customers/:customerId/cart/:itemId', requireCustomer, (req: Request, res: Response) => {
  const itemId = Number(req.params.itemId);
  const quantity = Number(req.body?.quantity);

  if (!isValidQuantity(quantity)) {
    return res.status(400).json({ error: `quantity must be a positive integer up to ${MAX_QUANTITY}` });
  }

  const updated = setCartItemQuantity(req.params.customerId, itemId, quantity);
  if (!updated) {
    return res.status(404).json({ error: 'line item not found' });
  }
  res.json({ item: updated });
});

api.delete('/customers/:customerId/cart/:itemId', requireCustomer, (req: Request, res: Response) => {
  const itemId = Number(req.params.itemId);
  const removed = removeCartItem(req.params.customerId, itemId);
  if (!removed) {
    return res.status(404).json({ error: 'line item not found' });
  }
  res.status(204).end();
});

// ---------- Balance ----------

api.get('/customers/:customerId/balance', requireCustomer, (req: Request, res: Response) => {
  res.json(getBalance(req.params.customerId));
});

// ---------- Settling a bill / transaction history ----------

// POST /api/customers/:customerId/settle - finalize the current cart into a
// transaction. Any existing due/credit balance is rolled in automatically.
api.post('/customers/:customerId/settle', requireCustomer, (req: Request, res: Response) => {
  const paid = Number(req.body?.paid ?? 0);
  if (!Number.isFinite(paid) || paid < 0) {
    return res.status(400).json({ error: 'paid must be a non-negative number' });
  }

  const transaction = settleCart(req.params.customerId, paid);
  if (!transaction) {
    return res.status(400).json({ error: 'Cart is empty - add at least one article before settling.' });
  }

  res.status(201).json({ transaction });
});

// POST /api/customers/:customerId/payments - record a standalone payment
// against the customer's running balance (for paying off a due amount on a
// later visit). This always adds to the balance rather than overwriting it.
api.post('/customers/:customerId/payments', requireCustomer, (req: Request, res: Response) => {
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }

  const transaction = recordPayment(req.params.customerId, amount);
  res.status(201).json({ transaction });
});

api.get('/customers/:customerId/transactions', requireCustomer, (req: Request, res: Response) => {
  res.json(listTransactions(req.params.customerId));
});

// ---------- Admin ----------

api.post('/admin/login', (req: Request, res: Response) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!checkAdminPassword(password)) {
    return res.status(401).json({ error: 'Invalid admin password' });
  }
  res.json({ ok: true });
});

api.get('/admin/stats', requireAdmin, (_req: Request, res: Response) => {
  res.json(getAdminStats());
});

api.get('/admin/customers', requireAdmin, (req: Request, res: Response) => {
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  res.json(listCustomers(q));
});

api.get(
  '/admin/customers/:customerId/transactions',
  requireAdmin,
  requireCustomer,
  (req: Request, res: Response) => {
    res.json(listTransactions(req.params.customerId));
  }
);

api.get('/admin/transactions', requireAdmin, (_req: Request, res: Response) => {
  res.json(listAllTransactions());
});

api.patch('/admin/transactions/:txId', requireAdmin, (req: Request, res: Response) => {
  const txId = Number(req.params.txId);
  const { subtotal, tax, total, paid, note } = req.body ?? {};

  const edits: Record<string, number | string> = {};
  for (const [key, value] of Object.entries({ subtotal, tax, total, paid })) {
    if (value === undefined) continue;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      return res.status(400).json({ error: `${key} must be a non-negative number` });
    }
    edits[key] = n;
  }
  if (note !== undefined) {
    if (typeof note !== 'string' || note.length > 300) {
      return res.status(400).json({ error: 'note must be a string up to 300 characters' });
    }
    edits.note = note;
  }

  const updated = adminUpdateTransaction(txId, edits);
  if (!updated) {
    return res.status(404).json({ error: 'transaction not found' });
  }
  res.json({ transaction: updated });
});

api.delete('/admin/transactions/:txId', requireAdmin, (req: Request, res: Response) => {
  const txId = Number(req.params.txId);
  const removed = adminDeleteTransaction(txId);
  if (!removed) {
    return res.status(404).json({ error: 'transaction not found' });
  }
  res.status(204).end();
});

api.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.use('/api', api);

// Serve the built frontend (backend/public, populated by `npm run build:all`)
// so the whole app — UI and API — is reachable from a single port.
const publicDir = path.join(__dirname, '..', 'public');

if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));

  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
} else {
  app.get('/', (_req: Request, res: Response) => {
    res.send(
      'Frontend not built yet. Run "npm run build:all" in the backend folder to serve it from here.'
    );
  });
}

app.listen(PORT, () => {
  console.log(`Commerce Calculator running on http://localhost:${PORT}`);
});
