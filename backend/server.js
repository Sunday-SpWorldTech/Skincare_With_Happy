require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');

const app = express();
const frontendUrl = String(process.env.FRONTEND_URL || '').replace(/\/$/, '');
const backendUrl = String(process.env.BACKEND_URL || '').replace(/\/$/, '');
const JWT_SECRET = process.env.JWT_SECRET;
const PORT = Number(process.env.PORT || 4000);

app.use(helmet({ contentSecurityPolicy: false }));
const allowedOrigins = [frontendUrl, process.env.CORS_ORIGIN, 'https://skincare-with-happy-frontend.vercel.app'].filter(Boolean);
app.use(cors({ origin: (origin, callback) => { if (!origin || allowedOrigins.includes(origin)) return callback(null, true); return callback(new Error('Origin not allowed by CORS')); }, credentials: true }));
app.use(express.json({ limit: '2mb', verify: (req, _res, buf) => { req.rawBody = Buffer.from(buf); } }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, default: '' },
  address: { type: String, default: '' },
  passwordHash: { type: String, required: true },
  pinHash: { type: String, default: null },
  walletBalanceUsd: { type: Number, default: 0, min: 0 },
  role: { type: String, enum: ['user', 'admin'], default: 'user' }
}, { timestamps: true });

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true },
  category: { type: String, default: 'Skincare' },
  description: { type: String, default: '' },
  price: { type: Number, required: true, min: 0 }, // USD display price
  old_price: { type: Number, default: null }, // USD display price
  currency: { type: String, default: 'USD' },
  image_url: { type: String, default: '/images/products/product-placeholder.svg' },
  stock: { type: Number, default: 0, min: 0 },
  rating: { type: Number, default: 5 },
  active: { type: Boolean, default: true }
}, { timestamps: true });

