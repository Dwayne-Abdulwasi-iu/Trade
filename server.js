'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { MongoClient } = require('mongodb');
const nodemailer = require('nodemailer');

const ROOT = __dirname;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const CURRENCY_EXPONENT = { EUR: 2, USD: 2, GBP: 2, CAD: 2, AUD: 2, NGN: 2, GHS: 2, ZAR: 2, KES: 2, TZS: 2, CHF: 2, NZD: 2, INR: 2, SGD: 2, AED: 2, CZK: 2, DKK: 2, SEK: 2, NOK: 2, PLN: 2, HUF: 2, RON: 2, TRY: 2, ISK: 0, UAH: 2, BRL: 2, MXN: 2, ARS: 2, CLP: 0, COP: 2, PEN: 2, JPY: 0, CNY: 2, KRW: 0, HKD: 2, MYR: 2, THB: 2, IDR: 2, PHP: 2, PKR: 2, BDT: 2, SAR: 2, QAR: 2, KWD: 3, BHD: 3, OMR: 3, EGP: 2, MAD: 2 };
const PUBLIC_FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/guide', ['guide.html', 'text/html; charset=utf-8']],
  ['/guide.html', ['guide.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/share.html', ['share.html', 'text/html; charset=utf-8']],
  ['/share.js', ['share.js', 'text/javascript; charset=utf-8']]
]);
const rateLimits = new Map();
let reminderSweepRunning = false;
let mongoClient = null;
let mongoDb = null;
let gmailTransport = null;

function loadEnvFile() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match || Object.hasOwn(process.env, match[1])) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
loadEnvFile();
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 4173);

