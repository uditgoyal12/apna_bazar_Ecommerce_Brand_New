const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const { client, db, cloudinary } = require('./config.cjs');
const app = express();
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '100kb' }), cookieParser());
const origins = new Set([
  ...(process.env.FRONTEND_URL || 'http://localhost:3000,http://127.0.0.1:3000').split(','),
  'https://ecoproject-rho.vercel.app',
].map(origin => origin.trim()).filter(Boolean));
app.use('/api', (req, res, next) => {
  if (req.headers.origin && !origins.has(req.headers.origin) && req.headers.origin !== `${req.protocol}://${req.get('host')}`) return res.status(403).json({ error: 'Origin not allowed' });
  if (req.headers.origin) { res.header('Access-Control-Allow-Origin', req.headers.origin); res.header('Vary', 'Origin'); res.header('Access-Control-Allow-Credentials', 'true'); }
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With, Idempotency-Key');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (!['GET','HEAD'].includes(req.method) && req.get('X-Requested-With') !== 'ApnaBazar') return res.status(403).json({ error: 'Missing request verification' });
  next();
});
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const fail = (message, status = 400) => { const error = new Error(message); error.status = status; throw error; };
const str = (v, max = 200) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const email = v => { const x = str(v).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)) fail('Enter a valid email'); return x; };
const publicUser = u => { const { passwordHash, password, _id, ...safe } = u; return safe; };
const production = process.env.NODE_ENV === 'production';
const cookieOptions = {
  httpOnly: true,
  sameSite: process.env.COOKIE_SAME_SITE || (production ? 'none' : 'lax'),
  secure: production,
  path: '/',
  maxAge: 7 * 86400000,
};
async function sessionFor(res, user) {
  const token = crypto.randomBytes(32).toString('hex');
  await db.collection('sessions').insertOne({ token: crypto.createHash('sha256').update(token).digest('hex'), user: user.id, expires: new Date(Date.now() + cookieOptions.maxAge) });
  res.cookie('ab_session', token, cookieOptions);
}
app.use('/api', wrap(async (req, res, next) => {
  if (req.cookies.ab_session) {
    const session = await db.collection('sessions').findOne({ token: crypto.createHash('sha256').update(req.cookies.ab_session).digest('hex'), expires: { $gt: new Date() } });
    if (session) req.user = await db.collection('users').findOne({ id: session.user, active: { $ne: false } });
  }
  next();
}));
const auth = (req, res, next) => req.user ? next() : res.status(401).json({ error: 'Please sign in to continue' });
const staffRoles = new Set(['Admin', 'Super Admin']);
const userRoles = new Set(['Buyer', 'Admin', 'Super Admin']);
const admin = (req, res, next) => staffRoles.has(req.user?.role) ? next() : res.status(403).json({ error: 'Administrator access required' });
const requireSuperAdmin = req => { if (req.user?.role !== 'Super Admin') fail('Super Admin access required', 403); };
const authLimit = rateLimit({ windowMs: 15 * 60000, limit: 40, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many attempts. Please try again later.' } });
app.get('/api/health', wrap(async (req, res) => { await db.command({ ping: 1 }); res.json({ status: 'ok', database: 'mongodb', images: 'cloudinary' }); }));
app.get('/api/config', (req, res) => res.json({ name: process.env.REACT_APP_SITE_NAME || 'APNA BAZAR', email: process.env.REACT_APP_EMAIL || '', phone: process.env.REACT_APP_PHONE || '', address: process.env.REACT_APP_ADDRESS || '', freeShipping: 1999, shipping: 99, paymentMethods: ['cod'] }));
app.post('/api/auth/signup', authLimit, wrap(async (req, res) => {
  const name = str(req.body.name, 80), mail = email(req.body.email), password = str(req.body.password, 128);
  if (name.length < 2 || password.length < 8) fail('Name and a password of at least 8 characters are required');
  const user = { id: crypto.randomUUID(), name, email: mail, passwordHash: await bcrypt.hash(password, 12), role: 'Buyer', active: true, createdAt: new Date() };
  await db.collection('users').insertOne(user); await sessionFor(res, user); res.status(201).json(publicUser(user));
}));
app.post('/api/auth/login', authLimit, wrap(async (req, res) => {
  const user = await db.collection('users').findOne({ email: email(req.body.email), active: { $ne: false } });
  if (!user || !await bcrypt.compare(str(req.body.password, 128), user.passwordHash)) fail('Email or password is incorrect', 401);
  await sessionFor(res, user); res.json(publicUser(user));
}));
app.post('/api/auth/logout', wrap(async (req, res) => {
  if (req.cookies.ab_session) await db.collection('sessions').deleteOne({ token: crypto.createHash('sha256').update(req.cookies.ab_session).digest('hex') });
  res.clearCookie('ab_session', { ...cookieOptions, maxAge: undefined }); res.json({ ok: true });
}));
app.get('/api/auth/me', (req, res) => res.json(req.user ? publicUser(req.user) : null));
app.patch('/api/auth/me', auth, wrap(async (req, res) => {
  const fields = {}; for (const key of ['name','phone','address','city','state','pin']) if (key in req.body) fields[key] = str(req.body[key]);
  if ('name' in fields && fields.name.length < 2) fail('Enter your name');
  await db.collection('users').updateOne({ id: req.user.id }, { $set: fields }); res.json(publicUser({ ...req.user, ...fields }));
}));
app.get('/api/products', wrap(async (req, res) => {
  const q = { active: { $ne: false } };
  for (const key of ['maincategory','subcategory','brand']) if (str(req.query[key])) q[key] = str(req.query[key]);
  if (req.query.search) q.name = { $regex: str(req.query.search, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  if (req.query.inStock === 'true') q.stockQuantity = { $gt: 0 };
  if (req.query.sale === 'true') q.discount = { $gt: 0 };
  const sorts = { newest: { createdAt: -1, id: 1 }, 'price-low': { finalPrice: 1 }, 'price-high': { finalPrice: -1 }, name: { name: 1 } };
  const page = Math.max(1, Math.min(10000, parseInt(req.query.page) || 1)), limit = Math.min(60, Math.max(1, parseInt(req.query.limit) || 12));
  const [items, total] = await Promise.all([db.collection('products').find(q, { projection: { _id: 0 } }).sort(sorts[req.query.sort] || sorts.newest).skip((page - 1) * limit).limit(limit).toArray(), db.collection('products').countDocuments(q)]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
}));
app.get('/api/products/:id', wrap(async (req, res) => { const item = await db.collection('products').findOne({ id: req.params.id, active: { $ne: false } }, { projection: { _id: 0 } }); if (!item) fail('Product not found', 404); res.json(item); }));
let catalogCache = null;
let catalogCacheUntil = 0;
const clearCatalogCache = () => { catalogCache = null; catalogCacheUntil = 0; };
app.get('/api/catalog', wrap(async (req, res) => {
  if (catalogCache && catalogCacheUntil > Date.now()) return res.json(catalogCache);
  const names = ['maincategory','subcategory','brand','testimonial'];
  const rows = await Promise.all(names.map(name => db.collection(name).find({ active: { $ne: false } }, { projection: { _id: 0 } }).toArray()));
  catalogCache = Object.fromEntries(names.map((name, index) => [name, rows[index]]));
  catalogCacheUntil = Date.now() + 30000;
  res.set('Cache-Control', 'private, max-age=15').json(catalogCache);
}));
async function getCart(user) {
  const rows = await db.collection('cart').find({ user }, { projection: { _id: 0 } }).toArray();
  const products = await db.collection('products').find({ id: { $in: rows.map(r => r.product) } }).toArray();
  const items = rows.map(row => { const p = products.find(p => p.id === row.product); return { ...row, name: p?.name || 'Unavailable product', pic: p?.pic || [], price: p?.finalPrice || 0, stockQuantity: p?.active === false ? 0 : p?.stockQuantity || 0, available: !!p && p.active !== false, total: (p?.finalPrice || 0) * row.qty }; });
  const subtotal = Math.round(items.reduce((n, i) => n + i.total, 0) * 100) / 100, shipping = subtotal === 0 || subtotal >= 1999 ? 0 : 99;
  return { items, subtotal, shipping, total: subtotal + shipping };
}
app.get('/api/cart', auth, wrap(async (req, res) => res.json(await getCart(req.user.id))));
app.post('/api/cart', auth, wrap(async (req, res) => {
  const product = await db.collection('products').findOne({ id: str(req.body.product), active: { $ne: false } });
  if (!product) fail('Product not found', 404);
  const qty = Number(req.body.qty || 1); if (!Number.isInteger(qty) || qty < 1 || qty > 20) fail('Quantity must be between 1 and 20');
  const size = str(req.body.size || product.size, 40); if (size !== String(product.size)) fail('Choose an available size');
  const key = { user: req.user.id, product: product.id, size };
  const old = await db.collection('cart').findOne(key);
  if ((old?.qty || 0) + qty > Math.min(product.stockQuantity, 20)) fail('Requested quantity is not available');
  if (old) {
    const result = await db.collection('cart').updateOne({ ...key, qty: { $lte: Math.min(product.stockQuantity, 20) - qty } }, { $inc: { qty } });
    if (!result.matchedCount) fail('Your bag changed. Please refresh and try again.', 409);
  } else await db.collection('cart').insertOne({ id: crypto.randomUUID(), ...key, qty });
  res.json(await getCart(req.user.id));
}));
app.patch('/api/cart/:id', auth, wrap(async (req, res) => {
  const row = await db.collection('cart').findOne({ id: req.params.id, user: req.user.id }); if (!row) fail('Cart item not found', 404);
  const p = await db.collection('products').findOne({ id: row.product, active: { $ne: false } }), qty = Number(req.body.qty);
  if (!Number.isInteger(qty) || qty < 1 || qty > Math.min(p?.stockQuantity || 0, 20)) fail('Requested quantity is not available');
  await db.collection('cart').updateOne({ id: row.id, user: req.user.id }, { $set: { qty } }); res.json(await getCart(req.user.id));
}));
app.delete('/api/cart/:id', auth, wrap(async (req, res) => { await db.collection('cart').deleteOne({ id: req.params.id, user: req.user.id }); res.json(await getCart(req.user.id)); }));
app.get('/api/wishlist', auth, wrap(async (req, res) => { const rows = await db.collection('wishlist').find({ user: req.user.id }).toArray(); res.json(await db.collection('products').find({ id: { $in: rows.map(r => r.product) }, active: { $ne: false } }, { projection: { _id: 0 } }).toArray()); }));
app.post('/api/wishlist/:id', auth, wrap(async (req, res) => { if (!await db.collection('products').findOne({ id: req.params.id, active: { $ne: false } })) fail('Product not found', 404); await db.collection('wishlist').updateOne({ user: req.user.id, product: req.params.id }, { $setOnInsert: { user: req.user.id, product: req.params.id } }, { upsert: true }); res.json({ ok: true }); }));
app.delete('/api/wishlist/:id', auth, wrap(async (req, res) => { await db.collection('wishlist').deleteOne({ user: req.user.id, product: req.params.id }); res.json({ ok: true }); }));
app.post('/api/orders', auth, wrap(async (req, res) => {
  if (req.body.paymentMode !== 'cod') fail('Only cash on delivery is currently available');
  const address = {}; for (const k of ['name','phone','address','city','state','pin']) { address[k] = str(req.body.address?.[k]); if (!address[k]) fail('Complete all delivery address fields'); }
  if (!/^\d{6}$/.test(address.pin) || !/^[+\d\s()-]{10,18}$/.test(address.phone)) fail('Enter a valid phone number and six-digit PIN code');
  const key = str(req.get('Idempotency-Key'), 100); if (key.length < 10) fail('Checkout reference is required');
  let order;
  const session = client.startSession();
  try { await session.withTransaction(async () => {
    const existing = await db.collection('orders').findOne({ user: req.user.id, key }, { session }); if (existing) { order = existing; return; }
    const rows = await db.collection('cart').find({ user: req.user.id }, { session }).toArray(); if (!rows.length) fail('Your bag is empty');
    const items = [];
    for (const row of rows) {
      const p = await db.collection('products').findOneAndUpdate({ id: row.product, active: { $ne: false }, stockQuantity: { $gte: row.qty } }, { $inc: { stockQuantity: -row.qty } }, { session, returnDocument: 'before' });
      if (!p) fail('An item is no longer available in the requested quantity', 409);
      items.push({ product: p.id, name: p.name, pic: p.pic, size: row.size, qty: row.qty, price: p.finalPrice, total: Math.round(p.finalPrice * row.qty * 100) / 100 });
    }
    const subtotal = Math.round(items.reduce((n, i) => n + i.total, 0) * 100) / 100, shipping = subtotal >= 1999 ? 0 : 99;
    order = { id: crypto.randomUUID(), user: req.user.id, key, items, address, subtotal, shipping, total: subtotal + shipping, paymentMode: 'cod', paymentStatus: 'Pending', status: 'Placed', createdAt: new Date() };
    await db.collection('orders').insertOne(order, { session });
    await db.collection('cart').deleteMany({ user: req.user.id }, { session });
  }); } finally { await session.endSession(); }
  const { _id, ...safe } = order; res.status(201).json(safe);
}));
app.get('/api/orders', auth, wrap(async (req, res) => res.json(await db.collection('orders').find({ user: req.user.id }, { projection: { _id: 0, key: 0 } }).sort({ createdAt: -1 }).toArray())));
app.post('/api/newsletter', authLimit, wrap(async (req, res) => { await db.collection('newsletter').updateOne({ email: email(req.body.email) }, { $set: { active: true }, $setOnInsert: { id: crypto.randomUUID(), createdAt: new Date() } }, { upsert: true }); res.json({ message: 'You are on the list. Welcome to the edit.' }); }));
app.post('/api/contactus', authLimit, wrap(async (req, res) => { const data = { id: crypto.randomUUID(), email: email(req.body.email), createdAt: new Date(), status: 'New' }; for (const k of ['name','subject','message']) { data[k] = str(req.body[k], k === 'message' ? 3000 : 200); if (!data[k]) fail('Complete all fields'); } await db.collection('contactus').insertOne(data); res.status(201).json({ message: 'Message received. Our team will be in touch.' }); }));
app.post('/api/testimonials', auth, wrap(async (req, res) => { const message = str(req.body.message, 1000); if (message.length < 10) fail('Please write at least 10 characters'); await db.collection('testimonial').insertOne({ id: crypto.randomUUID(), user: req.user.id, name: req.user.name, message, active: false, createdAt: new Date() }); res.status(201).json({ message: 'Thank you. Your review has been submitted for approval.' }); }));
app.use('/api/admin', auth, admin);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 8 }, fileFilter: (req, file, cb) => cb(null, ['image/jpeg','image/png','image/webp','image/avif'].includes(file.mimetype)) });
app.post('/api/auth/avatar', auth, upload.single('image'), wrap(async (req, res) => {
  if (!req.file) fail('Select a JPEG, PNG, WebP or AVIF image under 5 MB');
  const result = await new Promise((resolve, reject) => cloudinary.uploader.upload_stream({ folder: 'apna-bazar/profiles', resource_type: 'image', transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'auto' }] }, (err, result) => err ? reject(err) : resolve(result)).end(req.file.buffer));
  await db.collection('users').updateOne({ id: req.user.id }, { $set: { pic: result.secure_url } });
  res.json(publicUser({ ...req.user, pic: result.secure_url }));
}));
app.post('/api/admin/upload', upload.array('images', 8), wrap(async (req, res) => {
  if (!req.files?.length) fail('Select JPEG, PNG, WebP or AVIF images (maximum 5 MB each)');
  const urls = [];
  for (const f of req.files) { const result = await new Promise((resolve, reject) => cloudinary.uploader.upload_stream({ folder: 'apna-bazar/products', resource_type: 'image' }, (err, result) => err ? reject(err) : resolve(result)).end(f.buffer)); urls.push(result.secure_url); }
  res.json({ urls });
}));
const collections = ['products','maincategory','subcategory','brand','testimonial','orders','users','newsletter','contactus'];
app.get('/api/admin/:collection', wrap(async (req, res) => { if (!collections.includes(req.params.collection)) fail('Not found', 404); if (req.params.collection === 'users') requireSuperAdmin(req); const rows = await db.collection(req.params.collection).find({}, { projection: { _id: 0, passwordHash: 0, password: 0, key: 0 } }).sort({ createdAt: -1 }).limit(1000).toArray(); res.json(rows); }));
function productFields(body) {
  const p = {}; for (const k of ['name','maincategory','subcategory','brand','color','size','description']) p[k] = str(body[k], k === 'description' ? 10000 : 200);
  if (!p.name || !p.maincategory || !p.subcategory || !p.brand || !p.size) fail('Name, category, type, brand and size are required');
  p.basePrice = Number(body.basePrice); p.discount = Number(body.discount || 0); p.stockQuantity = Number(body.stockQuantity);
  if (!Number.isFinite(p.basePrice) || p.basePrice <= 0 || !Number.isFinite(p.discount) || p.discount < 0 || p.discount > 90 || !Number.isInteger(p.stockQuantity) || p.stockQuantity < 0) fail('Check price, discount and stock');
  p.finalPrice = Math.round(p.basePrice * (1 - p.discount / 100) * 100) / 100; p.active = body.active !== false;
  p.pic = Array.isArray(body.pic) ? body.pic.filter(x => typeof x === 'string' && /^https:\/\/res\.cloudinary\.com\//.test(x)).slice(0, 12) : [];
  if (!p.pic.length) fail('Upload at least one product image'); return p;
}
app.post('/api/admin/:collection', wrap(async (req, res) => {
  const c = req.params.collection; let fields;
  if (c === 'products') fields = productFields(req.body);
  else if (c === 'users') {
    requireSuperAdmin(req);
    const password = str(req.body.password, 128); if (password.length < 8) fail('Password must have at least 8 characters');
    const role = str(req.body.role, 30); if (!userRoles.has(role)) fail('Choose a valid role');
    fields = { name: str(req.body.name, 80), email: email(req.body.email), passwordHash: await bcrypt.hash(password, 12), role, active: req.body.active !== false };
    if (fields.name.length < 2) fail('Name is required');
  }
  else if (['maincategory','subcategory','brand','testimonial'].includes(c)) { fields = { name: str(req.body.name), active: req.body.active !== false, pic: str(req.body.pic, 1000) }; if (!fields.name) fail('Name is required'); if (c === 'testimonial') fields.message = str(req.body.message, 1000); }
  else fail('Creation is not available for this resource');
  const record = { ...fields, id: crypto.randomUUID(), createdAt: new Date() }; await db.collection(c).insertOne(record); if (['maincategory','subcategory','brand','testimonial'].includes(c)) clearCatalogCache(); res.status(201).json(c === 'users' ? publicUser(record) : { ...record, _id: undefined });
}));
app.patch('/api/admin/:collection/:id', wrap(async (req, res) => {
  const c = req.params.collection; let fields;
  if (c === 'products') fields = productFields(req.body);
  else if (['maincategory','subcategory','brand','testimonial'].includes(c)) { fields = {}; for (const k of ['name','message','pic']) if (k in req.body) fields[k] = str(req.body[k], 3000); if ('active' in req.body) fields.active = !!req.body.active; }
  else if (c === 'orders') {
    const stages = ['Placed','Processing','Shipped','Delivered'];
    if (!stages.includes(req.body.status)) fail('Invalid order status');
    const current = await db.collection('orders').findOne({ id: req.params.id }); if (!current) fail('Order not found', 404);
    if (stages.indexOf(req.body.status) < stages.indexOf(current.status)) fail('An order cannot move back to an earlier status', 409);
    fields = { status: req.body.status };
    if (req.body.paymentStatus === 'Paid') { if (req.body.status !== 'Delivered') fail('Mark the order delivered before confirming cash payment'); fields.paymentStatus = 'Paid'; }
  }
  else if (c === 'contactus') fields = { status: req.body.status === 'Resolved' ? 'Resolved' : 'New' };
  else if (c === 'users') {
    requireSuperAdmin(req);
    if (req.params.id === req.user.id) fail('Manage your own details from your account page');
    fields = {}; if ('active' in req.body) fields.active = req.body.active !== false;
    if ('name' in req.body) { fields.name = str(req.body.name, 80); if (fields.name.length < 2) fail('Name is required'); }
    if ('email' in req.body) fields.email = email(req.body.email);
    if ('role' in req.body) { const role = str(req.body.role, 30); if (!userRoles.has(role)) fail('Choose a valid role'); fields.role = role; }
    if (req.body.password) { const p = str(req.body.password, 128); if (p.length < 8) fail('Password must have at least 8 characters'); fields.passwordHash = await bcrypt.hash(p, 12); await db.collection('sessions').deleteMany({ user: req.params.id }); }
  }
  else fail('Update is not available for this resource');
  const result = await db.collection(c).updateOne({ id: req.params.id }, { $set: fields }); if (!result.matchedCount) fail('Record not found', 404); if (['maincategory','subcategory','brand','testimonial'].includes(c)) clearCatalogCache(); res.json({ ok: true });
}));
app.delete('/api/admin/:collection/:id', wrap(async (req, res) => { const c = req.params.collection; if (!['products','maincategory','subcategory','brand','testimonial','newsletter','contactus'].includes(c)) fail('This record cannot be deleted'); if (c === 'products') await db.collection(c).updateOne({ id: req.params.id }, { $set: { active: false } }); else await db.collection(c).deleteOne({ id: req.params.id }); if (['maincategory','subcategory','brand','testimonial'].includes(c)) clearCatalogCache(); res.json({ ok: true }); }));
app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint not found' }));
app.use(express.static(path.join(__dirname, '../build')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../build/index.html')));
app.use((err, req, res, next) => {
  if (err.code === 11000) return res.status(409).json({ error: 'This record already exists' });
  const status = err.status || (err instanceof multer.MulterError ? 400 : 500);
  if (status === 500) console.error('Request failed:', err.name, err.code || '');
  res.status(status).json({ error: status === 500 ? 'The service could not complete this request. Please try again.' : err.message });
});
async function start() {
  await client.connect();
  await Promise.all([
    db.collection('users').createIndex({ email: 1 }, { unique: true }),
    db.collection('sessions').createIndex({ token: 1 }, { unique: true }),
    db.collection('sessions').createIndex({ expires: 1 }, { expireAfterSeconds: 0 }),
    db.collection('products').createIndex({ id: 1 }, { unique: true }),
    db.collection('cart').createIndex({ user: 1, product: 1, size: 1 }, { unique: true }),
    db.collection('wishlist').createIndex({ user: 1, product: 1 }, { unique: true }),
    db.collection('orders').createIndex({ user: 1, key: 1 }, { unique: true }),
    db.collection('newsletter').createIndex({ email: 1 }, { unique: true })
  ]);
  const port = Number(process.env.API_PORT || process.env.PORT || 5000);
  const server = app.listen(port, () => console.log(`API ready at http://localhost:${port}/api/health (MongoDB connected)`));
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close(async () => { await client.close(); process.exit(0); }));
}
if (require.main === module) start().catch(e => { console.error('Startup failed:', e.name, e.code || '', 'Check database configuration and network access.'); process.exit(1); });
module.exports = { app, start };