const orderSchema = new mongoose.Schema({
  reference: { type: String, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  customer: { name: String, email: String, phone: String, address: String },
  items: [{ productId: mongoose.Schema.Types.ObjectId, name: String, quantity: Number, unitPrice: Number }],
  total: Number, // NGN settlement amount sent to Paystack
  totalUsd: { type: Number, default: 0 },
  fxRate: { type: Number, default: 0 },
  currency: { type: String, default: 'NGN' },
  status: { type: String, enum: ['awaiting_payment','processing','completed','cancelled'], default: 'awaiting_payment' },
  paymentStatus: { type: String, enum: ['pending','paid','failed'], default: 'pending' },
  paymentReference: String,
  paystackFee: { type: Number, default: 0 },
  netAmount: { type: Number, default: 0 },
  paymentReserveRate: { type: Number, default: 4 },
  paymentReserve: { type: Number, default: 0 },
  adminWalletAmount: { type: Number, default: 0 },
  paymentMethod: { type: String, enum: ['paystack','wallet'], default: 'paystack' },
  paidAt: Date
}, { timestamps: true });

const withdrawalSchema = new mongoose.Schema({
  amount: Number,
  bankCode: String,
  bankName: String,
  accountNumber: String,
  accountName: String,
  recipientCode: String,
  transferCode: String,
  reference: String,
  status: { type: String, enum: ['pending','success','failed','reversed'], default: 'pending' },
  reason: String,
  initiatedBy: mongoose.Schema.Types.ObjectId
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const Product = mongoose.model('Product', productSchema);
const Order = mongoose.model('Order', orderSchema);
const Withdrawal = mongoose.model('Withdrawal', withdrawalSchema);

const adminWalletLedgerSchema = new mongoose.Schema({
  reference: { type: String, unique: true },
  type: { type: String, enum: ['credit','debit'], required: true },
  amount: { type: Number, required: true, min: 0 },
  description: { type: String, default: '' },
  orderReference: { type: String, default: null },
  withdrawalReference: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});
const AdminWalletLedger = mongoose.model('AdminWalletLedger', adminWalletLedgerSchema);

const depositSchema = new mongoose.Schema({
  reference: { type: String, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amountUsd: { type: Number, required: true },
  amountNgn: { type: Number, required: true },
  paymentReserveRate: { type: Number, default: 4 },
  paymentReserveUsd: { type: Number, default: 0 },
  creditedUsd: { type: Number, default: 0 },
  paystackFee: { type: Number, default: 0 },
  status: { type: String, enum: ['pending','paid','failed'], default: 'pending' },
  paymentReference: String,
  paidAt: Date
}, { timestamps: true });
const Deposit = mongoose.model('Deposit', depositSchema);

const cleanEmail = value => String(value || '').trim().toLowerCase();
const makeReference = prefix => `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
const slugify = value => String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const USD_TO_NGN_RATE = Number(process.env.USD_TO_NGN_RATE || 1500);
const PAYMENT_RESERVE_RATE = Number(process.env.PAYMENT_RESERVE_RATE || 4);
const PAYSTACK_CURRENCY = String(process.env.PAYSTACK_CURRENCY || 'NGN').toUpperCase();
if (!Number.isFinite(USD_TO_NGN_RATE) || USD_TO_NGN_RATE <= 0) throw new Error('USD_TO_NGN_RATE must be a positive number');
if (!Number.isFinite(PAYMENT_RESERVE_RATE) || PAYMENT_RESERVE_RATE < 0 || PAYMENT_RESERVE_RATE >= 100) throw new Error('PAYMENT_RESERVE_RATE must be between 0 and 100');
const usdToNgn = usd => Math.round(Number(usd || 0) * USD_TO_NGN_RATE * 100) / 100;
const ADMIN_WITHDRAWAL_BANK_NAME = String(process.env.ADMIN_WITHDRAWAL_BANK_NAME || 'Moniepoint').trim();
const ADMIN_WITHDRAWAL_ACCOUNT_NUMBER = String(process.env.ADMIN_WITHDRAWAL_ACCOUNT_NUMBER || '').trim();
const ADMIN_WITHDRAWAL_ACCOUNT_NAME = String(process.env.ADMIN_WITHDRAWAL_ACCOUNT_NAME || '').trim();
let mongoConnectionPromise = null;

async function creditAdminWallet(reference, amount, description, orderReference = null) {
  if (!reference || !Number.isFinite(Number(amount)) || Number(amount) <= 0) return;
  try {
    await AdminWalletLedger.create({ reference, type: 'credit', amount: Number(amount), description, orderReference });
  } catch (e) {
    if (e?.code !== 11000) throw e;
  }
}

async function getAdminWalletBalance() {
  const [credits, debits] = await Promise.all([
    AdminWalletLedger.aggregate([{ $match: { type: 'credit' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    AdminWalletLedger.aggregate([{ $match: { type: 'debit' } }, { $group: { _id: null, total: { $sum: '$amount' } } }])
  ]);
  return Math.max(0, Number(credits[0]?.total || 0) - Number(debits[0]?.total || 0));
}

async function resolveConfiguredWithdrawalBank() {
  if (!process.env.PAYSTACK_SECRET_KEY) throw new Error('PAYSTACK_SECRET_KEY is not configured');
  const r = await fetch('https://api.paystack.co/bank?country=nigeria&currency=NGN&perPage=100');
  const data = await r.json();
  if (!r.ok || !data.status) throw new Error(data.message || 'Unable to load banks');
  const target = ADMIN_WITHDRAWAL_BANK_NAME.toLowerCase();
  const bank = (data.data || []).find(b => String(b.name || '').toLowerCase() === target) || (data.data || []).find(b => String(b.name || '').toLowerCase().includes(target) || target.includes(String(b.name || '').toLowerCase()));
  if (!bank) throw new Error(`Configured withdrawal bank "${ADMIN_WITHDRAWAL_BANK_NAME}" was not found in Paystack`);
  return bank;
}

function signUser(user) {
  return jwt.sign({ id: String(user._id), role: user.role, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
}
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    if (req.user.pinPending) return res.status(403).json({ error: 'PIN verification required' });
    next();
  } catch { return res.status(401).json({ error: 'Session expired. Please log in again.' }); }
}
function authPending(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    if (!req.user.pinPending) return res.status(400).json({ error: 'PIN verification is not pending' });
    next();
  } catch { return res.status(401).json({ error: 'PIN session expired. Please log in again.' }); }
}
function adminOnly(req, res, next) { if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' }); next(); }

async function ensureAdmin() {
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) return;
  const email = cleanEmail(process.env.ADMIN_EMAIL);
  const existing = await User.findOne({ email });
  const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
  if (!existing) await User.create({ name: process.env.ADMIN_NAME || 'Administrator', email, passwordHash: hash, role: 'admin' });
  else if (existing.role !== 'admin') { existing.role = 'admin'; existing.passwordHash = hash; await existing.save(); }
}

async function ensureStarterProducts() {
  const starterProducts = [
    { name: 'Hydrating Cleanser', category: 'Cleansers', description: 'Everyday cleansers essential from Skincare With Happy.', price: 12.99, currency: 'USD', stock: 25, rating: 5, active: true, image_url: '/images/products/starter-01.svg' },    { name: 'Gentle Foaming Cleanser', category: 'Cleansers', description: 'Everyday cleansers essential from Skincare With Happy.', price: 13.99, currency: 'USD', stock: 25, rating: 5, active: true, image_url: '/images/products/starter-02.svg' },    { name: 'Vitamin C Brightening Cleanser', category: 'Cleansers', description: 'Everyday cleansers essential from Skincare With Happy.', price: 14.99, currency: 'USD', stock: 25, rating: 5, active: true, image_url: '/images/products/starter-03.svg' },    { name: 'Salicylic Acid Cleanser', category: 'Cleansers', description: 'Everyday cleansers essential from Skincare With Happy.', price: 15.99, currency: 'USD', stock: 25, rating: 5, active: true, image_url: '/images/products/starter-04.svg' },    { name: 'Hyaluronic Acid Serum', category: 'Serums', description: 'Everyday serums essential from Skincare With Happy.', price: 17.99, currency: 'USD', stock: 25, rating: 5, active: true, image_url: '/images/products/starter-05.svg' },    { name: 'Niacinamide 10% Serum', category: 'Serums', description: 'Everyday serums essential from Skincare With Happy.', price: 16.99, currency: 'USD', stock: 25, rating: 5, active: true, image_url: '/images/products/starter-06.svg' },    { name: 'Vitamin C Glow Serum', category: 'Serums', description: 'Everyday serums essential from Skincare With Happy.', price: 19.99, currency: 'USD', stock: 25, rating: 5, active: true, image_url: '/images/products/starter-07.svg' },    { name: 'Alpha Arbutin Serum', category: 'Serums', description: 'Everyday serums essential from Skincare With Happy.', price: 18.99, currency: 'USD', stock: 25, rating: 5, active: true, image_url: '/images/products/starter-08.svg' },    { name: 'Retinol Renewal Serum', category: 'Serums', description: 'Everyday serums essential from Skincare With Happy.', price: 21.99, currency: 'USD', stock: 25, rating: 5, active: true, image_url: '/images/products/starter-09.svg' },    { name: 'Azelaic Acid Treatment', category: 'Treatments', description: 'Everyday treatments essential from Skincare With Happy.', price: 20.99, currency: 'USD', stock: 25, rating: 5, active: true, image_url: '/images/products/starter-10.svg' },    { name: 'Glycolic Acid Toner', category: 'Toners', description: 'Everyday toners essential from Skincare With Happy.', price: 18.99, currency: 'USD', stock: 25, rating: 5, active: true, image_url: '/images/products/starter-11.svg' },    { name: 'Hydrating Toner', category: 'Toners', description: 'Everyday toners essential from Skincare With Happy.', price: 14.99, currency: 'USD', stock: 25, rating: 5, active: true, image_url: '/images/products/starter-12.svg' },    { name: 'Soothing Essence', category: 'Toners', description: 'Everyday toners essential from Skincare With Happy.', price: 17.49, currency: 'USD', stock: 25, rating: 5, active: true, image_url: '/images/products/starter-13.svg' },    { name: 'Daily Moisturizing Cream', category: 'Moisturizers', description: 'Everyday moisturizers essential from Skincare With Happy.', price: 15.99, currency: 'USD', stock: 25, rating: 5, active: true, image_url: '/images/products/starter-14.svg' },    { name: 'Ceramide Barrier Cream', category: 'Moisturizers', description: 'Everyday moisturizers essential from Skincare With Happy.', price: 18.99, currency: 'USD', stock: 25, rating: 5, active: true, image_url: '/images/products/starter-15.svg' },    { name: 'Oil-Free Gel Moisturizer', category: 'Moisturizers', description: 'Everyday moisturizers essential from Skincare With Happy.', price: 16.99, currency: 'USD', stock: 25, rating: 5, active: true, image_url: '/images/products/starter-16.svg' },    { name: 'Shea Body Butter', category: 'Body Care', description: 'Everyday body care essential from Skincare With Happy.', price: 13.99, currency: 'USD', stock: 25, rating: 5, active: true, image_url: '/images/products/starter-17.svg' },    { name: 'Nourishing Body Lotion', category: 'Body Care', description: 'Everyday body care essential from Skincare With Happy.', price: 12.99, currency: 'USD', stock: 25, rating: 5, active: true, image_url: '/images/products/starter-18.svg' },    { name: 'Exfoliating Body Wash', category: 'Body Care', description: 'Everyday body care essential from Skincare With Happy.', price: 11.99, currency: 'USD', stock: 25, rating: 5, active: true, image_url: '/images/products/starter-19.svg' },    { name: 'Gentle Shower Gel', category: 'Body Care', description: 'Everyday body care essential from Skincare With Happy.', price: 10.99, currency: 'USD', stock: 25, rating: 5, active: true, image_url: '/images/products/starter-20.svg' },    { name: 'Daily SPF 50 Sunscreen', category: 'Sunscreen', description: 'Everyday sunscreen essential from Skincare With Happy.', price: 18.99, currency: 'USD', stock: 25, rating: 5, active: true, image_url: '/images/products/starter-21.svg' },    { name: 'Invisible SPF 50 Gel', category: 'Sunscreen', description: 'Everyday sunscreen essential from Skincare With Happy.', price: 20.99, currency: 'USD', stock: 25, rating: 5, active: true, image_url: '/images/products/starter-22.svg' },    { name: 'Mineral SPF 50 Cream', category: 'Sunscreen', description: 'Everyday sunscreen essential from Skincare With Happy.', price: 19.49, currency: 'USD', stock: 25, rating: 5, active: true, image_url: '/images/products/starter-23.svg' },    { name: 'Lip Repair Balm', category: 'Lip Care', description: 'Everyday lip care essential from Skincare With Happy.', price: 7.99, currency: 'USD', stock: 25, rating: 5, active: true, image_url: '/images/products/starter-24.svg' },    { name: 'Overnight Lip Mask', category: 'Lip Care', description: 'Everyday lip care essential from Skincare With Happy.', price: 9.99, currency: 'USD', stock: 25, rating: 5, active: true, image_url: '/images/products/starter-25.svg' },    { name: 'Eye Repair Cream', category: 'Treatments', description: 'Everyday treatments essential from Skincare With Happy.', price: 21.99, currency: 'USD', stock: 25, rating: 5, active: true, image_url: '/images/products/starter-26.svg' },    { name: 'Clay Purifying Mask', category: 'Masks', description: 'Everyday masks essential from Skincare With Happy.', price: 13.99, currency: 'USD', stock: 25, rating: 5, active: true, image_url: '/images/products/starter-27.svg' },    { name: 'Hydrating Sheet Mask Set', category: 'Masks', description: 'Everyday masks essential from Skincare With Happy.', price: 11.99, currency: 'USD', stock: 25, rating: 5, active: true, image_url: '/images/products/starter-28.svg' },    { name: 'Complete Glow Routine Set', category: 'Sets', description: 'Everyday sets essential from Skincare With Happy.', price: 49.99, currency: 'USD', stock: 25, rating: 5, active: true, image_url: '/images/products/starter-29.svg' },    { name: 'Sensitive Skin Care Set', category: 'Sets', description: 'Everyday sets essential from Skincare With Happy.', price: 45.99, currency: 'USD', stock: 25, rating: 5, active: true, image_url: '/images/products/starter-30.svg' }
  ];
  for (const item of starterProducts) {
    const slug = slugify(item.name);
    await Product.updateOne({ slug }, { $setOnInsert: { ...item, slug, old_price: null } }, { upsert: true });
  }
}

async function migrateLegacyProductPrices() {
  const legacy = await Product.find({ $or: [{ currency: { $exists: false } }, { currency: 'NGN' }] });
  for (const product of legacy) {
    product.price = Number((Number(product.price || 0) / USD_TO_NGN_RATE).toFixed(2));
    if (product.old_price != null) product.old_price = Number((Number(product.old_price || 0) / USD_TO_NGN_RATE).toFixed(2));
    product.currency = 'USD';
    await product.save();
  }
  if (legacy.length) console.log(`Converted ${legacy.length} legacy product price(s) from NGN to USD using ${USD_TO_NGN_RATE}.`);
}

async function connectMongo() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (mongoConnectionPromise) return mongoConnectionPromise;
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured');
  if (!JWT_SECRET) throw new Error('JWT_SECRET is not configured');
  mongoConnectionPromise = mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 })
    .then(async () => {
      await migrateLegacyProductPrices();
      await ensureAdmin();
      await ensureStarterProducts();
      console.log('MongoDB connected');
      return mongoose.connection;
    })
    .catch(error => {
      mongoConnectionPromise = null;
      throw error;
    });
  return mongoConnectionPromise;
}

// Vercel/serverless requests can arrive before the initial async startup connection
// has finished. Ensure every API request has a live MongoDB connection first.
app.use('/api', async (_req, res, next) => {
  try {
    await connectMongo();
    next();
  } catch (error) {
    console.error('Database connection error:', error.message);
    res.status(503).json({ error: 'The store service is temporarily unavailable. Please try again shortly.' });
  }
});

app.get('/api/health', async (_req, res) => {
  res.json({ ok: mongoose.connection.readyState === 1, service: 'Skincare With Happy API', database: 'MongoDB' });
});
app.get('/', (_req, res) => res.json({ ok: true, service: 'Skincare With Happy API', status: 'online', frontend: frontendUrl }));

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, phone = '', address = '', pin, pinConfirm } = req.body || {};
    if (!name || !email || !password || password.length < 8) return res.status(400).json({ error: 'Name, valid email and password of at least 8 characters are required' });
    if (!/^\d{4,6}$/.test(String(pin || '')) || String(pin) !== String(pinConfirm || '')) return res.status(400).json({ error: 'Create a matching 4–6 digit PIN' });
    const normalized = cleanEmail(email);
    if (await User.findOne({ email: normalized })) return res.status(409).json({ error: 'An account with this email already exists' });
    const [passwordHash, pinHash] = await Promise.all([bcrypt.hash(password, 12), bcrypt.hash(String(pin), 12)]);
    const user = await User.create({ name: String(name).trim(), email: normalized, passwordHash, pinHash, phone, address, role: 'user' });
    res.status(201).json({ ok: true, message: 'Account created. Please sign in with your email and password.' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Unable to create account' }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const user = await User.findOne({ email: cleanEmail(email) });
    if (!user || !(await bcrypt.compare(String(password || ''), user.passwordHash))) return res.status(401).json({ error: 'Invalid email or password' });
    const userData = { id: user._id, name: user.name, email: user.email, role: user.role };
    const pendingToken = jwt.sign({ id: String(user._id), role: user.role, email: user.email, name: user.name, pinPending: true }, JWT_SECRET, { expiresIn: '10m' });
    res.json({ pinRequired: Boolean(user.pinHash), pinSetupRequired: !user.pinHash, pendingToken, user: userData });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Unable to log in' }); }
});

app.post('/api/auth/pin/verify', authPending, async (req, res) => {
  try {
    const pin = String(req.body?.pin || '');
    if (!/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: 'Enter your 4–6 digit PIN' });
    const user = await User.findById(req.user.id);
    if (!user?.pinHash) return res.status(400).json({ error: 'PIN setup is required' });
    if (!(await bcrypt.compare(pin, user.pinHash))) return res.status(401).json({ error: 'Incorrect PIN' });
    res.json({ token: signUser(user), user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Unable to verify PIN' }); }
});

app.post('/api/auth/pin/set-pending', authPending, async (req, res) => {
  try {
    const pin = String(req.body?.pin || '');
    const pinConfirm = String(req.body?.pinConfirm || '');
    if (!/^\d{4,6}$/.test(pin) || pin !== pinConfirm) return res.status(400).json({ error: 'Create a matching 4–6 digit PIN' });
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.pinHash = await bcrypt.hash(pin, 12);
    await user.save();
    res.json({ token: signUser(user), user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Unable to set PIN' }); }
});

app.post('/api/auth/pin/set', auth, async (req, res) => {
  try {
    const pin = String(req.body?.pin || '');
    const pinConfirm = String(req.body?.pinConfirm || '');
    if (!/^\d{4,6}$/.test(pin) || pin !== pinConfirm) return res.status(400).json({ error: 'Create a matching 4–6 digit PIN' });
    const user = await User.findById(req.user.id);
    user.pinHash = await bcrypt.hash(pin, 12);
    await user.save();
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Unable to set PIN' }); }
});

app.get('/api/auth/me', auth, async (req, res) => {
  const user = await User.findById(req.user.id).select('-passwordHash');
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

app.get('/api/products', async (req, res) => {
  try {
    const filter = { active: true };
    const q = String(req.query.q || '').trim();
    const category = String(req.query.category || '').trim();
    if (category && category !== 'All') filter.category = category;
    if (q) filter.$or = [{ name: new RegExp(q, 'i') }, { category: new RegExp(q, 'i') }, { description: new RegExp(q, 'i') }];
    res.json(await Product.find(filter).sort({ createdAt: -1 }));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Unable to load products' }); }
});
app.get('/api/products/:slug', async (req, res) => {
  const product = await Product.findOne({ slug: req.params.slug, active: true });
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

app.get('/api/admin/products', auth, adminOnly, async (_req, res) => res.json(await Product.find().sort({ createdAt: -1 })));
app.post('/api/admin/products', auth, adminOnly, upload.single('image'), async (req, res) => {
  try {
    const { name, category, description, price, old_price, stock, active = 'true' } = req.body;
    if (!name || !price) return res.status(400).json({ error: 'Product name and price are required' });
    let slug = slugify(name), n = 1;
    while (await Product.exists({ slug })) slug = `${slugify(name)}-${n++}`;
    let image_url = '/images/products/product-placeholder.svg';
    if (req.file) image_url = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    const product = await Product.create({ name, slug, category, description, price: Number(price), old_price: old_price ? Number(old_price) : null, currency: 'USD', stock: Number(stock || 0), active: active !== 'false', image_url });
    res.status(201).json(product);
  } catch (e) { console.error(e); res.status(400).json({ error: e.message || 'Unable to create product' }); }
});
app.put('/api/admin/products/:id', auth, adminOnly, upload.single('image'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id); if (!product) return res.status(404).json({ error: 'Product not found' });
    const fields = ['name','category','description']; fields.forEach(f => { if (req.body[f] !== undefined) product[f] = req.body[f]; });
    if (req.body.price !== undefined) product.price = Number(req.body.price);
    product.currency = 'USD';
    if (req.body.old_price !== undefined) product.old_price = req.body.old_price ? Number(req.body.old_price) : null;
    if (req.body.stock !== undefined) product.stock = Number(req.body.stock);
    if (req.body.active !== undefined) product.active = String(req.body.active) !== 'false';
    if (req.file) product.image_url = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    await product.save(); res.json(product);
  } catch (e) { console.error(e); res.status(400).json({ error: 'Unable to update product' }); }
});
app.delete('/api/admin/products/:id', auth, adminOnly, async (req, res) => { await Product.findByIdAndDelete(req.params.id); res.json({ ok: true }); });

async function verifyPaystack(reference) {
  if (!process.env.PAYSTACK_SECRET_KEY) throw new Error('PAYSTACK_SECRET_KEY is not configured');
  const r = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } });
  const data = await r.json(); if (!r.ok || !data.status) throw new Error(data.message || 'Paystack verification failed'); return data.data;
}

async function completePaidOrder(reference, tx) {
  const order = await Order.findOne({ reference }); if (!order) throw new Error('Order not found');
  if (order.paymentStatus === 'paid') return order;
  if (tx.status !== 'success' || tx.currency !== order.currency || Number(tx.amount) !== Math.round(order.total * 100)) throw new Error('Payment could not be verified');
  if (tx.customer?.email && cleanEmail(tx.customer.email) !== cleanEmail(order.customer.email)) throw new Error('Payment customer email does not match the order');
  for (const item of order.items) {
    const p = await Product.findById(item.productId);
    if (!p || !p.active || p.stock < item.quantity) throw new Error(`${item.name} is no longer available in the requested quantity`);
  }
  for (const item of order.items) await Product.findByIdAndUpdate(item.productId, { $inc: { stock: -item.quantity } });
  const actualPaystackFee = Number(tx.fees || 0) / 100;
  const configuredReserve = Math.round(Number(order.total || 0) * (PAYMENT_RESERVE_RATE / 100) * 100) / 100;
  // The configured 4% is the amount reserved for payment processing/accounting.
  // The remaining 96% is credited to the store's internal admin wallet. Paystack's
  // actual fee is recorded separately for reconciliation and may differ from 4%.
  const retainedForPayment = configuredReserve;
  order.paymentStatus = 'paid'; order.status = 'processing'; order.paymentReference = tx.reference; order.paymentMethod = 'paystack';
  order.paystackFee = actualPaystackFee; order.paymentReserveRate = PAYMENT_RESERVE_RATE;
  order.paymentReserve = retainedForPayment; order.netAmount = Math.max(0, Number(order.total || 0) - retainedForPayment);
  order.adminWalletAmount = order.netAmount; order.paidAt = tx.paid_at ? new Date(tx.paid_at) : new Date();
  await order.save();
  await creditAdminWallet(`ORDER-${order.reference}`, order.adminWalletAmount, `96% store proceeds from Paystack order ${order.reference}`, order.reference);
  return order;
}

app.post('/api/orders', auth, async (req, res) => {
  try {
    const { customer, items, payment_method = 'paystack' } = req.body || {};
    if (!customer?.name || !customer?.email || !customer?.phone || !customer?.address || !Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Complete customer details and cart items are required' });
    if (cleanEmail(customer.email) !== cleanEmail(req.user.email)) return res.status(400).json({ error: 'Checkout email must match the signed-in account' });
    if (!['paystack','wallet'].includes(payment_method)) return res.status(400).json({ error: 'Unsupported payment method' });
    let totalUsd = 0, orderItems = [];
    for (const item of items) {
      const p = await Product.findOne({ _id: item.product_id, active: true });
      const qty = Number(item.quantity);
      if (!p || !Number.isInteger(qty) || qty < 1 || p.stock < qty) return res.status(400).json({ error: `${p?.name || 'Product'} is unavailable in the requested quantity` });
      totalUsd += Number(p.price || 0) * qty;
      orderItems.push({ productId: p._id, name: p.name, quantity: qty, unitPrice: Number(p.price || 0) });
    }
    totalUsd = Number(totalUsd.toFixed(2));
    const total = usdToNgn(totalUsd);
    const reference = makeReference('SWH');
    if (payment_method === 'wallet') {
      const reserveUsd = Number((totalUsd * PAYMENT_RESERVE_RATE / 100).toFixed(2));
      const adminUsd = Number((totalUsd - reserveUsd).toFixed(2));
      const updatedUser = await User.findOneAndUpdate({ _id: req.user.id, walletBalanceUsd: { $gte: totalUsd } }, { $inc: { walletBalanceUsd: -totalUsd } }, { new: true });
      if (!updatedUser) return res.status(400).json({ error: 'Insufficient wallet balance. Deposit funds before paying with your wallet.' });
      const order = await Order.create({ reference, userId: req.user.id, customer: { ...customer, email: cleanEmail(customer.email) }, items: orderItems, total, totalUsd, fxRate: USD_TO_NGN_RATE, paymentMethod: 'wallet', paymentStatus: 'paid', status: 'processing', paymentReference: reference, paymentReserveRate: PAYMENT_RESERVE_RATE, paymentReserve: usdToNgn(reserveUsd), netAmount: usdToNgn(adminUsd), adminWalletAmount: usdToNgn(adminUsd), paidAt: new Date() });
      await creditAdminWallet(`ORDER-${order.reference}`, order.adminWalletAmount, `96% store proceeds from wallet order ${order.reference}`, order.reference);
      try {
        for (const item of orderItems) await Product.findByIdAndUpdate(item.productId, { $inc: { stock: -item.quantity } });
      } catch (stockError) {
        await User.findByIdAndUpdate(req.user.id, { $inc: { walletBalanceUsd: totalUsd } });
        await Order.findByIdAndDelete(order._id);
        throw stockError;
      }
      return res.status(201).json({ ok: true, payment_method: 'wallet', order, wallet_balance_usd: updatedUser.walletBalanceUsd });
    }
    const order = await Order.create({ reference, userId: req.user.id, customer: { ...customer, email: cleanEmail(customer.email) }, items: orderItems, total, totalUsd, fxRate: USD_TO_NGN_RATE, paymentMethod: 'paystack' });
    if (!process.env.PAYSTACK_PUBLIC_KEY) throw new Error('PAYSTACK_PUBLIC_KEY is not configured');
    res.status(201).json({ order, authorization_url: null, reference, display_currency: 'USD', settlement_currency: PAYSTACK_CURRENCY, usd_to_ngn_rate: USD_TO_NGN_RATE, paystack_public_key: process.env.PAYSTACK_PUBLIC_KEY, paystack_amount: Math.round(total * 100), payment_reserve_rate: PAYMENT_RESERVE_RATE });
  } catch (e) { console.error(e); res.status(400).json({ error: e.message || 'Unable to create order' }); }
});

app.get('/api/user/wallet', auth, async (req, res) => {
  const user = await User.findById(req.user.id).select('walletBalanceUsd');
  if (!user) return res.status(404).json({ error: 'User not found' });
  const deposits = await Deposit.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(10);
  const orders = await Order.find({ userId: req.user.id, paymentMethod: 'wallet' }).sort({ createdAt: -1 }).limit(10);
  res.json({ balanceUsd: Number(user.walletBalanceUsd || 0), deposits, walletOrders: orders, usdToNgnRate: USD_TO_NGN_RATE, paymentReserveRate: PAYMENT_RESERVE_RATE });
});

app.post('/api/wallet/deposit', auth, async (req, res) => {
  try {
    const amountUsd = Number(req.body?.amount_usd);
    if (!Number.isFinite(amountUsd) || amountUsd < 1) return res.status(400).json({ error: 'Enter a deposit amount of at least $1.00' });
    if (!process.env.PAYSTACK_SECRET_KEY) throw new Error('PAYSTACK_SECRET_KEY is not configured');
    const amountNgn = usdToNgn(amountUsd);
    const reserveUsd = Number((amountUsd * PAYMENT_RESERVE_RATE / 100).toFixed(2));
    const creditedUsd = Number((amountUsd - reserveUsd).toFixed(2));
    const reference = makeReference('SWH-DEP');
    const user = await User.findById(req.user.id).select('email');
    const deposit = await Deposit.create({ reference, userId: req.user.id, amountUsd, amountNgn, paymentReserveRate: PAYMENT_RESERVE_RATE, paymentReserveUsd: reserveUsd, creditedUsd });
    const r = await fetch('https://api.paystack.co/transaction/initialize', { method: 'POST', headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: cleanEmail(user.email), amount: Math.round(amountNgn * 100), currency: PAYSTACK_CURRENCY, reference, ...(process.env.PAYSTACK_CALLBACK_URL || backendUrl ? { callback_url: process.env.PAYSTACK_CALLBACK_URL || `${backendUrl}/api/paystack/callback` } : {}), metadata: { deposit_reference: reference, type: 'wallet_deposit', amount_usd: amountUsd, credited_usd: creditedUsd, payment_reserve_rate: PAYMENT_RESERVE_RATE, store: 'Skincare With Happy' } }) });
    const data = await r.json();
    if (!r.ok || !data.status) { await Deposit.findByIdAndDelete(deposit._id); throw new Error(data.message || 'Deposit initialization failed'); }
    res.status(201).json({ ok: true, reference, authorization_url: data.data.authorization_url, amount_usd: amountUsd, amount_ngn: amountNgn, credited_usd: creditedUsd, payment_reserve_usd: reserveUsd });
  } catch (e) { console.error(e); res.status(400).json({ error: e.message || 'Unable to start wallet deposit' }); }
});

async function completeWalletDeposit(reference, tx) {
  const deposit = await Deposit.findOne({ reference });
  if (!deposit) throw new Error('Wallet deposit not found');
  if (deposit.status === 'paid') return deposit;
  if (tx.status !== 'success' || tx.currency !== PAYSTACK_CURRENCY || Number(tx.amount) !== Math.round(Number(deposit.amountNgn) * 100)) throw new Error('Wallet deposit could not be verified');
  const user = await User.findOneAndUpdate({ _id: deposit.userId }, { $inc: { walletBalanceUsd: Number(deposit.creditedUsd) } }, { new: true });
  if (!user) throw new Error('Wallet owner not found');
  deposit.status = 'paid'; deposit.paymentReference = tx.reference; deposit.paystackFee = Number(tx.fees || 0) / 100; deposit.paidAt = tx.paid_at ? new Date(tx.paid_at) : new Date();
  await deposit.save();
  return deposit;
}

app.post('/api/wallet/deposit/verify/:reference', auth, async (req, res) => {
  try { const deposit = await Deposit.findOne({ reference: req.params.reference, userId: req.user.id }); if (!deposit) return res.status(404).json({ error: 'Wallet deposit not found' }); const tx = await verifyPaystack(req.params.reference); const done = await completeWalletDeposit(req.params.reference, tx); res.json({ ok: true, deposit: done, wallet_balance_usd: Number((await User.findById(req.user.id).select('walletBalanceUsd')).walletBalanceUsd || 0) }); }
  catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

app.post('/api/paystack/initialize/:reference', auth, async (req, res) => {
  try {
    if (!process.env.PAYSTACK_SECRET_KEY) throw new Error('PAYSTACK_SECRET_KEY is not configured');
    const order = await Order.findOne({ reference: req.params.reference, userId: req.user.id });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.paymentStatus === 'paid') return res.status(400).json({ error: 'Order is already paid' });
    const r = await fetch('https://api.paystack.co/transaction/initialize', { method: 'POST', headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: cleanEmail(order.customer.email), amount: Math.round(order.total * 100), currency: PAYSTACK_CURRENCY, reference: order.reference, ...(process.env.PAYSTACK_CALLBACK_URL || backendUrl ? { callback_url: process.env.PAYSTACK_CALLBACK_URL || `${backendUrl}/api/paystack/callback` } : {}), metadata: { order_reference: order.reference, store: 'Skincare With Happy', display_currency: 'USD', settlement_currency: PAYSTACK_CURRENCY, usd_to_ngn_rate: USD_TO_NGN_RATE } }) });
    const data = await r.json(); if (!r.ok || !data.status) throw new Error(data.message || 'Payment initialization failed');
    res.json({ authorization_url: data.data.authorization_url, reference: order.reference });
  } catch (e) { res.status(400).json({ error: e.message || 'Payment initialization failed' }); }
});

app.post('/api/paystack/verify/:reference', async (req, res) => { try { const tx = await verifyPaystack(req.params.reference); const order = await completePaidOrder(req.params.reference, tx); res.json({ ok: true, order }); } catch (e) { res.status(400).json({ ok: false, error: e.message }); } });
app.get('/api/paystack/callback', async (req, res) => { const ref = String(req.query.reference || ''); try { if (ref) { const tx = await verifyPaystack(ref); if (ref.startsWith('SWH-DEP-')) await completeWalletDeposit(ref, tx); else await completePaidOrder(ref, tx); } if (!frontendUrl) return res.json({ ok: Boolean(ref), reference: ref });
    res.redirect(`${frontendUrl}${ref.startsWith('SWH-DEP-') ? '/dashboard/' : '/cart/'}?payment=${ref ? 'success' : 'missing'}&reference=${encodeURIComponent(ref)}`); } catch (e) { if (!frontendUrl) return res.status(400).json({ ok: false, reference: ref, error: e.message });
    res.redirect(`${frontendUrl}${ref.startsWith('SWH-DEP-') ? '/dashboard/' : '/cart/'}?payment=failed&reference=${encodeURIComponent(ref)}`); } });
app.post('/api/paystack/webhook', async (req, res) => { const sig = req.headers['x-paystack-signature']; if (!sig || !process.env.PAYSTACK_SECRET_KEY) return res.status(401).send('Unauthorized'); const expected = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(req.rawBody || Buffer.from(JSON.stringify(req.body))).digest('hex'); if (sig !== expected) return res.status(401).send('Invalid signature'); res.sendStatus(200); if (req.body?.event === 'charge.success') { const ref = String(req.body.data.reference || ''); (ref.startsWith('SWH-DEP-') ? completeWalletDeposit(ref, req.body.data) : completePaidOrder(ref, req.body.data)).catch(console.error); } });

app.get('/api/user/orders', auth, async (req, res) => res.json(await Order.find({ userId: req.user.id }).sort({ createdAt: -1 })));
app.get('/api/admin/orders', auth, adminOnly, async (_req, res) => res.json(await Order.find().sort({ createdAt: -1 })));
app.patch('/api/admin/orders/:id/status', auth, adminOnly, async (req, res) => { const order = await Order.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true }); res.json(order); });

app.get('/api/admin/overview', auth, adminOnly, async (_req, res) => {
  const [orders, paid, products, users, withdrawals, paidOrders] = await Promise.all([Order.countDocuments(), Order.countDocuments({ paymentStatus: 'paid' }), Product.countDocuments(), User.countDocuments({ role: 'user' }), Withdrawal.find({ status: { $in: ['pending','success'] } }), Order.find({ paymentStatus: 'paid' }).select('total totalUsd fxRate paystackFee netAmount paymentReserve adminWalletAmount')]);
  const grossRevenue = paidOrders.reduce((s, o) => s + Number(o.total || 0), 0);
  const grossRevenueUsd = paidOrders.reduce((s, o) => s + Number(o.totalUsd || (Number(o.total || 0) / USD_TO_NGN_RATE)), 0);
  const fees = paidOrders.reduce((s, o) => s + Number(o.paystackFee || 0), 0);
  const retained = paidOrders.reduce((s, o) => s + Number(o.paymentReserve || 0), 0);
  const ledgerBalance = await getAdminWalletBalance();
  const withdrawn = withdrawals.reduce((s, w) => s + ((w.status === 'success' || w.status === 'pending') ? Number(w.amount || 0) : 0), 0);
  const availableBalance = Math.max(0, ledgerBalance);
  res.json({ orders, paidOrders: paid, products, users, grossRevenue, grossRevenueUsd, fees, netRevenue: ledgerBalance, revenue: grossRevenue, availableBalance, availableBalanceUsd: availableBalance / USD_TO_NGN_RATE, withdrawn, usdToNgnRate: USD_TO_NGN_RATE, paymentReserveRate: PAYMENT_RESERVE_RATE, retainedForPayment: retained, withdrawalAccount: { bankName: ADMIN_WITHDRAWAL_BANK_NAME, accountNumber: ADMIN_WITHDRAWAL_ACCOUNT_NUMBER, accountName: ADMIN_WITHDRAWAL_ACCOUNT_NAME } });
});

app.get('/api/admin/banks', auth, adminOnly, async (_req, res) => { const r = await fetch('https://api.paystack.co/bank?country=nigeria&currency=NGN&perPage=100'); const data = await r.json(); res.status(r.ok ? 200 : 400).json(data); });
app.post('/api/admin/verify-account', auth, adminOnly, async (req, res) => { if (!process.env.PAYSTACK_SECRET_KEY) return res.status(500).json({ error: 'PAYSTACK_SECRET_KEY is not configured' }); const { account_number, bank_code } = req.body; const r = await fetch(`https://api.paystack.co/bank/resolve?account_number=${encodeURIComponent(account_number)}&bank_code=${encodeURIComponent(bank_code)}`, { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }); const data = await r.json(); res.status(r.ok ? 200 : 400).json(data); });
app.get('/api/admin/withdrawal-account', auth, adminOnly, async (_req, res) => {
  try {
    const bank = await resolveConfiguredWithdrawalBank();
    res.json({ bankName: bank.name, bankCode: bank.code, accountNumber: ADMIN_WITHDRAWAL_ACCOUNT_NUMBER, accountName: ADMIN_WITHDRAWAL_ACCOUNT_NAME });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/admin/withdraw', auth, adminOnly, async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    const configuredBank = await resolveConfiguredWithdrawalBank();
    const bankCode = String(req.body.bank_code || configuredBank.code);
    const accountNumber = String(req.body.account_number || ADMIN_WITHDRAWAL_ACCOUNT_NUMBER);
    const bankName = String(req.body.bank_name || configuredBank.name);
    const accountName = String(req.body.account_name || ADMIN_WITHDRAWAL_ACCOUNT_NAME);
    if (!amount || amount <= 0 || !bankCode || !accountNumber || !accountName) return res.status(400).json({ error: 'Complete bank and amount details are required' });
    const available = await getAdminWalletBalance();
    if (amount > available) return res.status(400).json({ error: `Insufficient available balance. Available: ₦${available.toLocaleString('en-NG')}` });
    if (!process.env.PAYSTACK_SECRET_KEY) return res.status(500).json({ error: 'PAYSTACK_SECRET_KEY is not configured' });
    const recipientRef = makeReference('SWH-REC');
    const recipientResponse = await fetch('https://api.paystack.co/transferrecipient', { method:'POST', headers:{Authorization:`Bearer ${process.env.PAYSTACK_SECRET_KEY}`,'Content-Type':'application/json'}, body:JSON.stringify({ type:'nuban', name:accountName, account_number:accountNumber, bank_code:bankCode, currency:'NGN', reference:recipientRef }) });
    const recipientData = await recipientResponse.json(); if (!recipientResponse.ok || !recipientData.status) throw new Error(recipientData.message || 'Unable to create transfer recipient');
    const transferRef = makeReference('SWH-WD');
    const transferResponse = await fetch('https://api.paystack.co/transfer', { method:'POST', headers:{Authorization:`Bearer ${process.env.PAYSTACK_SECRET_KEY}`,'Content-Type':'application/json'}, body:JSON.stringify({ source:'balance', amount:Math.round(amount*100), recipient:recipientData.data.recipient_code, reason:'Skincare With Happy admin withdrawal', reference:transferRef }) });
    const transferData = await transferResponse.json(); if (!transferResponse.ok || !transferData.status) throw new Error(transferData.message || 'Withdrawal failed');
    const wd = await Withdrawal.create({ amount, bankCode, bankName, accountNumber, accountName, recipientCode:recipientData.data.recipient_code, transferCode:transferData.data.transfer_code, reference:transferRef, status:transferData.data.status === 'success' ? 'success' : 'pending', initiatedBy:req.user.id });
    await AdminWalletLedger.create({ reference: `WD-${transferRef}`, type: 'debit', amount, description: `Admin withdrawal to ${accountName}`, withdrawalReference: transferRef });
    res.json({ ok:true, withdrawal:wd });
  } catch(e) { console.error(e); res.status(400).json({ error:e.message || 'Withdrawal failed' }); }
});
app.get('/api/admin/withdrawals', auth, adminOnly, async (_req,res)=>res.json(await Withdrawal.find().sort({createdAt:-1})));

async function start() { try { await connectMongo(); if (process.env.NODE_ENV !== 'production') app.listen(PORT,()=>console.log(`Skincare With Happy API running on ${PORT}`)); } catch(e) { console.error('Startup error:',e.message); if (process.env.NODE_ENV !== 'production') process.exit(1); } }
start();
module.exports = app;