function sendJson(response, status, data, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  response.end(JSON.stringify(data));
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function hasSessionSecret() {
  return Buffer.byteLength(process.env.SESSION_SECRET || '') >= 32;
}

function config() {
  return {
    cloudEnabled: Boolean(mongoDb && hasSessionSecret()),
    emailEnabled: Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD),
    smsEnabled: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM),
    stripeEnabled: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
    paystackEnabled: Boolean(process.env.PAYSTACK_SECRET_KEY),
    paypalEnabled: Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET && process.env.PAYPAL_WEBHOOK_ID),
    paymentsEnabled: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
    publicBaseUrl: process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`
  };
}

function requireDatabase() {
  if (!mongoDb || !hasSessionSecret()) {
    throw Object.assign(new Error('Cloud services are not configured. Set MONGODB_URI, MONGODB_DB, and SESSION_SECRET in .env, then restart the server.'), { status: 503 });
  }
  return mongoDb;
}

async function connectMongo() {
  if (!process.env.MONGODB_URI || !process.env.MONGODB_DB || !process.env.SESSION_SECRET) {
    console.warn('Cloud accounts and sync are disabled. Configure MONGODB_URI, MONGODB_DB, and SESSION_SECRET in .env.');
    return;
  }
  if (!hasSessionSecret()) throw new Error('SESSION_SECRET must be at least 32 bytes long.');
  mongoClient = new MongoClient(process.env.MONGODB_URI);
  await mongoClient.connect();
  mongoDb = mongoClient.db(process.env.MONGODB_DB);
  await Promise.all([
    mongoDb.collection('users').createIndex({ email: 1 }, { unique: true }),
    mongoDb.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    mongoDb.collection('quote_links').createIndex({ tokenHash: 1 }, { unique: true }),
    mongoDb.collection('quote_links').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  ]);
  const signupPolicy = await mongoDb.collection('signup_settings').findOne({ _id: 'registration' });
  if (!/^[a-f0-9]{64}$/i.test(signupPolicy?.invitationCodeHash || '')) {
    console.warn('Account creation is disabled until an administrator sets signup_settings.registration.invitationCodeHash in MongoDB.');
  }
  console.log(`Connected to MongoDB database "${process.env.MONGODB_DB}".`);
}

async function jsonBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Request body is too large.'), { status: 413 });
    chunks.push(chunk);
  }
  if (!size) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 }); }
}

function cleanWorkspace(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.customers) || !Array.isArray(data.quotes) || !Array.isArray(data.invoices)) {
    throw Object.assign(new Error('Workspace data is invalid.'), { status: 400 });
  }
  const json = JSON.stringify(data);
  if (Buffer.byteLength(json) > 1024 * 1024) throw Object.assign(new Error('Workspace data exceeds the 1 MB limit.'), { status: 413 });
  return data;
}

async function workspaceFor(userId) {
  const document = await requireDatabase().collection('workspaces').findOne({ _id: userId });
  const row = document ? { data: document.data, revision: document.revision } : { data: null, revision: 0 };
  if (row.data) {
    const currency = String(row.data.settings?.currency || 'EUR').toUpperCase();
    for (const quote of row.data.quotes || []) quote.currency ||= currency;
    for (const invoice of row.data.invoices || []) invoice.currency ||= currency;
  }
  return row;
}

async function saveWorkspace(userId, data, expectedRevision) {
  const collection = requireDatabase().collection('workspaces');
  const cleanData = cleanWorkspace(data);
  if (expectedRevision === 0) {
    try {
      await collection.insertOne({ _id: userId, data: cleanData, revision: 1, updatedAt: new Date() });
      return { data: cleanData, revision: 1 };
    } catch (error) {
      if (error.code === 11000) throw Object.assign(new Error('Workspace revision conflict.'), { status: 409 });
      throw error;
    }
  }
  const result = await collection.updateOne(
    { _id: userId, revision: expectedRevision },
    { $set: { data: cleanData, updatedAt: new Date() }, $inc: { revision: 1 } }
  );
  if (!result.matchedCount) throw Object.assign(new Error('Workspace revision conflict.'), { status: 409 });
  return { data: cleanData, revision: expectedRevision + 1 };
}

function isRevisionConflict(error) {
  return error.status === 409 || /revision conflict/i.test(error.message);
}

async function updateWorkspaceWithRetry(userId, update, initialRow = null) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const row = initialRow || await findWorkspaceRow(userId);
    initialRow = null;
    if (!row.data) throw Object.assign(new Error('Workspace not found.'), { status: 404 });
    if (!update(row.data)) return { ...row, updated: false };
    try {
      const saved = await saveWorkspace(userId, row.data, row.revision);
      return { ...saved, updated: true };
    } catch (error) {
      if (!isRevisionConflict(error) || attempt === 1) throw error;
    }
  }
  throw new Error('Workspace update failed.');
}

function bearerToken(request) {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.authorization || '');
  return match?.[1] || '';
}

async function authenticatedUser(request) {
  const token = bearerToken(request);
  if (!token) throw Object.assign(new Error('Sign in to continue.'), { status: 401 });
  const payload = decodeAccessToken(token);
  if (!payload) throw Object.assign(new Error('Your session is invalid. Sign in again.'), { status: 401 });
  const db = requireDatabase();
  const session = await db.collection('sessions').findOne({
    _id: payload.sid, userId: payload.sub, expiresAt: { $gt: new Date() }
  });
  if (!session) throw Object.assign(new Error('Your session has expired. Sign in again.'), { status: 401 });
  const user = await db.collection('users').findOne({ _id: payload.sub }, { projection: { email: 1 } });
  if (!user) throw Object.assign(new Error('Your account is no longer available. Sign in again.'), { status: 401 });
  return { id: user._id, email: user.email };
}

function publicUser(user) {
  return { id: user._id, email: user.email };
}

function hashPassword(password, salt = crypto.randomBytes(16)) {
  return new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
    (error, derivedKey) => error ? reject(error) : resolve(`scrypt$16384$8$1$${salt.toString('hex')}$${derivedKey.toString('hex')}`)));
}

async function verifyPassword(password, storedHash) {
  const [, n, r, p, saltHex, keyHex] = String(storedHash || '').split('$');
  if (n !== '16384' || r !== '8' || p !== '1' || !/^[a-f0-9]{32}$/i.test(saltHex || '') || !/^[a-f0-9]{128}$/i.test(keyHex || '')) return false;
  const encoded = await hashPassword(password, Buffer.from(saltHex, 'hex'));
  return safeEqual(encoded.split('$').at(-1), keyHex);
}

function decodeAccessToken(token, allowExpired = false) {
  const [encodedPayload, signature, extra] = String(token).split('.');
  if (!hasSessionSecret() || !encodedPayload || !signature || extra || !safeEqual(signature, crypto.createHmac('sha256', process.env.SESSION_SECRET).update(encodedPayload).digest('base64url'))) return null;
  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (!/^[a-f0-9]{24}$/i.test(payload.sub || '') || !/^[A-Za-z0-9_-]{32}$/.test(payload.sid || '') ||
      !Number.isFinite(payload.exp) || (!allowExpired && payload.exp <= Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function makeAccessToken(userId, sessionId) {
  const encodedPayload = Buffer.from(JSON.stringify({ sub: userId, sid: sessionId, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  const signature = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
}

async function createSession(user) {
  const db = requireDatabase();
  const sessionId = crypto.randomBytes(24).toString('base64url');
  const refreshToken = `${sessionId}.${crypto.randomBytes(40).toString('base64url')}`;
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db.collection('sessions').insertOne({
    _id: sessionId, userId: user._id, refreshTokenHash: sha256(refreshToken),
    createdAt: new Date(), lastUsedAt: new Date(), expiresAt
  });
  return {
    access_token: makeAccessToken(user._id, sessionId),
    refresh_token: refreshToken,
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: publicUser(user)
  };
}

async function refreshSession(refreshToken) {
  if (typeof refreshToken !== 'string') throw Object.assign(new Error('Your session is invalid. Sign in again.'), { status: 401 });
  const separator = refreshToken.indexOf('.');
  const sessionId = refreshToken.slice(0, separator);
  if (separator < 1 || !/^[A-Za-z0-9_-]{32}$/.test(sessionId)) throw Object.assign(new Error('Your session is invalid. Sign in again.'), { status: 401 });
  const db = requireDatabase();
  const session = await db.collection('sessions').findOne({
    _id: sessionId, refreshTokenHash: sha256(refreshToken), expiresAt: { $gt: new Date() }
  });
  if (!session) throw Object.assign(new Error('Your session has expired. Sign in again.'), { status: 401 });
  const user = await db.collection('users').findOne({ _id: session.userId });
  if (!user) throw Object.assign(new Error('Your account is no longer available. Sign in again.'), { status: 401 });
  const nextRefreshToken = `${sessionId}.${crypto.randomBytes(40).toString('base64url')}`;
  const updated = await db.collection('sessions').updateOne(
    { _id: sessionId, refreshTokenHash: sha256(refreshToken), expiresAt: { $gt: new Date() } },
    { $set: { refreshTokenHash: sha256(nextRefreshToken), lastUsedAt: new Date() } }
  );
  if (!updated.modifiedCount) throw Object.assign(new Error('Your session was refreshed elsewhere. Sign in again.'), { status: 401 });
  return {
    access_token: makeAccessToken(user._id, sessionId),
    refresh_token: nextRefreshToken,
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: publicUser(user)
  };
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function createQuoteLink(userId, quote, customer, workspace, revision) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(`${quote.validUntil}T23:59:59.000Z`).toISOString();
  await requireDatabase().collection('quote_links').insertOne({
    tokenHash: sha256(token), userId, quoteId: quote.id, expiresAt: new Date(expiresAt), createdAt: new Date()
  });
  return { url: `${config().publicBaseUrl.replace(/\/+$/, '')}/share.html?token=${encodeURIComponent(token)}`, token, expiresAt };
}

async function publicQuote(token) {
  if (!token || token.length > 200) throw Object.assign(new Error('This approval link is invalid.'), { status: 404 });
  const link = await requireDatabase().collection('quote_links').findOne({ tokenHash: sha256(token), expiresAt: { $gte: new Date() } });
  if (!link) throw Object.assign(new Error('This approval link has expired or is invalid.'), { status: 404 });
  const workspace = await workspaceFor(link.userId);
  const quote = workspace.data?.quotes?.find((item) => item.id === link.quoteId);
  const customer = quote && workspace.data.customers.find((item) => item.id === quote.customerId);
  if (!quote || !customer) throw Object.assign(new Error('This quote is no longer available.'), { status: 404 });
  const currency = quote.currency || workspace.data.settings?.currency || 'EUR';
  const subtotal = roundCurrency(quote.lines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unitPrice), 0), currency);
  const taxRate = Number(quote.taxRate || 0);
  const total = roundCurrency(subtotal + roundCurrency(subtotal * taxRate / 100, currency), currency);
  return {
    quoteId: quote.id,
    number: quote.number,
    date: quote.date,
    validUntil: quote.validUntil,
    lines: quote.lines,
    subtotal,
    taxRate,
    total,
    notes: quote.notes || '',
    status: quote.status,
    businessName: workspace.data.settings?.businessName || 'Local business',
    currency,
    customerName: customer.name,
    expiresAt: link.expiresAt.toISOString()
  };
}

function rateLimit(request, key, max = 30, intervalMs = 60_000) {
  const now = Date.now();
  const ip = request.socket.remoteAddress || 'unknown';
  const id = `${ip}:${key}`;
  const current = rateLimits.get(id);
  if (!current || now > current.until) {
    rateLimits.set(id, { count: 1, until: now + intervalMs });
    return;
  }
  current.count += 1;
  if (current.count > max) throw Object.assign(new Error('Too many requests. Please try again shortly.'), { status: 429 });
}

function safeDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

function invoiceCurrency(invoice, workspace) {
  return String(invoice?.currency || workspace?.settings?.currency || 'EUR').toUpperCase();
}

function currencyScale(currency) {
  const exponent = CURRENCY_EXPONENT[currency];
  if (exponent === undefined) throw Object.assign(new Error('This currency is not supported for payments.'), { status: 400 });
  return 10 ** exponent;
}

function toMinor(amount, currency) {
  const scale = currencyScale(currency);
  return Math.round(Number(amount) * scale);
}

function fromMinor(amount, currency) {
  return Number(amount) / currencyScale(currency);
}

function roundCurrency(amount, currency) {
  return fromMinor(toMinor(amount, currency), currency);
}

function paidAmountMinor(invoice) {
  if (Array.isArray(invoice.payments)) {
    return invoice.payments.reduce((sum, payment) => {
      if (payment.voidedAt || payment.status === 'rejected' || (payment.type === 'bank_transfer_pending' && payment.status !== 'confirmed')) return sum;
      const amountMinor = toMinor(payment.amount, invoiceCurrency(invoice));
      return sum + (payment.type === 'refund' ? -amountMinor : amountMinor);
    }, 0);
  }
  return invoice.status === 'paid' ? toMinor(invoice.total, invoiceCurrency(invoice)) : 0;
}

function balanceDueMinor(invoice) {
  return Math.max(0, toMinor(invoice.total, invoiceCurrency(invoice)) - paidAmountMinor(invoice));
}

function requestedAmountMinor(value, balanceMinor, currency) {
  const amount = Number(value);
  const scale = currencyScale(currency);
  const amountMinor = Math.round(amount * scale);
  if (!Number.isFinite(amount) || amountMinor < 1 || Math.abs(amount * scale - amountMinor) > 0.00001) {
    throw Object.assign(new Error(`Payment amount must be positive with no more than ${Math.log10(scale)} decimal places.`), { status: 400 });
  }
  if (amountMinor > balanceMinor) throw Object.assign(new Error('Payment amount cannot exceed the remaining invoice balance.'), { status: 400 });
  return amountMinor;
}

async function recordExternalPayment(userId, invoiceId, payment) {
  const paidAt = new Date().toISOString().slice(0, 10);
  return updateWorkspaceWithRetry(userId, (data) => {
    const invoice = data.invoices?.find((item) => item.id === invoiceId);
    if (!invoice) throw Object.assign(new Error('Invoice not found.'), { status: 404 });
    const currency = invoiceCurrency(invoice, data);
    if (payment.currency !== currency) throw Object.assign(new Error('Payment currency does not match the invoice.'), { status: 400 });
    invoice.payments = Array.isArray(invoice.payments) ? invoice.payments : [];
    if (invoice.payments.some((item) => item.reference === payment.reference)) return false;
    invoice.payments.push({
      id: payment.reference,
      reference: payment.reference,
      amount: fromMinor(payment.amountMinor, currency),
      date: paidAt,
      method: payment.method,
      paymentIntent: payment.paymentIntent || null
    });
    invoice.status = balanceDueMinor(invoice) === 0 ? 'paid' : 'unpaid';
    invoice.paidAt = invoice.status === 'paid' ? paidAt : null;
    delete invoice.paymentLinks;
    delete invoice.checkoutUrl;
    delete invoice.checkoutUrlExpiresAt;
    delete invoice.checkoutSessionId;
    delete invoice.checkoutAmountMinor;
    return true;
  });
}

function quoteEmailHtml(quote, customer, workspace, link) {
  const currency = String(quote.currency || workspace.settings?.currency || 'EUR').toUpperCase();
  const formatMoney = (amount) => new Intl.NumberFormat('en', { style: 'currency', currency }).format(amount);
  const rows = quote.lines.map((line) => `<tr><td style="padding:10px 8px;border-bottom:1px solid #e8ebe6">${escapeHtml(line.description)}</td><td style="padding:10px 8px;border-bottom:1px solid #e8ebe6;text-align:center">${escapeHtml(line.quantity)}</td><td style="padding:10px 8px;border-bottom:1px solid #e8ebe6;text-align:right;white-space:nowrap">${formatMoney(line.unitPrice)}</td><td style="padding:10px 8px;border-bottom:1px solid #e8ebe6;text-align:right;white-space:nowrap">${formatMoney(line.quantity * line.unitPrice)}</td></tr>`).join('');
  const subtotal = roundCurrency(quote.lines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unitPrice), 0), currency);
  const tax = roundCurrency(subtotal * Number(quote.taxRate || 0) / 100, currency);
  const total = roundCurrency(subtotal + tax, currency);
  const businessName = escapeHtml(workspace.settings?.businessName || 'our business');
  return `<p style="margin:0 0 16px">Hello ${escapeHtml(customer.name)},</p><p style="margin:0 0 20px">Please review quote <strong>${escapeHtml(quote.number)}</strong> from ${businessName}.</p><table role="presentation" style="border-collapse:collapse;width:100%;margin:0 0 18px;font-size:13px"><thead><tr><th style="padding:10px 8px;border-bottom:2px solid #dfe5df;text-align:left">Item or service</th><th style="padding:10px 8px;border-bottom:2px solid #dfe5df;text-align:center">Qty</th><th style="padding:10px 8px;border-bottom:2px solid #dfe5df;text-align:right">Price</th><th style="padding:10px 8px;border-bottom:2px solid #dfe5df;text-align:right">Total</th></tr></thead><tbody>${rows}</tbody></table><p style="margin:0 0 20px;line-height:1.8">Subtotal: ${formatMoney(subtotal)}<br>Tax (${Number(quote.taxRate || 0)}%): ${formatMoney(tax)}<br><strong style="font-size:16px;color:#14543e">Total: ${formatMoney(total)}</strong><br>Valid until: ${escapeHtml(quote.validUntil)}</p>${quote.notes ? `<div style="margin:0 0 20px;padding:12px 14px;border-radius:6px;background:#f5f6f2;color:#526057">${escapeHtml(quote.notes).replace(/\n/g, '<br>')}</div>` : ''}<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 18px;border-radius:6px;background:#1c6c51;color:#fff;text-decoration:none;font-weight:700">Review and respond to quote</a></p><p style="margin:24px 0 0">Thank you,<br>${businessName}</p>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function businessNameFor(workspace) {
  const name = String(workspace?.settings?.businessName || '').trim();
  return name || 'Your business';
}

function brandedEmailHtml(content) {
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>Neatwork</title></head><body style="margin:0;padding:0;background:#f3f6f2;color:#26352d;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f3f6f2"><tr><td align="center" style="padding:32px 14px"><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px"><tr><td style="padding:0 0 18px"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td width="38" height="38" align="center" valign="middle" style="width:38px;height:38px;border-radius:10px;background:#1c6c51;color:#fff;font-size:21px;font-weight:700;letter-spacing:-1px">n.</td><td style="padding-left:11px;color:#17241f;font-size:22px;font-weight:700;letter-spacing:-.7px">neatwork</td></tr></table><div style="padding:8px 0 0 49px;color:#78827d;font-size:10px;letter-spacing:1.2px">SALES · PAYMENTS · RECORDS</div></td></tr><tr><td style="padding:30px 32px;border:1px solid #e5eae5;border-radius:10px;background:#fff;font-size:14px;line-height:1.65;color:#34423a">${content}</td></tr><tr><td align="center" style="padding:20px 12px 0;color:#849087;font-size:11px;line-height:1.6">Sent with <strong style="color:#526057">Neatwork</strong><br>Sales, payments, and records in order.</td></tr></table></td></tr></table></body></html>`;
}

async function sendEmail({ to, subject, html, text, businessName }) {
  const user = String(process.env.GMAIL_USER || '').trim();
  const appPassword = String(process.env.GMAIL_APP_PASSWORD || '').replace(/\s/g, '');
  if (!user || !appPassword) throw Object.assign(new Error('Gmail is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env.'), { status: 503 });
  if (!gmailTransport) {
    gmailTransport = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user, pass: appPassword }
    });
  }
  const safeName = String(businessName || 'Your business').replace(/[\r\n<>]/g, '').trim().slice(0, 80) || 'Your business';
  const senderName = safeName.toLowerCase() === 'neatwork' ? 'Neatwork' : `${safeName} via Neatwork`;
  return gmailTransport.sendMail({
    from: { name: senderName, address: user },
    to,
    subject,
    html: brandedEmailHtml(html || `<p>${escapeHtml(text || '').replace(/\n/g, '<br>')}</p>`),
    text
  });
}

async function sendSms({ to, body }) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_FROM) throw Object.assign(new Error('SMS sending is not configured.'), { status: 503 });
  if (!/^\+[1-9]\d{7,14}$/.test(to || '')) throw Object.assign(new Error('Customer phone number must use international E.164 format for SMS.'), { status: 400 });
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(process.env.TWILIO_ACCOUNT_SID)}/Messages.json`;
  const form = new URLSearchParams({ To: to, From: process.env.TWILIO_FROM, Body: body });
  const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const result = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
  const data = await result.json().catch(() => ({}));
  if (!result.ok) throw Object.assign(new Error(data.message || `SMS provider returned ${result.status}.`), { status: 502 });
  return data;
}

function invoiceReminderMessage(invoice, customer, workspace, link) {
  const currency = invoiceCurrency(invoice, workspace);
  const businessName = businessNameFor(workspace);
  const total = new Intl.NumberFormat('en', { style: 'currency', currency }).format(fromMinor(balanceDueMinor(invoice), currency));
  const paymentInfo = link
    ? `View payment options: ${link}`
    : workspace.settings?.bankTransferInstructions
      ? `You can pay by bank transfer:\n${workspace.settings.bankTransferInstructions}\nPlease include invoice ${invoice.number} as the payment reference.`
      : 'Please contact the business to arrange payment.';
  return `Hello ${customer.name}, a friendly reminder from ${businessName}: invoice ${invoice.number} has ${total} remaining.\n${paymentInfo}\n\nThank you,\n${businessName}`;
}

async function createCheckout(invoice, customer, workspace, userId, generation = 0, amountMinor = balanceDueMinor(invoice)) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) throw Object.assign(new Error('Stripe payments are not fully configured. Set both STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.'), { status: 503 });
  const currency = invoiceCurrency(invoice, workspace);
  if (CURRENCY_EXPONENT[currency] === undefined || !Number.isSafeInteger(amountMinor) || amountMinor < 1 || amountMinor > balanceDueMinor(invoice)) throw Object.assign(new Error('This invoice payment amount is invalid or exceeds the remaining balance.'), { status: 400 });
  const base = config().publicBaseUrl.replace(/\/+$/, '');
  const form = new URLSearchParams({
    mode: 'payment',
    success_url: `${base}/share.html?payment=success&invoice=${encodeURIComponent(invoice.number)}`,
    cancel_url: `${base}/share.html?payment=cancelled&invoice=${encodeURIComponent(invoice.number)}`,
    client_reference_id: `${userId}:${invoice.id}`,
    customer_email: customer.email || '',
    'metadata[user_id]': userId,
    'metadata[invoice_id]': invoice.id,
    'metadata[payment_amount_minor]': String(amountMinor),
    'line_items[0][price_data][currency]': currency.toLowerCase(),
    'line_items[0][price_data][unit_amount]': String(amountMinor),
    'line_items[0][price_data][product_data][name]': `Invoice ${invoice.number}`,
    'line_items[0][quantity]': '1'
  });
  if (!customer.email) form.delete('customer_email');
  const result = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': `neatwork-${userId}-${invoice.id}-${generation}-${amountMinor}` },
    body: form
  });
  const data = await result.json().catch(() => ({}));
  if (!result.ok || !data.url) throw Object.assign(new Error(data.error?.message || 'Unable to start the secure checkout.'), { status: 502 });
  return data;
}

async function findWorkspaceRow(userId) {
  const document = await requireDatabase().collection('workspaces').findOne({ _id: userId });
  return document ? { data: document.data, revision: document.revision } : { data: null, revision: 0 };
}

async function handleStripeWebhook(request, response) {
  if (!process.env.STRIPE_WEBHOOK_SECRET) return sendJson(response, 503, { error: 'Payment webhook is not configured.' });
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) return sendJson(response, 413, { error: 'Webhook is too large.' });
    chunks.push(chunk);
  }
  const rawBody = Buffer.concat(chunks);
  const signature = request.headers['stripe-signature'] || '';
  const pieces = Object.fromEntries(signature.split(',').map((part) => part.split('=')));
  const timestamp = Number(pieces.t);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300) return sendJson(response, 400, { error: 'Invalid webhook timestamp.' });
  const expected = crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(`${pieces.t}.${rawBody.toString('utf8')}`).digest('hex');
  if (!safeEqual(expected, pieces.v1 || '')) return sendJson(response, 400, { error: 'Invalid webhook signature.' });
  let event;
  try { event = JSON.parse(rawBody.toString('utf8')); } catch { return sendJson(response, 400, { error: 'Invalid webhook body.' }); }
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const checkout = event.data?.object;
    if (checkout?.payment_status === 'paid' || event.type.endsWith('async_payment_succeeded')) {
      const { user_id: userId, invoice_id: invoiceId } = checkout.metadata || {};
      if (!userId || !invoiceId) return sendJson(response, 400, { error: 'Checkout metadata is incomplete.' });
      const amountMinor = Number(checkout.metadata.payment_amount_minor);
      if (!Number.isSafeInteger(amountMinor) || amountMinor < 1 || checkout.amount_total !== amountMinor) {
        return sendJson(response, 400, { error: 'Checkout payment amount is invalid.' });
      }
      const currency = String(checkout.currency || '').toUpperCase();
      if (CURRENCY_EXPONENT[currency] === undefined) return sendJson(response, 400, { error: 'Checkout currency is not supported.' });
      await recordExternalPayment(userId, invoiceId, {
        reference: checkout.id,
        amountMinor,
        currency,
        method: 'stripe',
        paymentIntent: checkout.payment_intent
      });
    }
  }
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end('{"received":true}');
}

async function handleTwilioInbound(request, response) {
  if (!process.env.TWILIO_AUTH_TOKEN || !process.env.PUBLIC_BASE_URL) return sendJson(response, 503, { error: 'Twilio inbound handling is not configured.' });
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) return sendJson(response, 413, { error: 'Webhook is too large.' });
    chunks.push(chunk);
  }
  const parameters = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
  const values = [...parameters.entries()].sort(([a], [b]) => a.localeCompare(b));
  const signedUrl = `${process.env.PUBLIC_BASE_URL.replace(/\/+$/, '')}/api/twilio/inbound`;
  const signaturePayload = signedUrl + values.map(([key, value]) => key + value).join('');
  const expected = crypto.createHmac('sha1', process.env.TWILIO_AUTH_TOKEN).update(signaturePayload).digest('base64');
  if (!safeEqual(expected, request.headers['x-twilio-signature'] || '')) return sendJson(response, 403, { error: 'Invalid Twilio signature.' });

  const from = String(parameters.get('From') || '').trim();
  const body = String(parameters.get('Body') || '').trim().toUpperCase();
  if (/^\+[1-9]\d{7,14}$/.test(from) && ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'].includes(body)) {
    const cursor = requireDatabase().collection('workspaces').find({}).sort({ _id: 1 });
    for await (const document of cursor) {
      await updateWorkspaceWithRetry(document._id, (data) => {
        const customers = data.customers.filter((customer) => customer.phone === from && customer.smsConsent);
        if (!customers.length) return false;
        for (const customer of customers) {
          customer.smsConsent = false;
          customer.smsConsentUpdatedAt = new Date().toISOString();
          customer.smsOptOutAt = customer.smsConsentUpdatedAt;
        }
        return true;
      }, { data: document.data, revision: document.revision });
    }
  }
  response.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end('<Response></Response>');
}

async function reminderSweep() {
  if (reminderSweepRunning || !mongoDb) return;
  reminderSweepRunning = true;
  try {
    const cursor = mongoDb.collection('workspaces').find({}).sort({ _id: 1 });
    for await (const document of cursor) {
      await remindWorkspace({ user_id: document._id, data: document.data, revision: document.revision });
    }
  } catch (error) {
    console.error('Scheduled reminder sweep failed:', error.message);
  } finally {
    reminderSweepRunning = false;
  }
}

async function claimReminder(userId, invoiceId, daysLate, channel) {
  const collection = requireDatabase().collection('reminder_deliveries');
  const id = sha256([userId, invoiceId, daysLate, channel].join(':'));
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 15 * 60 * 1000);
  const reclaimed = await collection.updateOne(
    { _id: id, $or: [{ status: 'failed' }, { status: 'sending', updatedAt: { $lt: staleBefore } }] },
    { $set: { status: 'sending', updatedAt: now, error: null } }
  );
  if (reclaimed.modifiedCount) return id;
  try {
    await collection.insertOne({ _id: id, userId, invoiceId, daysLate, channel, status: 'sending', createdAt: now, updatedAt: now });
    return id;
  } catch (error) {
    if (error.code === 11000) return null;
    throw error;
  }
}

async function updateReminderStatus(id, status, errorMessage = null) {
  await requireDatabase().collection('reminder_deliveries').updateOne(
    { _id: id },
    { $set: { status, updatedAt: new Date(), error: errorMessage } }
  );
}

async function remindWorkspace(row) {
  const data = row.data;
  const preferences = data?.settings?.reminders;
  if (!preferences?.enabled || !Array.isArray(preferences.daysAfterDue) || (!preferences.email && !preferences.sms)) return;
  const customerById = new Map(data.customers.map((customer) => [customer.id, customer]));
  const today = new Date().toISOString().slice(0, 10);
  for (const invoice of data.invoices) {
    if (!balanceDueMinor(invoice) || !safeDate(invoice.dueDate)) continue;
    const daysLate = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${invoice.dueDate}T00:00:00Z`)) / 86400000);
    if (!preferences.daysAfterDue.includes(daysLate)) continue;
    const customer = customerById.get(invoice.customerId);
    if (!customer) continue;
    const url = await getReminderPaymentUrl(row.user_id, invoice, customer, data);
    const text = invoiceReminderMessage(invoice, customer, data, url);
    for (const channel of ['email', 'sms']) {
      if (!preferences[channel]) continue;
      if (channel === 'email' && (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD || !customer.email)) continue;
      if (channel === 'sms' && (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_FROM || !customer.smsConsent || !customer.phone)) continue;
      let reminderId = null;
      try {
        reminderId = await claimReminder(row.user_id, invoice.id, daysLate, channel);
        if (!reminderId) continue;
        if (channel === 'email') {
          await sendEmail({ to: customer.email, subject: `${businessNameFor(data)}: payment reminder for invoice ${invoice.number}`, text, html: `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`, businessName: businessNameFor(data) });
        } else {
          await sendSms({ to: customer.phone, body: `${text} Reply STOP to opt out.` });
        }
        await updateReminderStatus(reminderId, 'sent');
      } catch (error) {
        console.error(`Scheduled ${channel} reminder failed for invoice ${invoice.number}:`, error.message);
        if (reminderId) {
          try { await updateReminderStatus(reminderId, 'failed', error.message.slice(0, 200)); }
          catch (updateError) { console.error(`Unable to record failed ${channel} reminder for invoice ${invoice.number}:`, updateError.message); }
        }
      }
    }
  }
}

async function getReminderPaymentUrl(userId, invoice, customer, workspace) {
  const balanceMinor = balanceDueMinor(invoice);
  if (!balanceMinor) return null;
  if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET) {
    return getOrCreatePaymentUrl(userId, invoice, customer, workspace);
  }
  if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET && process.env.PAYPAL_WEBHOOK_ID) {
    return (await createAlternativePaymentLink(userId, invoice, customer, workspace, 'paypal', balanceMinor)).url;
  }
  if (invoiceCurrency(invoice, workspace) === 'NGN' && process.env.PAYSTACK_SECRET_KEY && customer.email) {
    return (await createAlternativePaymentLink(userId, invoice, customer, workspace, 'paystack', balanceMinor)).url;
  }
  return null;
}

async function getOrCreatePaymentUrl(userId, invoice, customer, data, persist = true, requestedMinor = balanceDueMinor(invoice)) {
  const amountMinor = requestedMinor;
  if (!amountMinor || amountMinor > balanceDueMinor(invoice)) throw Object.assign(new Error('This invoice has no remaining balance for that payment amount.'), { status: 409 });
  if (invoice.checkoutUrl && invoice.checkoutAmountMinor === amountMinor && invoice.checkoutUrlExpiresAt && Date.parse(invoice.checkoutUrlExpiresAt) > Date.now() + 60_000) return invoice.checkoutUrl;
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe is not configured; cannot create scheduled payment link.');
  if (invoice.checkoutSessionId) await expireCheckoutSession(invoice.checkoutSessionId);
  const generation = Number(invoice.checkoutLinkGeneration || 0) + 1;
  const session = await createCheckout(invoice, customer, data, userId, generation, amountMinor);
  invoice.checkoutUrl = session.url;
  invoice.checkoutUrlExpiresAt = new Date(session.expires_at * 1000).toISOString();
  invoice.checkoutLinkGeneration = generation;
  invoice.checkoutSessionId = session.id;
  invoice.checkoutAmountMinor = amountMinor;
  if (persist) await updateWorkspaceWithRetry(userId, (workspace) => {
    const currentInvoice = workspace.invoices.find((item) => item.id === invoice.id);
    if (!currentInvoice || !balanceDueMinor(currentInvoice)) return false;
    currentInvoice.checkoutUrl = invoice.checkoutUrl;
    currentInvoice.checkoutUrlExpiresAt = invoice.checkoutUrlExpiresAt;
    currentInvoice.checkoutLinkGeneration = generation;
    currentInvoice.checkoutSessionId = session.id;
    currentInvoice.checkoutAmountMinor = amountMinor;
    return true;
  });
  return session.url;
}

async function expireCheckoutSession(sessionId) {
  const endpoint = `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`;
  const headers = { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` };
  const currentResponse = await fetch(endpoint, { headers });
  const current = await currentResponse.json().catch(() => ({}));
  if (!currentResponse.ok) throw Object.assign(new Error(current.error?.message || 'Unable to verify the previous payment session.'), { status: 502 });
  if (current.status === 'complete') {
    throw Object.assign(new Error('The previous payment is still being confirmed. Refresh the invoice and try again.'), { status: 409 });
  }
  if (current.status !== 'open') return;
  const expiredResponse = await fetch(`${endpoint}/expire`, { method: 'POST', headers });
  const expired = await expiredResponse.json().catch(() => ({}));
  if (!expiredResponse.ok) throw Object.assign(new Error(expired.error?.message || 'Unable to replace the previous payment session.'), { status: 502 });
}

function paypalApiBase() {
  return process.env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

async function paypalAccessToken() {
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
    throw Object.assign(new Error('PayPal is not configured.'), { status: 503 });
  }
  const credentials = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const response = await fetch(`${paypalApiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) throw Object.assign(new Error(result.error_description || 'Unable to authenticate with PayPal.'), { status: 502 });
  return result.access_token;
}

async function createPayPalOrder(userId, invoice, customer, workspace, amountMinor) {
  const currency = invoiceCurrency(invoice, workspace);
  const exponent = CURRENCY_EXPONENT[currency];
  const customId = `NW|${userId}|${invoice.id}|${amountMinor}`;
  const base = config().publicBaseUrl.replace(/\/+$/, '');
  const token = await paypalAccessToken();
  const response = await fetch(`${paypalApiBase()}/v2/checkout/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': `neatwork-${crypto.randomUUID()}` },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        custom_id: customId,
        invoice_id: invoice.number,
        amount: { currency_code: currency, value: fromMinor(amountMinor, currency).toFixed(exponent) },
        description: `Invoice ${invoice.number}`
      }],
      application_context: {
        brand_name: String(workspace.settings?.businessName || 'Neatwork').slice(0, 127),
        user_action: 'PAY_NOW',
        return_url: `${base}/share.html?payment=paypal`,
        cancel_url: `${base}/share.html?payment=cancelled`
      }
    })
  });
  const result = await response.json().catch(() => ({}));
  const approval = result.links?.find((link) => link.rel === 'approve')?.href;
  if (!response.ok || !approval || !result.id) throw Object.assign(new Error(result.message || 'Unable to create PayPal checkout.'), { status: 502 });
  return { id: result.id, url: approval };
}

async function createPaystackCheckout(userId, invoice, customer, workspace, amountMinor) {
  if (!process.env.PAYSTACK_SECRET_KEY) throw Object.assign(new Error('Paystack is not configured.'), { status: 503 });
  if (!customer.email) throw Object.assign(new Error('Add an email address to the customer before using Paystack.'), { status: 400 });
  const currency = invoiceCurrency(invoice, workspace);
  if (currency !== 'NGN') throw Object.assign(new Error('Paystack checkout is currently enabled for Nigerian Naira invoices only.'), { status: 400 });
  const reference = `nw_${crypto.randomUUID().replace(/-/g, '')}`;
  const base = config().publicBaseUrl.replace(/\/+$/, '');
  const response = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: customer.email,
      amount: amountMinor,
      currency,
      reference,
      callback_url: `${base}/share.html?payment=paystack`,
      metadata: { neatwork_user_id: userId, neatwork_invoice_id: invoice.id, neatwork_amount_minor: amountMinor }
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.status || !result.data?.authorization_url) {
    throw Object.assign(new Error(result.message || 'Unable to create Paystack checkout.'), { status: 502 });
  }
  return { id: reference, url: result.data.authorization_url };
}

async function createAlternativePaymentLink(userId, invoice, customer, workspace, provider, amountMinor) {
  const current = invoice.paymentLinks?.[provider];
  if (current?.amountMinor === amountMinor && current.expiresAt && Date.parse(current.expiresAt) > Date.now() + 60_000) {
    return { ...current, reused: true };
  }
  const checkout = provider === 'paypal'
    ? await createPayPalOrder(userId, invoice, customer, workspace, amountMinor)
    : await createPaystackCheckout(userId, invoice, customer, workspace, amountMinor);
  const link = {
    id: checkout.id,
    url: checkout.url,
    amountMinor,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString()
  };
  invoice.paymentLinks = { ...(invoice.paymentLinks || {}), [provider]: link };
  await updateWorkspaceWithRetry(userId, (data) => {
    const currentInvoice = data.invoices?.find((item) => item.id === invoice.id);
    if (!currentInvoice) throw Object.assign(new Error('Invoice not found.'), { status: 404 });
    currentInvoice.paymentLinks = { ...(currentInvoice.paymentLinks || {}), [provider]: link };
    return true;
  });
  return link;
}

async function capturePayPalOrder(orderId) {
  const token = await paypalAccessToken();
  const endpoint = `${paypalApiBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const orderResponse = await fetch(endpoint, { headers });
  const order = await orderResponse.json().catch(() => ({}));
  if (!orderResponse.ok) throw Object.assign(new Error(order.message || 'Unable to verify this PayPal order.'), { status: 502 });
  const customId = order.purchase_units?.[0]?.custom_id || '';
  const match = /^NW\|([0-9a-f-]{36})\|([^|]{1,120})\|(\d+)$/.exec(customId);
  if (!match) throw Object.assign(new Error('This PayPal order is not linked to a valid invoice.'), { status: 400 });
  const [, userId, invoiceId, amountText] = match;
  const amountMinor = Number(amountText);
  let completedOrder = order;
  if (order.status === 'APPROVED') {
    const captureResponse = await fetch(`${endpoint}/capture`, { method: 'POST', headers });
    completedOrder = await captureResponse.json().catch(() => ({}));
    if (!captureResponse.ok) throw Object.assign(new Error(completedOrder.message || 'PayPal could not complete this payment.'), { status: 502 });
  }
  if (completedOrder.status !== 'COMPLETED') throw Object.assign(new Error('PayPal has not completed this payment.'), { status: 409 });
  const unit = completedOrder.purchase_units?.[0];
  const capture = unit?.payments?.captures?.find((item) => item.status === 'COMPLETED');
  if (!capture || capture.amount?.currency_code !== unit.amount?.currency_code || toMinor(capture.amount?.value, capture.amount?.currency_code) !== amountMinor) {
    throw Object.assign(new Error('PayPal payment amount could not be verified against this invoice.'), { status: 400 });
  }
  await recordExternalPayment(userId, invoiceId, {
    reference: `paypal:${capture.id}`,
    amountMinor,
    currency: capture.amount.currency_code,
    method: 'paypal',
    paymentIntent: capture.id
  });
  return { received: true };
}

async function verifyPaystackReference(reference) {
  if (!process.env.PAYSTACK_SECRET_KEY) throw Object.assign(new Error('Paystack is not configured.'), { status: 503 });
  if (typeof reference !== 'string' || !/^nw_[a-f0-9]{32}$/.test(reference)) {
    throw Object.assign(new Error('Invalid Paystack reference.'), { status: 400 });
  }
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
  });
  const result = await response.json().catch(() => ({}));
  const transaction = result.data;
  if (!response.ok || !result.status || transaction?.status !== 'success') {
    throw Object.assign(new Error(result.message || 'Paystack has not confirmed this payment.'), { status: 409 });
  }
  const metadata = transaction.metadata || {};
  if (!metadata.neatwork_user_id || !metadata.neatwork_invoice_id || !Number.isSafeInteger(Number(metadata.neatwork_amount_minor))) {
    throw Object.assign(new Error('This Paystack transaction is not linked to a valid invoice.'), { status: 400 });
  }
  const amountMinor = Number(metadata.neatwork_amount_minor);
  if (transaction.reference !== reference || transaction.amount !== amountMinor || transaction.currency !== 'NGN') {
    throw Object.assign(new Error('Paystack transaction details do not match the invoice payment.'), { status: 400 });
  }
  await recordExternalPayment(metadata.neatwork_user_id, metadata.neatwork_invoice_id, {
    reference: `paystack:${reference}`,
    amountMinor,
    currency: transaction.currency,
    method: 'paystack',
    paymentIntent: reference
  });
  return { received: true };
}

async function handlePaystackWebhook(request, response) {
  if (!process.env.PAYSTACK_SECRET_KEY) return sendJson(response, 503, { error: 'Paystack webhook is not configured.' });
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) return sendJson(response, 413, { error: 'Webhook is too large.' });
    chunks.push(chunk);
  }
  const rawBody = Buffer.concat(chunks);
  const expected = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(rawBody).digest('hex');
  if (!safeEqual(expected, request.headers['x-paystack-signature'] || '')) return sendJson(response, 403, { error: 'Invalid Paystack signature.' });
  let event;
  try { event = JSON.parse(rawBody.toString('utf8')); }
  catch { return sendJson(response, 400, { error: 'Invalid webhook body.' }); }
  if (event.event === 'charge.success' && event.data?.reference) await verifyPaystackReference(event.data.reference);
  return sendJson(response, 200, { received: true });
}

async function handlePayPalWebhook(request, response) {
  if (!process.env.PAYPAL_WEBHOOK_ID) return sendJson(response, 503, { error: 'PayPal webhook is not configured.' });
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) return sendJson(response, 413, { error: 'Webhook is too large.' });
    chunks.push(chunk);
  }
  let event;
  try { event = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { return sendJson(response, 400, { error: 'Invalid webhook body.' }); }
  const token = await paypalAccessToken();
  const verificationResponse = await fetch(`${paypalApiBase()}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_algo: request.headers['paypal-auth-algo'],
      cert_url: request.headers['paypal-cert-url'],
      transmission_id: request.headers['paypal-transmission-id'],
      transmission_sig: request.headers['paypal-transmission-sig'],
      transmission_time: request.headers['paypal-transmission-time'],
      webhook_id: process.env.PAYPAL_WEBHOOK_ID,
      webhook_event: event
    })
  });
  const verification = await verificationResponse.json().catch(() => ({}));
  if (!verificationResponse.ok || verification.verification_status !== 'SUCCESS') return sendJson(response, 403, { error: 'Invalid PayPal webhook signature.' });
  if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
    const orderId = event.resource?.supplementary_data?.related_ids?.order_id;
    if (orderId) await capturePayPalOrder(orderId);
  }
  return sendJson(response, 200, { received: true });
}

async function handleApi(request, response, url) {
  const pathname = url.pathname;
  if (pathname === '/api/config' && request.method === 'GET') return sendJson(response, 200, config());

  if (pathname === '/api/auth/signup' && request.method === 'POST') {
    rateLimit(request, pathname, 12);
    const body = await jsonBody(request);
    if (typeof body.invitationCode !== 'string' || body.invitationCode.length < 1 || body.invitationCode.length > 128) {
      throw Object.assign(new Error('Enter the admin invitation code to create an account.'), { status: 400 });
    }
    const signupPolicy = await requireDatabase().collection('signup_settings').findOne({ _id: 'registration' });
    const invitationCodeHash = sha256(body.invitationCode);
    if (!/^[a-f0-9]{64}$/i.test(signupPolicy?.invitationCodeHash || '') ||
      !safeEqual(invitationCodeHash, signupPolicy.invitationCodeHash.toLowerCase())) {
      throw Object.assign(new Error('The admin invitation code is invalid.'), { status: 403 });
    }
    const email = String(body.email || '').trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error('Enter a valid email address.'), { status: 400 });
    if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) {
      throw Object.assign(new Error('Password must be between 8 and 128 characters.'), { status: 400 });
    }
    const user = { _id: crypto.randomBytes(12).toString('hex'), email, passwordHash: await hashPassword(body.password), createdAt: new Date() };
    try { await requireDatabase().collection('users').insertOne(user); }
    catch (error) {
      if (error.code === 11000) throw Object.assign(new Error('An account with that email already exists.'), { status: 409 });
      throw error;
    }
    return sendJson(response, 200, await createSession(user));
  }

  if (pathname === '/api/auth/signin' && request.method === 'POST') {
    rateLimit(request, pathname, 12);
    const body = await jsonBody(request);
    const email = String(body.email || '').trim().toLowerCase();
    const user = await requireDatabase().collection('users').findOne({ email });
    const valid = user && typeof body.password === 'string' && await verifyPassword(body.password, user.passwordHash);
    if (!valid) throw Object.assign(new Error('Email or password is incorrect.'), { status: 401 });
    return sendJson(response, 200, await createSession(user));
  }

  if (pathname === '/api/auth/refresh' && request.method === 'POST') {
    rateLimit(request, pathname, 30);
    const body = await jsonBody(request);
    return sendJson(response, 200, await refreshSession(body.refresh_token));
  }

  if (pathname === '/api/auth/recover' && request.method === 'POST') {
    rateLimit(request, pathname, 5);
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) throw Object.assign(new Error('Password recovery email is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD.'), { status: 503 });
    const body = await jsonBody(request);
    const email = String(body.email || '').trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error('Enter a valid email address.'), { status: 400 });
    const user = await requireDatabase().collection('users').findOne({ email });
    if (user) {
      const token = crypto.randomBytes(32).toString('base64url');
      await requireDatabase().collection('users').updateOne(
        { _id: user._id },
        { $set: { passwordResetTokenHash: sha256(token), passwordResetExpiresAt: new Date(Date.now() + 30 * 60 * 1000) } }
      );
      const resetUrl = `${config().publicBaseUrl.replace(/\/+$/, '')}/?reset=${encodeURIComponent(token)}`;
      try {
        await sendEmail({
          to: email, businessName: 'Neatwork', subject: 'Reset your Neatwork password',
          text: `Use this link to reset your Neatwork password. It expires in 30 minutes: ${resetUrl}`,
          html: `<p>Use the link below to reset your Neatwork password. It expires in 30 minutes.</p><p><a href="${escapeHtml(resetUrl)}">Reset password</a></p>`
        });
      } catch (error) {
        await requireDatabase().collection('users').updateOne(
          { _id: user._id, passwordResetTokenHash: sha256(token) },
          { $unset: { passwordResetTokenHash: '', passwordResetExpiresAt: '' } }
        );
        throw error;
      }
    }
    return sendJson(response, 200, { ok: true });
  }

  if (pathname === '/api/auth/user' && request.method === 'GET') {
    return sendJson(response, 200, await authenticatedUser(request));
  }

  if (pathname === '/api/auth/update-password' && request.method === 'POST') {
    rateLimit(request, pathname, 8);
    const body = await jsonBody(request);
    if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) {
      throw Object.assign(new Error('Password must be between 8 and 128 characters.'), { status: 400 });
    }
    const token = bearerToken(request);
    const resetToken = token.startsWith('reset.') ? token.slice(6) : '';
    if (!/^[A-Za-z0-9_-]{40,100}$/.test(resetToken)) throw Object.assign(new Error('The password-reset link is invalid or expired. Request a new one.'), { status: 401 });
    const db = requireDatabase();
    const user = await db.collection('users').findOne({
      passwordResetTokenHash: sha256(resetToken), passwordResetExpiresAt: { $gt: new Date() }
    });
    if (!user) throw Object.assign(new Error('The password-reset link is invalid or expired. Request a new one.'), { status: 401 });
    const updated = await db.collection('users').updateOne(
      { _id: user._id, passwordResetTokenHash: sha256(resetToken), passwordResetExpiresAt: { $gt: new Date() } },
      { $set: { passwordHash: await hashPassword(body.password), passwordUpdatedAt: new Date() },
        $unset: { passwordResetTokenHash: '', passwordResetExpiresAt: '' } }
    );
    if (!updated.modifiedCount) throw Object.assign(new Error('The password-reset link is invalid or expired. Request a new one.'), { status: 401 });
    await db.collection('sessions').deleteMany({ userId: user._id });
    return sendJson(response, 200, { ok: true });
  }

  if (pathname === '/api/auth/logout' && request.method === 'POST') {
    const payload = decodeAccessToken(bearerToken(request), true);
    if (payload) await requireDatabase().collection('sessions').deleteOne({ _id: payload.sid, userId: payload.sub });
    return sendJson(response, 200, { ok: true });
  }

  if (pathname === '/api/public/quote' && request.method === 'GET') {
    rateLimit(request, 'public-quote', 40);
    return sendJson(response, 200, await publicQuote(url.searchParams.get('token')));
  }

  if (pathname === '/api/public/paypal/capture' && request.method === 'POST') {
    rateLimit(request, 'paypal-capture', 20);
    const body = await jsonBody(request);
    if (typeof body.orderId !== 'string' || !/^[A-Z0-9]{10,40}$/i.test(body.orderId)) {
      throw Object.assign(new Error('Invalid PayPal order.'), { status: 400 });
    }
    return sendJson(response, 200, await capturePayPalOrder(body.orderId));
  }

  if (pathname === '/api/public/paystack/verify' && request.method === 'POST') {
    rateLimit(request, 'paystack-verify', 20);
    const body = await jsonBody(request);
    return sendJson(response, 200, await verifyPaystackReference(body.reference));
  }

  const publicRespond = /^\/api\/public\/quote\/([^/]+)\/respond$/.exec(pathname);
  if (publicRespond && request.method === 'POST') {
    rateLimit(request, 'public-respond', 12);
    const token = publicRespond[1];
    if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) throw Object.assign(new Error('This approval link is invalid.'), { status: 404 });
    const body = await jsonBody(request);
    if (!['accepted', 'declined'].includes(body.response)) throw Object.assign(new Error('Response must be accepted or declined.'), { status: 400 });
    const link = await requireDatabase().collection('quote_links').findOne({ tokenHash: sha256(token), expiresAt: { $gte: new Date() } });
    if (!link) throw Object.assign(new Error('This approval link has expired or is invalid.'), { status: 404 });
    const updated = await updateWorkspaceWithRetry(link.userId, (data) => {
      const quote = data.quotes?.find((item) => item.id === link.quoteId);
      if (!quote || quote.status !== 'sent' || quote.validUntil < new Date().toISOString().slice(0, 10)) {
        throw Object.assign(new Error('This quote is no longer accepting responses.'), { status: 409 });
      }
      quote.status = body.response;
      quote.respondedAt = new Date().toISOString();
      return true;
    });
    const quote = updated.data.quotes.find((item) => item.id === link.quoteId);
    return sendJson(response, 200, { status: quote.status, businessName: updated.data.settings?.businessName || 'Local business' });
  }

  if (pathname === '/api/stripe/webhook' && request.method === 'POST') return handleStripeWebhook(request, response);

  const user = await authenticatedUser(request);
  if (pathname === '/api/workspace' && request.method === 'GET') {
    const row = await workspaceFor(user.id);
    return sendJson(response, 200, { data: row.data, revision: row.revision });
  }

  if (pathname === '/api/workspace' && request.method === 'PUT') {
    const body = await jsonBody(request);
    if (!Number.isSafeInteger(body.revision) || body.revision < 0) throw Object.assign(new Error('Workspace revision is required.'), { status: 400 });
    try { return sendJson(response, 200, await saveWorkspace(user.id, body.data, body.revision)); }
    catch (error) {
      if (isRevisionConflict(error)) throw Object.assign(new Error('This workspace changed in another tab or device. Reload before saving to avoid overwriting newer changes.'), { status: 409 });
      throw error;
    }
  }

  const quoteShare = /^\/api\/quotes\/([^/]+)\/share$/.exec(pathname);
  if (quoteShare && request.method === 'POST') {
    rateLimit(request, `quote-share:${user.id}`, 20);
    const body = await jsonBody(request);
    if (!['email', 'sms', 'link'].includes(body.channel)) throw Object.assign(new Error('Choose email, SMS, or link.'), { status: 400 });
    const row = await workspaceFor(user.id);
    const quote = row.data?.quotes?.find((item) => item.id === decodeURIComponent(quoteShare[1]));
    const customer = quote && row.data.customers.find((item) => item.id === quote.customerId);
    if (!quote || !customer) throw Object.assign(new Error('Quote or customer could not be found.'), { status: 404 });
    if (!['draft', 'sent'].includes(quote.status) || quote.validUntil < new Date().toISOString().slice(0, 10)) throw Object.assign(new Error('Only unexpired draft or sent quotes can be shared.'), { status: 409 });
    if (body.channel === 'email' && !customer.email) throw Object.assign(new Error('Add an email address to the customer first.'), { status: 400 });
    if (body.channel === 'sms' && !customer.phone) throw Object.assign(new Error('Add a phone number to the customer first.'), { status: 400 });
    if (body.channel === 'sms' && !customer.smsConsent) throw Object.assign(new Error('Record the customer’s SMS consent before sending a text.'), { status: 403 });
    const link = await createQuoteLink(user.id, quote, customer, row.data, row.revision);
    if (body.channel === 'link') {
      if (quote.status === 'draft') {
        quote.status = 'sent';
        quote.sentAt = new Date().toISOString();
        const saved = await saveWorkspace(user.id, row.data, row.revision);
        return sendJson(response, 200, { url: link.url, revision: saved.revision });
      }
      return sendJson(response, 200, { url: link.url });
    }
    const businessName = businessNameFor(row.data);
    if (body.channel === 'email') {
      await sendEmail({ to: customer.email, subject: `${businessName}: quote ${quote.number}`, html: quoteEmailHtml(quote, customer, row.data, link.url), text: `Hello ${customer.name}, ${businessName} has prepared quote ${quote.number} for you. Review and respond here: ${link.url}\n\nThank you,\n${businessName}`, businessName });
    } else {
      await sendSms({ to: customer.phone, body: `${businessName}: quote ${quote.number} is ready for your review. ${link.url} Reply STOP to opt out.` });
    }
    if (quote.status === 'draft') {
      quote.status = 'sent';
      quote.sentAt = new Date().toISOString();
      const saved = await saveWorkspace(user.id, row.data, row.revision);
      return sendJson(response, 200, { sent: true, revision: saved.revision });
    }
    return sendJson(response, 200, { sent: true });
  }

  const paymentLink = /^\/api\/invoices\/([^/]+)\/payment-link$/.exec(pathname);
  if (paymentLink && request.method === 'POST') {
    rateLimit(request, `invoice-payment:${user.id}`, 20);
    const body = await jsonBody(request);
    const row = await workspaceFor(user.id);
    const invoice = row.data?.invoices?.find((item) => item.id === decodeURIComponent(paymentLink[1]));
    const customer = invoice && row.data.customers.find((item) => item.id === invoice.customerId);
    if (!invoice || !customer) throw Object.assign(new Error('Invoice or customer could not be found.'), { status: 404 });
    const balanceMinor = balanceDueMinor(invoice);
    if (!balanceMinor) throw Object.assign(new Error('This invoice has no remaining balance.'), { status: 409 });
    const currency = invoiceCurrency(invoice, row.data);
    const amountMinor = requestedAmountMinor(body.amount === undefined ? fromMinor(balanceMinor, currency) : body.amount, balanceMinor, currency);
    const provider = body.provider || 'stripe';
    if (!['stripe', 'paystack', 'paypal', 'bank_transfer'].includes(provider)) throw Object.assign(new Error('Choose a supported payment method.'), { status: 400 });
    if (body.channel !== undefined && !['link', 'email', 'sms'].includes(body.channel)) throw Object.assign(new Error('Choose a checkout link, email, or SMS.'), { status: 400 });
    if (body.channel === 'email' && !customer.email) throw Object.assign(new Error('Add an email address to the customer first.'), { status: 400 });
    if (body.channel === 'sms' && !customer.phone) throw Object.assign(new Error('Add a phone number to the customer first.'), { status: 400 });
    if (body.channel === 'sms' && !customer.smsConsent) throw Object.assign(new Error('Record the customer’s SMS consent before sending a text.'), { status: 403 });
    if (provider === 'bank_transfer') {
      const businessName = businessNameFor(row.data);
      const instructions = String(row.data.settings?.bankTransferInstructions || '').trim();
      if (!instructions) throw Object.assign(new Error('Add bank transfer instructions in Business settings first.'), { status: 400 });
      const amount = new Intl.NumberFormat('en', { style: 'currency', currency }).format(fromMinor(amountMinor, currency));
      const text = `Hello ${customer.name}, ${businessName} requests ${amount} toward invoice ${invoice.number} by bank transfer.\n\n${instructions}\n\nPlease include invoice ${invoice.number} as the payment reference. ${businessName} will update the invoice after confirming receipt.`;
      const paymentId = crypto.randomUUID();
      const paymentDate = new Date().toISOString().slice(0, 10);
      const saved = await updateWorkspaceWithRetry(user.id, (data) => {
        const currentInvoice = data.invoices?.find((item) => item.id === invoice.id);
        if (!currentInvoice) throw Object.assign(new Error('Invoice not found.'), { status: 404 });
        const currentCurrency = invoiceCurrency(currentInvoice, data);
        const currentBalance = balanceDueMinor(currentInvoice);
        if (currentCurrency !== currency || amountMinor > currentBalance) throw Object.assign(new Error('Invoice balance changed. Refresh and retry the transfer request.'), { status: 409 });
        currentInvoice.payments = Array.isArray(currentInvoice.payments) ? currentInvoice.payments : [];
        currentInvoice.payments.push({
          id: paymentId,
          reference: paymentId,
          type: 'bank_transfer_pending',
          status: 'pending',
          amount: fromMinor(amountMinor, currency),
          date: paymentDate,
          method: 'bank_transfer',
          note: 'Awaiting business confirmation',
          createdAt: new Date().toISOString()
        });
        return true;
      }, row);
      if (body.channel === 'email') await sendEmail({ to: customer.email, subject: `${businessName}: bank transfer details for invoice ${invoice.number}`, text: `${text}\n\nThank you,\n${businessName}`, html: `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`, businessName });
      else if (body.channel === 'sms') await sendSms({ to: customer.phone, body: `${text} Reply STOP to opt out.` });
      else if (body.channel !== 'link') throw Object.assign(new Error('Choose a checkout link, email, or SMS.'), { status: 400 });
      return sendJson(response, 200, { instructions: text, amount: fromMinor(amountMinor, currency), balanceDue: fromMinor(balanceMinor, currency), revision: saved.revision });
    }
    if (provider === 'paystack' && currency !== 'NGN') {
      throw Object.assign(new Error('Paystack checkout is currently enabled for Nigerian Naira invoices only.'), { status: 400 });
    }
    let checkout;
    if (provider === 'stripe') {
      const previousUrl = invoice.checkoutUrl;
      const previousAmount = invoice.checkoutAmountMinor;
      const sessionUrl = await getOrCreatePaymentUrl(user.id, invoice, customer, row.data, false, amountMinor);
      invoice.paymentLinks = { ...(invoice.paymentLinks || {}), stripe: {
        id: invoice.checkoutSessionId,
        url: sessionUrl,
        amountMinor,
        expiresAt: invoice.checkoutUrlExpiresAt
      } };
      if (body.channel === 'email' || body.channel === 'sms') {
        const businessName = businessNameFor(row.data);
        const amount = new Intl.NumberFormat('en', { style: 'currency', currency }).format(fromMinor(amountMinor, currency));
        const text = `Hello ${customer.name}, ${businessName} has prepared invoice ${invoice.number} for ${amount}. Pay securely here: ${sessionUrl}`;
        if (body.channel === 'email') await sendEmail({ to: customer.email, subject: `${businessName}: invoice ${invoice.number} and payment link`, text, html: `<p>${escapeHtml(text)}</p>`, businessName });
        else await sendSms({ to: customer.phone, body: `${text} Reply STOP to opt out.` });
      }
      const saved = previousUrl === invoice.checkoutUrl && previousAmount === amountMinor ? { revision: row.revision } : await saveWorkspace(user.id, row.data, row.revision);
      checkout = { url: sessionUrl, amount: fromMinor(amountMinor, currency), balanceDue: fromMinor(balanceMinor, currency), revision: saved.revision };
    } else {
      const payment = await createAlternativePaymentLink(user.id, invoice, customer, row.data, provider, amountMinor);
      if (body.channel === 'email' || body.channel === 'sms') {
        const businessName = businessNameFor(row.data);
        const amount = new Intl.NumberFormat('en', { style: 'currency', currency }).format(fromMinor(amountMinor, currency));
        const text = `Hello ${customer.name}, ${businessName} has prepared invoice ${invoice.number} for ${amount}. Pay securely here: ${payment.url}`;
        if (body.channel === 'email') await sendEmail({ to: customer.email, subject: `${businessName}: invoice ${invoice.number} and payment link`, text, html: `<p>${escapeHtml(text)}</p>`, businessName });
        else await sendSms({ to: customer.phone, body: `${text} Reply STOP to opt out.` });
      }
      checkout = { url: payment.url, amount: fromMinor(amountMinor, currency), balanceDue: fromMinor(balanceMinor, currency) };
    }
    return sendJson(response, 200, checkout);
  }

  const manualReminder = /^\/api\/invoices\/([^/]+)\/remind$/.exec(pathname);
  if (manualReminder && request.method === 'POST') {
    rateLimit(request, `invoice-reminder:${user.id}`, 20);
    const body = await jsonBody(request);
    const row = await workspaceFor(user.id);
    const invoice = row.data?.invoices?.find((item) => item.id === decodeURIComponent(manualReminder[1]));
    const customer = invoice && row.data.customers.find((item) => item.id === invoice.customerId);
    if (!invoice || !customer) throw Object.assign(new Error('Invoice or customer could not be found.'), { status: 404 });
    if (!balanceDueMinor(invoice)) throw Object.assign(new Error('This invoice has no remaining balance.'), { status: 409 });
    if (!['email', 'sms'].includes(body.channel)) throw Object.assign(new Error('Choose email or SMS.'), { status: 400 });
    if (body.channel === 'email' && !customer.email) throw Object.assign(new Error('Add an email address to the customer first.'), { status: 400 });
    if (body.channel === 'sms' && !customer.phone) throw Object.assign(new Error('Add a phone number to the customer first.'), { status: 400 });
    if (body.channel === 'sms' && !customer.smsConsent) throw Object.assign(new Error('Record the customer’s SMS consent before sending a text.'), { status: 403 });
    const link = await getReminderPaymentUrl(user.id, invoice, customer, row.data);
    const text = invoiceReminderMessage(invoice, customer, row.data, link);
    const businessName = businessNameFor(row.data);
    if (body.channel === 'email') {
      await sendEmail({ to: customer.email, subject: `${businessName}: payment reminder for invoice ${invoice.number}`, text, html: `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`, businessName });
    } else {
      await sendSms({ to: customer.phone, body: `${text} Reply STOP to opt out.` });
    }
    return sendJson(response, 200, { sent: true });
  }

  throw Object.assign(new Error('Not found.'), { status: 404 });
}

function staticFile(response, pathname) {
  const file = PUBLIC_FILES.get(pathname);
  if (!file) return false;
  fs.readFile(path.join(ROOT, file[0]), (error, contents) => {
    if (error) {
      console.error(`Unable to serve ${file[0]}:`, error);
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
      response.end('Unable to load the app file');
      return;
    }
    response.writeHead(200, {
      'Content-Type': file[1],
      'Content-Length': contents.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    response.end(contents);
  });
  return true;
}

const server = http.createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self' https://api.stripe.com; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  if (request.method === 'OPTIONS') {
    response.writeHead(204, { Allow: 'GET, HEAD, POST, PUT, OPTIONS' });
    return response.end();
  }
  let url;
  try { url = new URL(request.url, `http://${request.headers.host || 'localhost'}`); }
  catch { response.writeHead(400); return response.end('Bad request'); }

  try {
    if (url.pathname === '/api/stripe/webhook') {
      if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed.' }, { Allow: 'POST' });
      return await handleStripeWebhook(request, response);
    }
    if (url.pathname === '/api/paystack/webhook') {
      if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed.' }, { Allow: 'POST' });
      return await handlePaystackWebhook(request, response);
    }
    if (url.pathname === '/api/paypal/webhook') {
      if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed.' }, { Allow: 'POST' });
      return await handlePayPalWebhook(request, response);
    }
    if (url.pathname === '/api/twilio/inbound') {
      if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed.' }, { Allow: 'POST' });
      return await handleTwilioInbound(request, response);
    }
    if (url.pathname.startsWith('/api/')) {
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return sendJson(response, 405, { error: 'Method not allowed.' });
      return await handleApi(request, response, url);
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
      return response.end('Method not allowed');
    }
    if (!staticFile(response, url.pathname)) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
      response.end('Not found');
    }
  } catch (error) {
    if (error.status >= 500) console.error('Request failed:', error.message);
    const status = Number.isInteger(error.status) ? error.status : 500;
    sendJson(response, status, { error: status >= 500 && status !== 503 ? 'The server could not complete the request.' : error.message });
  }
});

server.on('error', (error) => {
  console.error('Unable to start the local app server:', error.message);
  process.exitCode = 1;
});

async function startServer() {
  if (process.env.NODE_ENV === 'production' && !config().publicBaseUrl.startsWith('https://')) {
    console.error('PUBLIC_BASE_URL must use HTTPS in production.');
    process.exitCode = 1;
    return;
  }
  try {
    await connectMongo();
  } catch (error) {
    console.error('Unable to connect to MongoDB:', error.message);
    process.exitCode = 1;
    return;
  }
  server.listen(PORT, HOST, () => {
    console.log(`Neatwork is running at http://${HOST}:${PORT}`);
    console.log('Press Ctrl+C to stop the server.');
    reminderSweep();
    setInterval(reminderSweep, 15 * 60 * 1000).unref();
  });
}

startServer();
