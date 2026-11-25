(() => {
  'use strict';

  const STORAGE_KEY = 'neatwork.v1';
  const root = document.getElementById('view-root');
  const toast = document.getElementById('toast');
  const currencyNames = { EUR: 'Euro', USD: 'US Dollar', GBP: 'Pound Sterling', CAD: 'Canadian Dollar', AUD: 'Australian Dollar', NGN: 'Nigerian Naira', GHS: 'Ghanaian Cedi', ZAR: 'South African Rand', KES: 'Kenyan Shilling', TZS: 'Tanzanian Shilling', CHF: 'Swiss Franc', NZD: 'New Zealand Dollar', INR: 'Indian Rupee', SGD: 'Singapore Dollar', AED: 'UAE Dirham', CZK: 'Czech Koruna', DKK: 'Danish Krone', SEK: 'Swedish Krona', NOK: 'Norwegian Krone', PLN: 'Polish Zloty', HUF: 'Hungarian Forint', RON: 'Romanian Leu', TRY: 'Turkish Lira', ISK: 'Icelandic Krona', UAH: 'Ukrainian Hryvnia', BRL: 'Brazilian Real', MXN: 'Mexican Peso', ARS: 'Argentine Peso', CLP: 'Chilean Peso', COP: 'Colombian Peso', PEN: 'Peruvian Sol', JPY: 'Japanese Yen', CNY: 'Chinese Yuan', KRW: 'South Korean Won', HKD: 'Hong Kong Dollar', MYR: 'Malaysian Ringgit', THB: 'Thai Baht', IDR: 'Indonesian Rupiah', PHP: 'Philippine Peso', PKR: 'Pakistani Rupee', BDT: 'Bangladeshi Taka', SAR: 'Saudi Riyal', QAR: 'Qatari Riyal', KWD: 'Kuwaiti Dinar', BHD: 'Bahraini Dinar', OMR: 'Omani Rial', EGP: 'Egyptian Pound', MAD: 'Moroccan Dirham' };
  const countryCurrencies = { NG: 'NGN', US: 'USD', NL: 'EUR', DE: 'EUR', FR: 'EUR', IE: 'EUR', BE: 'EUR', ES: 'EUR', IT: 'EUR', PT: 'EUR', GB: 'GBP', CA: 'CAD', AU: 'AUD', GH: 'GHS', ZA: 'ZAR', KE: 'KES', TZ: 'TZS', CH: 'CHF', NZ: 'NZD', IN: 'INR', SG: 'SGD', AE: 'AED', AT: 'EUR', GR: 'EUR', FI: 'EUR', LU: 'EUR', MT: 'EUR', CY: 'EUR', EE: 'EUR', LV: 'EUR', LT: 'EUR', SK: 'EUR', SI: 'EUR', HR: 'EUR', BG: 'EUR', CZ: 'CZK', DK: 'DKK', SE: 'SEK', NO: 'NOK', PL: 'PLN', HU: 'HUF', RO: 'RON', TR: 'TRY', IS: 'ISK', UA: 'UAH', BR: 'BRL', MX: 'MXN', AR: 'ARS', CL: 'CLP', CO: 'COP', PE: 'PEN', JP: 'JPY', CN: 'CNY', KR: 'KRW', HK: 'HKD', MY: 'MYR', TH: 'THB', ID: 'IDR', PH: 'PHP', PK: 'PKR', BD: 'BDT', SA: 'SAR', QA: 'QAR', KW: 'KWD', BH: 'BHD', OM: 'OMR', EG: 'EGP', MA: 'MAD' };
  const countryNames = { NG: 'Nigeria', US: 'United States', NL: 'Netherlands', DE: 'Germany', FR: 'France', IE: 'Ireland', BE: 'Belgium', ES: 'Spain', IT: 'Italy', PT: 'Portugal', GB: 'United Kingdom', CA: 'Canada', AU: 'Australia', GH: 'Ghana', ZA: 'South Africa', KE: 'Kenya', TZ: 'Tanzania', CH: 'Switzerland', NZ: 'New Zealand', IN: 'India', SG: 'Singapore', AE: 'United Arab Emirates', AT: 'Austria', GR: 'Greece', FI: 'Finland', LU: 'Luxembourg', MT: 'Malta', CY: 'Cyprus', EE: 'Estonia', LV: 'Latvia', LT: 'Lithuania', SK: 'Slovakia', SI: 'Slovenia', HR: 'Croatia', BG: 'Bulgaria', CZ: 'Czechia', DK: 'Denmark', SE: 'Sweden', NO: 'Norway', PL: 'Poland', HU: 'Hungary', RO: 'Romania', TR: 'Turkey', IS: 'Iceland', UA: 'Ukraine', BR: 'Brazil', MX: 'Mexico', AR: 'Argentina', CL: 'Chile', CO: 'Colombia', PE: 'Peru', JP: 'Japan', CN: 'China', KR: 'South Korea', HK: 'Hong Kong', MY: 'Malaysia', TH: 'Thailand', ID: 'Indonesia', PH: 'Philippines', PK: 'Pakistan', BD: 'Bangladesh', SA: 'Saudi Arabia', QA: 'Qatar', KW: 'Kuwait', BH: 'Bahrain', OM: 'Oman', EG: 'Egypt', MA: 'Morocco' };
  const detectBrowserCountry = () => {
    const region = (navigator.language || 'en-US').split('-').pop().toUpperCase();
    return countryCurrencies[region] ? region : 'US';
  };
  const defaultCountryForCurrency = (currency) => Object.keys(countryCurrencies).find((country) => countryCurrencies[country] === currency) || 'US';
  const initialCountry = detectBrowserCountry();
  const initialState = {
    settings: { businessName: '', businessCountry: initialCountry, currency: countryCurrencies[initialCountry], taxRate: 0 },
    customers: [],
    serviceTemplates: [],
    quotes: [],
    invoices: [],
    counters: { quote: 1, invoice: 1 }
  };
  const legacyState = loadState();
  let state = structuredClone(initialState);
  let persistedSnapshot = JSON.stringify(state);
  let activeView = 'dashboard';
  let toastTimer;
  let confirmationHandler = null;
  let editingQuoteId = null;
  let editingCustomerId = null;
  let showArchivedCustomers = false;
  let showArchivedQuotes = false;
  let paymentDialogInvoiceId = null;
  let paymentDialogChannel = null;
  let adjustingPaymentId = null;
  let refundPaymentContext = null;
  let plannedInvoiceId = null;
  let authMode = 'signin';
  let appConfig = null;
  let userSession = null;
  let workspaceRevision = 0;
  let cloudSaveQueue = Promise.resolve();
  let cloudBlocked = false;
  let lastCloudSnapshot = JSON.stringify(initialState);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const localDate = (date = new Date()) => {
    const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return adjusted.toISOString().slice(0, 10);
  };
  const addDays = (date, count) => {
    const result = new Date(`${date}T12:00:00`);
    result.setDate(result.getDate() + count);
    return localDate(result);
  };
  const money = (amount, currency = state.settings.currency || 'EUR') => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(amount) || 0);
  const makeId = () => globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const currencyDigits = (currency = state.settings.currency || 'EUR') => new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
  const roundMoney = (amount, currency = state.settings.currency || 'EUR') => {
    const scale = 10 ** currencyDigits(currency);
    return Math.round((amount + Number.EPSILON) * scale) / scale;
  };
  const amountInputValue = (amount, currency) => Number(amount).toFixed(currencyDigits(currency));

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return structuredClone(initialState);
      const parsed = JSON.parse(saved);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.customers) || !Array.isArray(parsed.quotes) || !Array.isArray(parsed.invoices)) {
        throw new Error('Saved workspace data is not in the expected format.');
      }
      return {
        ...structuredClone(initialState),
        ...parsed,
        settings: {
          ...initialState.settings,
          ...(parsed.settings || {}),
          businessCountry: countryCurrencies[parsed.settings?.businessCountry]
            ? parsed.settings.businessCountry
            : defaultCountryForCurrency(parsed.settings?.currency || initialState.settings.currency)
        },
        serviceTemplates: Array.isArray(parsed.serviceTemplates)
          ? parsed.serviceTemplates.map((template) => ({ ...template, currency: template.currency || parsed.settings?.currency || initialState.settings.currency }))
          : [],
        quotes: parsed.quotes.map((quote) => ({ ...quote, currency: quote.currency || parsed.settings?.currency || initialState.settings.currency })),
        invoices: parsed.invoices.map((invoice) => ({ ...invoice, currency: invoice.currency || parsed.settings?.currency || initialState.settings.currency })),
        counters: { ...initialState.counters, ...(parsed.counters || {}) }
      };
    } catch (error) {
      console.error('Unable to load Neatwork workspace data.', error);
      window.setTimeout(() => showToast('Saved data could not be loaded. Your existing browser data was left unchanged.', true), 0);
      return structuredClone(initialState);
    }
  }

  function saveState() {
    try {
      persistedSnapshot = JSON.stringify(state);
      updateBusinessLabel();
      if (!userSession?.user?.id) {
        showToast('Sign in before saving workspace data.', true);
        return false;
      }
      localStorage.setItem(`${STORAGE_KEY}.${userSession.user.id}`, persistedSnapshot);
    } catch (error) {
      console.error('Unable to save Neatwork workspace data.', error);
      state = JSON.parse(persistedSnapshot);
      render();
      showToast('Could not save a local recovery copy. Check browser storage.', true);
      return false;
    }
    if (cloudBlocked) {
      showToast('Cloud saving is paused. Reload the latest workspace before making more changes.', true);
      return false;
    }
    setCloudStatus('syncing', 'Saving to cloud…');
    const snapshot = persistedSnapshot;
    const ownerId = userSession.user.id;
    cloudSaveQueue = cloudSaveQueue.then(async () => {
      if (cloudBlocked || userSession?.user?.id !== ownerId) return;
      const saved = await apiRequest('/api/workspace', { method: 'PUT', body: { data: JSON.parse(snapshot), revision: workspaceRevision } });
      if (userSession?.user?.id !== ownerId) return;
      workspaceRevision = saved.revision;
      lastCloudSnapshot = JSON.stringify(saved.data);
      localStorage.setItem(`${STORAGE_KEY}.${userSession.user.id}`, lastCloudSnapshot);
      setCloudStatus('', 'Synced to cloud');
    }).catch(async (error) => {
      if (userSession?.user?.id !== ownerId) return;
      console.error('Unable to sync workspace changes.', error);
      cloudBlocked = true;
      setCloudStatus('failed', 'Cloud sync paused');
      try {
        const latest = await apiRequest('/api/workspace');
        workspaceRevision = latest.revision;
        if (latest.data) {
          state = normalizeWorkspace(latest.data);
          lastCloudSnapshot = JSON.stringify(state);
          persistedSnapshot = lastCloudSnapshot;
          localStorage.setItem(`${STORAGE_KEY}.${userSession.user.id}`, lastCloudSnapshot);
          render();
        }
      } catch (reloadError) {
        console.error('Unable to reload the cloud workspace after a sync failure.', reloadError);
      }
      showToast(`Changes were not synced: ${error.message}`, true);
    });
    return true;
  }

  function setCloudStatus(className, text) {
    const badge = document.getElementById('cloud-status');
    if (!badge) return;
    badge.classList.remove('syncing', 'failed');
    if (className) badge.classList.add(className);
    document.getElementById('cloud-status-text').textContent = text;
  }

  function normalizeWorkspace(data) {
    const legacyCurrency = data.settings?.currency || initialState.settings.currency;
    return {
      ...structuredClone(initialState),
      ...data,
      settings: {
        ...initialState.settings,
        ...(data.settings || {}),
        businessCountry: countryCurrencies[data.settings?.businessCountry]
          ? data.settings.businessCountry
          : defaultCountryForCurrency(data.settings?.currency || initialState.settings.currency)
      },
      customers: Array.isArray(data.customers) ? data.customers : [],
      serviceTemplates: Array.isArray(data.serviceTemplates)
        ? data.serviceTemplates.map((template) => ({ ...template, currency: template.currency || legacyCurrency }))
        : [],
      quotes: Array.isArray(data.quotes) ? data.quotes.map((quote) => ({ ...quote, currency: quote.currency || legacyCurrency })) : [],
      invoices: Array.isArray(data.invoices) ? data.invoices.map((invoice) => ({ ...invoice, currency: invoice.currency || legacyCurrency })) : [],
      counters: { ...initialState.counters, ...(data.counters || {}) }
    };
  }

  async function rawApiRequest(path, { method = 'GET', body, token } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || result.message || `Request failed (${response.status}).`);
    return result;
  }

  function persistSession(session) {
    userSession = session;
    if (session) localStorage.setItem('neatwork.session', JSON.stringify(session));
    else localStorage.removeItem('neatwork.session');
  }

  async function refreshSession() {
    if (!userSession?.refresh_token) throw new Error('Your session expired. Sign in again.');
    const refreshed = await rawApiRequest('/api/auth/refresh', { method: 'POST', body: { refresh_token: userSession.refresh_token } });
    persistSession({ ...refreshed, expires_at: Date.now() / 1000 + Number(refreshed.expires_in || 3600) });
    return userSession.access_token;
  }

  async function apiRequest(path, { method = 'GET', body, retryAuth = true } = {}) {
    if (!userSession?.access_token) throw new Error('Sign in to continue.');
    try {
      return await rawApiRequest(path, { method, body, token: userSession.access_token });
    } catch (error) {
      if (!retryAuth || !/session|token|jwt|unauthorized/i.test(error.message)) throw error;
      try {
        const token = await refreshSession();
        return await rawApiRequest(path, { method, body, token });
      } catch (refreshError) {
        await signOut(false);
        throw refreshError;
      }
    }
  }

  async function refreshWorkspace() {
    const ownerId = userSession?.user?.id;
    const remote = await apiRequest('/api/workspace');
    if (userSession?.user?.id !== ownerId) return;
    if (!remote.data) throw new Error('The cloud workspace is not available.');
    state = normalizeWorkspace(remote.data);
    workspaceRevision = remote.revision;
    persistedSnapshot = JSON.stringify(state);
    lastCloudSnapshot = persistedSnapshot;
    localStorage.setItem(`${STORAGE_KEY}.${userSession.user.id}`, persistedSnapshot);
    setCloudStatus('', 'Synced to cloud');
    render();
  }

  function setAuthMessage(message, isError = false) {
    const output = document.getElementById('auth-message');
    output.textContent = message;
    output.classList.toggle('error', isError);
  }

  function setAuthMode(mode) {
    authMode = mode;
    const recovery = mode === 'recover';
    const signup = mode === 'signup';
    const updatePassword = mode === 'update';
    const form = document.getElementById('auth-form');
    document.getElementById('auth-title').textContent = recovery ? 'Reset your password' : updatePassword ? 'Choose a new password' : signup ? 'Create your account' : 'Welcome back';
    document.getElementById('auth-description').textContent = recovery
      ? 'We’ll send a password reset link to your email address.'
      : updatePassword ? 'Set a new password for your Neatwork account.'
        : signup ? 'Create a private workspace for customer records, sales, invoices, and payments.' : 'Sign in to manage customers, quotes, invoices, and payments in one secure workspace.';
    document.getElementById('auth-password-label').hidden = recovery;
    document.getElementById('auth-invitation-label').hidden = !signup;
    document.getElementById('auth-email-label').hidden = updatePassword;
    document.querySelector('#auth-form [name=email]').required = !updatePassword;
    document.querySelector('#auth-form [name=password]').required = !recovery;
    document.querySelector('#auth-form [name=invitationCode]').required = signup;
    form.querySelectorAll('input').forEach((input) => { input.disabled = updatePassword && input.name !== 'password'; });
    document.querySelector('#auth-form [name=password]').autocomplete = signup || updatePassword ? 'new-password' : 'current-password';
    document.querySelector('#auth-form [name=password]').placeholder = updatePassword ? 'Choose at least 8 characters' : 'At least 8 characters';
    document.getElementById('auth-submit').textContent = recovery ? 'Send reset link' : updatePassword ? 'Update password' : signup ? 'Create account' : 'Sign in';
    document.querySelector('[data-auth-mode=signin]').hidden = mode === 'signin';
    document.querySelector('[data-auth-mode=signup]').hidden = signup || updatePassword;
    document.querySelector('[data-auth-mode=recover]').hidden = recovery || signup || updatePassword;
    document.getElementById('auth-message').textContent = '';
  }

  function showAuthGate(message = '') {
    document.getElementById('auth-gate').classList.remove('is-hidden');
    document.querySelector('.app-shell').classList.add('is-locked');
    document.querySelector('.app-shell').setAttribute('inert', '');
    if (message) setAuthMessage(message, true);
  }

  async function enterWorkspace(session) {
    persistSession({ ...session, expires_at: session.expires_at || Date.now() / 1000 + Number(session.expires_in || 3600) });
    setAuthMessage('Loading your private workspace…');
    const remote = await apiRequest('/api/workspace');
    workspaceRevision = remote.revision;
    cloudBlocked = false;
    cloudSaveQueue = Promise.resolve();
    if (remote.data) {
      state = normalizeWorkspace(remote.data);
    } else {
      const cached = localStorage.getItem(`${STORAGE_KEY}.${userSession.user.id}`);
      let uploadCachedWorkspace = false;
      if (cached) {
        try {
          state = normalizeWorkspace(JSON.parse(cached));
          uploadCachedWorkspace = true;
        }
        catch (error) {
          console.error('Unable to load cached workspace.', error);
          state = structuredClone(initialState);
        }
      } else if (legacyState.customers.length || legacyState.quotes.length || legacyState.invoices.length || legacyState.settings.businessName) {
        state = structuredClone(legacyState);
        if (window.confirm('Import the existing workspace from this browser into your new cloud account?')) {
          workspaceRevision = 0;
          persistedSnapshot = JSON.stringify(state);
          if (!saveState()) throw new Error('Could not start workspace migration.');
        } else {
          state = structuredClone(initialState);
        }
      } else {
        state = structuredClone(initialState);
      }
      if (uploadCachedWorkspace) {
        workspaceRevision = 0;
        persistedSnapshot = JSON.stringify(state);
        if (!saveState()) throw new Error('Could not upload the saved local workspace.');
      }
    }
    persistedSnapshot = JSON.stringify(state);
    lastCloudSnapshot = persistedSnapshot;
    if (userSession.user?.id) localStorage.setItem(`${STORAGE_KEY}.${userSession.user.id}`, persistedSnapshot);
    document.getElementById('account-email').textContent = userSession.user?.email || 'Cloud workspace';
    document.getElementById('auth-gate').classList.add('is-hidden');
    const shell = document.querySelector('.app-shell');
    shell.classList.remove('is-locked');
    shell.removeAttribute('inert');
    setCloudStatus('', 'Synced to cloud');
    updateBusinessLabel();
    render('dashboard');
  }

  async function signOut(callServer = true) {
    if (callServer) await cloudSaveQueue;
    const oldSession = userSession;
    if (callServer && oldSession?.access_token) {
      try { await rawApiRequest('/api/auth/logout', { method: 'POST', token: oldSession.access_token }); }
      catch (error) { console.warn('Server sign-out failed; clearing this browser session.', error); }
    }
    persistSession(null);
    state = structuredClone(initialState);
    workspaceRevision = 0;
    cloudBlocked = false;
    document.getElementById('account-email').textContent = 'Cloud workspace';
    render('dashboard');
    showAuthGate('You have signed out.');
  }

  async function initializeAuth() {
    const resetToken = new URLSearchParams(location.search).get('reset');
    if (resetToken) history.replaceState(null, '', location.pathname);
    try {
      appConfig = await rawApiRequest('/api/config');
      if (!appConfig.cloudEnabled) {
        showAuthGate('Set MONGODB_URI, MONGODB_DB, and SESSION_SECRET in .env, then restart the server.');
        document.getElementById('auth-submit').disabled = true;
        return;
      }
      if (resetToken) {
        userSession = { access_token: `reset.${resetToken}` };
        setAuthMode('update');
        showAuthGate();
        return;
      }
      const savedSession = localStorage.getItem('neatwork.session');
      if (savedSession) {
        try {
          const parsed = JSON.parse(savedSession);
          if (parsed.access_token && parsed.refresh_token) {
            persistSession(parsed);
            await enterWorkspace(parsed);
            return;
          }
        } catch (error) {
          console.warn('Saved cloud session is no longer valid.', error);
          persistSession(null);
        }
      }
      showAuthGate();
    } catch (error) {
      console.error('Cloud setup check failed.', error);
      showAuthGate(`Could not connect to the app server: ${error.message}`);
      document.getElementById('auth-submit').disabled = true;
    }
  }

  async function submitAuth(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get('email') || '').trim();
    const password = String(new FormData(form).get('password') || '');
    const invitationCode = String(new FormData(form).get('invitationCode') || '');
    const submit = document.getElementById('auth-submit');
    submit.disabled = true;
    setAuthMessage(authMode === 'recover' ? 'Sending reset email…' : 'Connecting securely…');
    try {
      if (authMode === 'recover') {
        await rawApiRequest('/api/auth/recover', { method: 'POST', body: { email } });
        setAuthMessage('If the address belongs to an account, a password-reset email has been sent.');
      } else if (authMode === 'update') {
        await rawApiRequest('/api/auth/update-password', { method: 'POST', body: { password }, token: userSession.access_token });
        persistSession(null);
        userSession = null;
        setAuthMode('signin');
        setAuthMessage('Password updated. Sign in with your new password.');
      } else if (authMode === 'signup') {
        const result = await rawApiRequest('/api/auth/signup', { method: 'POST', body: { email, password, invitationCode } });
        if (result.access_token) await enterWorkspace(result);
        else setAuthMessage('Account created. Check your email to confirm the address, then sign in.');
      } else {
        const result = await rawApiRequest('/api/auth/signin', { method: 'POST', body: { email, password } });
        await enterWorkspace(result);
      }
    } catch (error) {
      console.error('Authentication request failed.', error);
      setAuthMessage(error.message, true);
    } finally {
      submit.disabled = false;
    }
  }

  function showToast(message, isError = false) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.toggle('error', isError);
    toast.classList.add('visible');
    toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 3600);
  }

  function updateBusinessLabel() {
    const name = state.settings.businessName.trim() || 'Your business';
    document.getElementById('business-name-label').textContent = name;
    document.querySelector('.avatar').textContent = name === 'Your business' ? 'N' : name.charAt(0).toUpperCase();
  }

  function customerFor(id) {
    return state.customers.find((customer) => customer.id === id);
  }

  function quoteSubtotal(quote) {
    return roundMoney(quote.lines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unitPrice), 0), quoteCurrency(quote));
  }

  function taxAmount(subtotal, rate = state.settings.taxRate, currency = state.settings.currency) {
    return roundMoney(subtotal * Number(rate || 0) / 100, currency);
  }

  function quoteTotal(quote) {
    const subtotal = quoteSubtotal(quote);
    return roundMoney(subtotal + taxAmount(subtotal, quote.taxRate, quoteCurrency(quote)), quoteCurrency(quote));
  }

  function invoicePaidAmount(invoice) {
    if (Array.isArray(invoice.payments)) {
      return roundMoney(invoice.payments.reduce((sum, payment) => {
        if (payment.voidedAt || payment.status === 'rejected' || (payment.type === 'bank_transfer_pending' && payment.status !== 'confirmed')) return sum;
        const amount = Number(payment.amount || 0);
        return sum + (payment.type === 'refund' ? -amount : amount);
      }, 0), paymentCurrency(invoice));
    }
    return invoice.status === 'paid' ? Number(invoice.total) : 0;
  }

  function invoiceBalanceDue(invoice) {
    return Math.max(0, roundMoney(Number(invoice.total) - invoicePaidAmount(invoice), paymentCurrency(invoice)));
  }

  function invoiceStatus(invoice) {
    if (invoiceBalanceDue(invoice) === 0) return 'paid';
    return invoice.dueDate < localDate() ? 'overdue' : 'unpaid';
  }

  function paymentCurrency(invoice) {
    return invoice?.currency || state.settings.currency || 'EUR';
  }

  function quoteCurrency(quote) {
    return quote?.currency || state.settings.currency || 'EUR';
  }

  function currencyBreakdown(entries, getAmount) {
    const totals = new Map();
    for (const entry of entries) {
      const currency = entry.currency || state.settings.currency || 'EUR';
      totals.set(currency, roundMoney((totals.get(currency) || 0) + getAmount(entry), currency));
    }
    return [...totals.entries()].map(([currency, amount]) => money(amount, currency)).join(' · ') || money(0);
  }

  function quoteStatus(quote) {
    return quote.status === 'sent' && quote.validUntil < localDate() ? 'expired' : quote.status;
  }

  function formatDate(date) {
    if (!date) return '—';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(`${date}T12:00:00`));
  }

  function statusBadge(status) {
    const labels = { draft: 'Draft', sent: 'Sent', accepted: 'Accepted', declined: 'Declined', expired: 'Expired', unpaid: 'Unpaid', overdue: 'Overdue', paid: 'Paid' };
    return `<span class="status status-${escapeHtml(status)}">${escapeHtml(labels[status] || status)}</span>`;
  }

  function navTitle(view) {
    return ({ dashboard: 'Overview', quotes: 'Quotes', invoices: 'Invoices', customers: 'Customers', settings: 'Settings' })[view] || 'Overview';
  }

  function heading(eyebrow, title, description, action = '') {
    return `<div class="view-heading"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${description}</p></div>${action}</div>`;
  }

  function emptyState(icon, title, description, action, label) {
    return `<div class="empty-state"><div class="empty-icon">${icon}</div><h2>${title}</h2><p>${description}</p>${action ? `<button class="button button-primary" data-action="${action}">${label}</button>` : ''}</div>`;
  }

  function quoteRow(quote) {
    const customer = customerFor(quote.customerId);
    const status = quoteStatus(quote);
    const hasInvoice = state.invoices.some((invoice) => invoice.quoteId === quote.id);
    const actions = quote.archivedAt
      ? `<button class="button button-outline" data-action="restore-quote" data-id="${escapeHtml(quote.id)}">Restore</button>${hasInvoice ? '' : `<button class="button button-quiet" data-action="delete-quote" data-id="${escapeHtml(quote.id)}">Delete</button>`}`
      : status === 'draft'
      ? `<button class="button button-outline" data-action="edit-quote" data-id="${escapeHtml(quote.id)}">Edit</button><button class="button button-outline" data-action="send-quote" data-channel="email" data-id="${escapeHtml(quote.id)}">Email quote</button><button class="button button-outline" data-action="send-quote" data-channel="sms" data-id="${escapeHtml(quote.id)}">Text link</button><button class="button button-quiet" data-action="copy-quote-link" data-id="${escapeHtml(quote.id)}">Copy approval link</button>`
      : status === 'sent'
        ? `<button class="button button-outline" data-action="send-quote" data-channel="email" data-id="${escapeHtml(quote.id)}">Resend email</button><button class="button button-outline" data-action="send-quote" data-channel="sms" data-id="${escapeHtml(quote.id)}">Text link</button><button class="button button-outline" data-action="mark-accepted" data-id="${escapeHtml(quote.id)}">Mark accepted</button><button class="button button-quiet" data-action="mark-declined" data-id="${escapeHtml(quote.id)}">Decline</button>`
        : status === 'expired'
          ? `<button class="button button-outline" data-action="renew-quote" data-id="${escapeHtml(quote.id)}">Renew as draft</button>`
        : status === 'accepted'
          ? state.invoices.some((invoice) => invoice.quoteId === quote.id)
            ? `<span class="table-secondary">Invoice created</span>`
            : `<button class="button button-primary" data-action="create-invoice" data-id="${escapeHtml(quote.id)}">Create invoice</button>`
          : '';
    const archiveAction = quote.archivedAt ? '' : `<button class="button button-quiet" data-action="archive-quote" data-id="${escapeHtml(quote.id)}">Archive</button>`;
    return `<tr>
      <td><div class="table-primary">${escapeHtml(quote.number)}</div><div class="table-secondary">${formatDate(quote.date)}</div></td>
      <td>${escapeHtml(customer?.name || 'Unknown customer')}</td>
      <td>${money(quoteTotal(quote), quoteCurrency(quote))}</td>
      <td>${formatDate(quote.validUntil)}</td>
      <td>${statusBadge(status)}</td>
      <td><div class="row-actions">${actions}${archiveAction}<button class="button button-quiet" data-action="print-document" data-type="quote" data-id="${escapeHtml(quote.id)}" aria-label="Print quote ${escapeHtml(quote.number)}">Print</button></div></td>
    </tr>`;
  }

  function invoiceRow(invoice) {
    const customer = customerFor(invoice.customerId);
    const status = invoiceStatus(invoice);
    const paid = invoicePaidAmount(invoice);
    const balance = invoiceBalanceDue(invoice);
    const currency = paymentCurrency(invoice);
    const overpaid = roundMoney(Math.max(0, paid - Number(invoice.total)), currency);
    const paymentHistory = Array.isArray(invoice.payments) && invoice.payments.length
      ? `<details class="payment-history"><summary>${invoice.payments.length} payment record${invoice.payments.length === 1 ? '' : 's'}</summary>${invoice.payments.map((payment) => {
        const pending = payment.type === 'bank_transfer_pending' && payment.status === 'pending';
        const reversed = Boolean(payment.voidedAt) || payment.status === 'rejected';
        const type = payment.type || 'payment';
        const title = type === 'refund' ? (payment.voidedAt ? 'Refund record voided' : 'Refund recorded') : pending ? 'Bank transfer awaiting confirmation' : reversed ? (payment.status === 'rejected' ? 'Transfer rejected' : 'Payment voided') : 'Payment';
        const controls = pending
          ? `<button class="text-button" data-action="confirm-bank-transfer" data-id="${escapeHtml(invoice.id)}" data-payment-id="${escapeHtml(payment.id)}">Confirm received</button><button class="text-button" data-action="reject-bank-transfer" data-id="${escapeHtml(invoice.id)}" data-payment-id="${escapeHtml(payment.id)}">Reject</button>`
          : type === 'refund' && !payment.voidedAt
            ? `<button class="text-button" data-action="void-refund" data-id="${escapeHtml(invoice.id)}" data-payment-id="${escapeHtml(payment.id)}">Void refund record</button>`
          : !reversed && type !== 'refund'
            ? `${payment.method === 'cash' || payment.method === 'bank_transfer' || payment.method === 'card_terminal' || payment.method === 'other' ? `<button class="text-button" data-action="edit-payment" data-id="${escapeHtml(invoice.id)}" data-payment-id="${escapeHtml(payment.id)}">Edit</button><button class="text-button" data-action="void-payment" data-id="${escapeHtml(invoice.id)}" data-payment-id="${escapeHtml(payment.id)}">Remove</button>` : ''}<button class="text-button" data-action="record-refund" data-id="${escapeHtml(invoice.id)}" data-payment-id="${escapeHtml(payment.id)}">Record refund</button>`
            : '';
        const signedAmount = type === 'refund' ? -Number(payment.amount) : Number(payment.amount);
        const editHistory = (payment.edits || []).map((edit) => `Edited ${formatDate(edit.editedAt?.slice(0, 10))}: ${money(edit.amount, currency)} on ${formatDate(edit.date)} (${String(edit.method).replace('_', ' ')})`).join(' · ');
        return `<div class="payment-history-entry"><span>${formatDate(payment.date)} · ${escapeHtml(title)} · ${money(signedAmount, currency)}${payment.method ? ` (${escapeHtml(String(payment.method).replace('_', ' '))})` : ''}${payment.reference || payment.note ? ` · ${escapeHtml(payment.reference || payment.note)}` : ''}${editHistory ? `<small class="table-secondary">Prior record: ${escapeHtml(editHistory)}</small>` : ''}</span>${controls ? `<span class="payment-history-actions">${controls}</span>` : ''}</div>`;
      }).join('')}</details>`
      : '';
    const plan = Array.isArray(invoice.paymentPlan) && invoice.paymentPlan.length
      ? `<details class="payment-history"><summary>Installment plan · ${invoice.paymentPlan.length} due dates</summary>${invoice.paymentPlan.map((item, index) => `<div>${index === 0 && item.deposit ? 'Deposit' : `Payment ${index + 1}`} · ${formatDate(item.dueDate)} · ${money(item.amount, currency)}</div>`).join('')}</details>`
      : '';
    const actions = balance > 0
      ? `<button class="button button-outline" data-action="payment-link" data-channel="link" data-id="${escapeHtml(invoice.id)}">Pay link</button><button class="button button-outline" data-action="payment-link" data-channel="email" data-id="${escapeHtml(invoice.id)}">Email pay link</button><button class="button button-outline" data-action="payment-link" data-channel="sms" data-id="${escapeHtml(invoice.id)}">Text pay link</button><button class="button button-outline" data-action="edit-payment-plan" data-id="${escapeHtml(invoice.id)}">Installment plan</button><button class="button button-quiet" data-action="send-reminder" data-channel="email" data-id="${escapeHtml(invoice.id)}">Email reminder</button><button class="button button-quiet" data-action="send-reminder" data-channel="sms" data-id="${escapeHtml(invoice.id)}">Text reminder</button><button class="button button-quiet" data-action="mark-paid" data-id="${escapeHtml(invoice.id)}">Record payment</button>`
      : '';
    return `<tr>
      <td><div class="table-primary">${escapeHtml(invoice.number)}</div><div class="table-secondary">${formatDate(invoice.date)}</div></td>
      <td>${escapeHtml(customer?.name || 'Unknown customer')}</td>
      <td><div class="table-primary">${money(invoice.total, currency)}</div>${paid ? `<div class="table-secondary">Net paid ${money(paid, currency)}</div>` : ''}${balance ? `<div class="table-secondary">${money(balance, currency)} due</div>` : ''}${overpaid ? `<div class="table-secondary">${money(overpaid, currency)} overpaid — review</div>` : ''}${paymentHistory}${plan}</td>
      <td>${formatDate(invoice.dueDate)}</td>
      <td>${statusBadge(status)}</td>
      <td><div class="row-actions">${actions}<button class="button button-quiet" data-action="print-document" data-type="invoice" data-id="${escapeHtml(invoice.id)}" aria-label="Print invoice ${escapeHtml(invoice.number)}">Print</button></div></td>
    </tr>`;
  }

  function tablePanel(title, subtitle, headers, rows, linkView) {
    return `<section class="panel"><div class="panel-heading"><div><h2>${title}</h2><p>${subtitle}</p></div>${linkView ? `<button class="text-button" data-view="${linkView}">View all →</button>` : ''}</div>
      <div class="table-wrap"><table class="data-table"><thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }

  function renderDashboard() {
    const openQuotes = state.quotes.filter((quote) => ['draft', 'sent'].includes(quoteStatus(quote))).length;
    const unpaidInvoices = state.invoices.filter((invoice) => invoiceStatus(invoice) !== 'paid');
    const overdueInvoices = unpaidInvoices.filter((invoice) => invoiceStatus(invoice) === 'overdue');
    const recentQuotes = [...state.quotes].filter((quote) => !quote.archivedAt).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    const recentRows = recentQuotes.map(quoteRow).join('');
    const rows = recentRows || `<tr><td colspan="6" style="text-align:center;padding:27px;color:#929b95">Your recent quotes will show up here.</td></tr>`;
    const firstName = state.settings.businessName.trim() ? `, ${escapeHtml(state.settings.businessName.trim())}` : '';
    root.innerHTML = `${heading('YOUR BUSINESS, IN GOOD ORDER', `A little more in control${firstName}`, 'Keep customer records, sales, invoices, and payments moving from one flexible workspace.', `<button class="button button-primary" data-action="new-quote">＋ Create a quote</button>`)}
      <div class="stats-grid">
        <article class="stat-card"><div class="stat-top"><span>Open quotes</span><span class="stat-icon">▤</span></div><div class="stat-value">${openQuotes}</div><div class="stat-note">Drafts and quotes awaiting a reply</div></article>
        <article class="stat-card"><div class="stat-top"><span>Unpaid invoices</span><span class="stat-icon">▧</span></div><div class="stat-value">${unpaidInvoices.length}</div><div class="stat-note">${overdueInvoices.length} overdue</div></article>
        <article class="stat-card"><div class="stat-top"><span>Overdue</span><span class="stat-icon">◷</span></div><div class="stat-value">${currencyBreakdown(overdueInvoices, (invoice) => Number(invoice.total))}</div><div class="stat-note">Across ${overdueInvoices.length} invoice${overdueInvoices.length === 1 ? '' : 's'}</div></article>
        <article class="stat-card"><div class="stat-top"><span>Payments received</span><span class="stat-icon">✓</span></div><div class="stat-value">${currencyBreakdown(state.invoices, invoicePaidAmount)}</div><div class="stat-note">Full and partial payments recorded</div></article>
      </div>
      ${tablePanel('Recent quotes', 'A quick look at sales in progress.', ['Quote', 'Customer', 'Amount', 'Valid until', 'Status', ''], rows, 'quotes')}
      <div class="dashboard-lower">
        <section class="welcome-card"><span class="eyebrow">A FRESH START</span><h2>Make room for the work you do best.</h2><p>Add a customer, put together a quote, and keep the follow-up in your private cloud workspace.</p><button class="button button-primary" data-action="${state.customers.length ? 'new-quote' : 'new-customer'}">${state.customers.length ? 'Create your first quote' : 'Add your first customer'} →</button></section>
        <section class="panel quick-list"><h2>Your simple flow</h2><div class="quick-item"><span class="quick-number">1</span><span>Add a customer and their contact details.</span></div><div class="quick-item"><span class="quick-number">2</span><span>Build and email a clear, itemized quote for products or services.</span></div><div class="quick-item"><span class="quick-number">3</span><span>Mark approval, create an invoice, and track payment.</span></div></section>
      </div>`;
  }

  function renderQuotes(query = '') {
    const visibleQuotes = state.quotes.filter((quote) => Boolean(quote.archivedAt) === showArchivedQuotes);
    const filtered = [...visibleQuotes].sort((a, b) => b.date.localeCompare(a.date)).filter((quote) => {
      const customer = customerFor(quote.customerId);
      const text = `${quote.number} ${customer?.name || ''} ${quoteStatus(quote)}`.toLowerCase();
      return text.includes(query.toLowerCase());
    });
    const content = filtered.length
      ? tablePanel('All quotes', `${filtered.length} quote${filtered.length === 1 ? '' : 's'} in your workspace.`, ['Quote', 'Customer', 'Amount', 'Valid until', 'Status', ''], filtered.map(quoteRow).join(''))
      : emptyState('▤', query ? 'No matching quotes' : showArchivedQuotes ? 'No archived quotes' : 'No quotes yet', query ? 'Try another search.' : showArchivedQuotes ? 'Archived quotes will appear here.' : 'Create a quote for a customer to get a new sale moving.', query || showArchivedQuotes ? '' : 'new-quote', query || showArchivedQuotes ? '' : 'Create a quote');
    root.innerHTML = `${heading('QUOTE WORKFLOW', showArchivedQuotes ? 'Archived quotes' : 'Quotes', 'Put together clear estimates and keep approvals moving.', `${showArchivedQuotes ? '' : `<button class="button button-primary" data-action="new-quote">＋ New quote</button>`}<button class="button button-outline" data-action="toggle-archived-quotes">${showArchivedQuotes ? 'Show active quotes' : 'Show archived'}</button>`)}
      ${visibleQuotes.length ? `<div class="toolbar"><label class="search-field"><span>⌕</span><input id="list-search" type="search" value="${escapeHtml(query)}" placeholder="Search quotes" aria-label="Search quotes"></label><span class="search-count">${filtered.length} of ${visibleQuotes.length}</span></div>` : ''}
      ${content}`;
  }

  function renderInvoices(query = '') {
    const filtered = [...state.invoices].sort((a, b) => b.date.localeCompare(a.date)).filter((invoice) => {
      const customer = customerFor(invoice.customerId);
      return `${invoice.number} ${customer?.name || ''} ${invoiceStatus(invoice)}`.toLowerCase().includes(query.toLowerCase());
    });
    const content = filtered.length
      ? tablePanel('All invoices', `${filtered.length} invoice${filtered.length === 1 ? '' : 's'} in your workspace.`, ['Invoice', 'Customer', 'Amount', 'Due date', 'Status', ''], filtered.map(invoiceRow).join(''))
      : emptyState('▧', query ? 'No matching invoices' : 'No invoices yet', query ? 'Try another search.' : 'When a customer accepts a quote, turn it into an invoice in one click.', '');
    root.innerHTML = `${heading('PAYMENT FOLLOW-UP', 'Invoices', 'Know what is paid, what is due, and what needs a nudge.', state.quotes.some((quote) => quote.status === 'accepted' && !state.invoices.some((invoice) => invoice.quoteId === quote.id)) ? `<button class="button button-outline" data-view="quotes">View accepted quotes</button>` : '')}
      ${state.invoices.length ? `<div class="toolbar"><label class="search-field"><span>⌕</span><input id="list-search" type="search" value="${escapeHtml(query)}" placeholder="Search invoices" aria-label="Search invoices"></label><span class="search-count">${filtered.length} of ${state.invoices.length}</span></div>` : ''}
      ${content}`;
  }

  function renderCustomers(query = '') {
    const visibleCustomers = state.customers.filter((customer) => Boolean(customer.archivedAt) === showArchivedCustomers);
    const customers = [...visibleCustomers].sort((a, b) => a.name.localeCompare(b.name)).filter((customer) => `${customer.name} ${customer.email} ${customer.phone} ${customer.address}`.toLowerCase().includes(query.toLowerCase()));
    const customerCards = customers.map((customer) => {
      const documents = state.quotes.filter((quote) => quote.customerId === customer.id).length + state.invoices.filter((invoice) => invoice.customerId === customer.id).length;
      const actions = customer.archivedAt
        ? `<button class="button button-outline" data-action="restore-customer" data-id="${escapeHtml(customer.id)}">Restore</button>${documents ? `<span class="customer-count">${documents} linked</span>` : `<button class="button button-quiet" data-action="delete-customer" data-id="${escapeHtml(customer.id)}">Delete</button>`}`
        : `<button class="button button-outline" data-action="edit-customer" data-id="${escapeHtml(customer.id)}">Edit</button><button class="button button-quiet" data-action="archive-customer" data-id="${escapeHtml(customer.id)}">Archive</button>${documents ? `<span class="customer-count">${documents} linked</span>` : `<button class="button button-quiet" data-action="delete-customer" data-id="${escapeHtml(customer.id)}">Delete</button>`}`;
      return `<article class="customer-card"><div class="customer-identity"><div class="customer-avatar">${escapeHtml(customer.name.charAt(0).toUpperCase())}</div><div><strong>${escapeHtml(customer.name)}</strong><small>${documents} document${documents === 1 ? '' : 's'}</small></div></div><div class="customer-meta">${customer.email ? `<div>${escapeHtml(customer.email)}</div>` : ''}${customer.phone ? `<div>${escapeHtml(customer.phone)}</div>` : ''}${customer.address ? `<div>${escapeHtml(customer.address)}</div>` : ''}</div><div class="customer-actions">${actions}</div></article>`;
    }).join('');
    const body = customers.length
      ? `<section class="panel">${customerCards}</section>`
      : emptyState('♧', query ? 'No matching customers' : showArchivedCustomers ? 'No archived customers' : 'Your customer list is ready', query ? 'Try another search.' : showArchivedCustomers ? 'Archived customers will appear here.' : 'Keep contact details together, ready for your next quote.', query || showArchivedCustomers ? '' : 'new-customer', query || showArchivedCustomers ? '' : 'Add a customer');
    root.innerHTML = `${heading('PEOPLE YOU WORK WITH', showArchivedCustomers ? 'Archived customers' : 'Customers', 'Keep customer details handy for the next job.', `${showArchivedCustomers ? '' : `<button class="button button-primary" data-action="new-customer">＋ Add customer</button>`}<button class="button button-outline" data-action="toggle-archived-customers">${showArchivedCustomers ? 'Show active customers' : 'Show archived'}</button>`)}
      ${visibleCustomers.length ? `<div class="toolbar"><label class="search-field"><span>⌕</span><input id="list-search" type="search" value="${escapeHtml(query)}" placeholder="Search customers" aria-label="Search customers"></label><span class="search-count">${customers.length} of ${visibleCustomers.length}</span></div>` : ''}
      ${body}`;
  }

  function renderSettings() {
    const dbSize = new Blob([JSON.stringify(state)]).size;
    const templates = state.serviceTemplates.map((template) => `<div class="template-row"><div><strong>${escapeHtml(template.name)}</strong><small>${money(template.unitPrice, template.currency || state.settings.currency)} each</small></div><button class="button button-quiet" data-action="remove-template" data-id="${escapeHtml(template.id)}" aria-label="Remove ${escapeHtml(template.name)} item">Remove</button></div>`).join('');
    const providerText = `Email: ${appConfig?.emailEnabled ? 'connected' : 'not configured'} · SMS: ${appConfig?.smsEnabled ? 'connected' : 'not configured'} · Card (Stripe): ${appConfig?.stripeEnabled ? 'connected' : 'not configured'} · PayPal: ${appConfig?.paypalEnabled ? 'connected' : 'not configured'} · Paystack: ${appConfig?.paystackEnabled ? 'connected' : 'not configured'}. Configure keys on the server; never enter them in this workspace.`;
    root.innerHTML = `${heading('WORKSPACE PREFERENCES', 'Settings', 'Set up the details used on quotes and invoices.')}
      <section class="panel settings-card"><h2>Business details</h2><p>These details are used on quotes, invoices, emails, and checkout sessions.</p><button class="button button-primary" data-action="open-settings">Edit business settings</button>
        <div class="storage-warning"><strong>Privacy and storage:</strong> Workspace data is synced to your private account. Export a backup periodically and use a strong account password.${dbSize > 4000000 ? ' This workspace is getting large; export your data.' : ''}</div>
        <div class="storage-warning"><strong>Provider status:</strong> ${escapeHtml(providerText)}</div>
        <div class="modal-actions" style="justify-content:flex-start"><button class="button button-outline" data-action="export-data">Export workspace backup</button><button class="button button-outline" data-action="import-data">Import workspace backup</button></div>
      </section>`;
    root.insertAdjacentHTML('beforeend', `<section class="panel settings-card template-settings"><h2>Saved items</h2><p>Save frequently quoted products or services and prices to add them to quotes in one click.</p>
      <form id="template-form" class="template-form"><label>Item name<input name="name" required maxlength="120" placeholder="e.g. Monthly support plan"></label><label>Price each<input name="unitPrice" type="number" required min="0" step="${1 / (10 ** currencyDigits(state.settings.currency))}" inputmode="decimal" placeholder="0.00"></label><button class="button button-primary" type="submit">Add item</button></form>
      ${templates ? `<div class="template-list">${templates}</div>` : `<div class="template-empty">No saved items yet. Add one above to reuse it on your quotes.</div>`}
    </section>`);
  }

  function render(view = activeView, query = '') {
    activeView = view;
    document.getElementById('page-title').textContent = navTitle(view);
    document.querySelectorAll('.nav-link[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
    if (view === 'dashboard') renderDashboard();
    else if (view === 'quotes') renderQuotes(query);
    else if (view === 'invoices') renderInvoices(query);
    else if (view === 'customers') renderCustomers(query);
    else renderSettings();
  }

  function openDialog(id) {
    const dialog = document.getElementById(id);
    if (dialog && !dialog.open) dialog.showModal();
  }

  function closeDialogs() {
    document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
  }

  function openCustomerDialog() {
    editingCustomerId = null;
    document.getElementById('customer-form').reset();
    document.getElementById('customer-dialog-title').textContent = 'Add a customer';
    document.getElementById('customer-submit').textContent = 'Save customer';
    openDialog('customer-dialog');
    document.querySelector('#customer-form [name="name"]').focus();
  }

  function editCustomer(id) {
    const customer = state.customers.find((item) => item.id === id && !item.archivedAt);
    if (!customer) return showToast('Active customer could not be found.', true);
    editingCustomerId = id;
    const form = document.getElementById('customer-form');
    form.reset();
    for (const field of ['name', 'email', 'phone', 'address']) form.elements[field].value = customer[field] || '';
    form.elements.smsConsent.checked = Boolean(customer.smsConsent);
    document.getElementById('customer-dialog-title').textContent = 'Edit customer';
    document.getElementById('customer-submit').textContent = 'Save changes';
    openDialog('customer-dialog');
    form.elements.name.focus();
  }

  function addQuoteLine(description = '', quantity = 1, unitPrice = '') {
    const container = document.getElementById('quote-lines');
    const line = document.createElement('div');
    line.className = 'quote-line';
    const currency = editingQuoteId ? quoteCurrency(state.quotes.find((item) => item.id === editingQuoteId)) : state.settings.currency;
    const step = 1 / (10 ** currencyDigits(currency));
    line.innerHTML = `<label>Item or service<input name="description" required maxlength="120" placeholder="Product or service description" value="${escapeHtml(description)}"></label>
      <label>Qty<input name="quantity" type="number" required min="0.01" step="0.01" value="${escapeHtml(quantity)}"></label>
      <label>Price each<input name="unitPrice" type="number" required min="0" step="${step}" inputmode="decimal" placeholder="0.00" value="${escapeHtml(unitPrice)}"></label>
      <button class="remove-line" type="button" data-action="remove-line" aria-label="Remove item">×</button>`;
    container.append(line);
    line.addEventListener('input', updateQuotePreview);
  }

  function updateQuotePreview() {
    const lines = [...document.querySelectorAll('#quote-lines .quote-line')];
    const subtotal = lines.reduce((sum, line) => sum + (Number(line.querySelector('[name="quantity"]').value) || 0) * (Number(line.querySelector('[name="unitPrice"]').value) || 0), 0);
    const quote = editingQuoteId && state.quotes.find((item) => item.id === editingQuoteId);
    const currency = quote ? quoteCurrency(quote) : state.settings.currency;
    document.getElementById('quote-total-preview').textContent = money(roundMoney(subtotal + taxAmount(subtotal, state.settings.taxRate, currency), currency), currency);
  }

  function openQuoteDialog(quoteId = null) {
    const activeCustomers = state.customers.filter((customer) => !customer.archivedAt);
    if (!activeCustomers.length) {
      showToast('Add or restore a customer before creating a quote.');
      openCustomerDialog();
      return;
    }
    const existingQuote = quoteId ? state.quotes.find((quote) => quote.id === quoteId && quote.status === 'draft') : null;
    if (quoteId && !existingQuote) return showToast('Only draft quotes can be edited.', true);
    editingQuoteId = existingQuote?.id || null;
    const form = document.getElementById('quote-form');
    form.reset();
    const today = localDate();
    form.elements.date.value = existingQuote?.date || today;
    form.elements.validUntil.value = existingQuote?.validUntil || addDays(today, 30);
    document.getElementById('quote-customer-select').innerHTML = `<option value="">Choose a customer</option>${activeCustomers.map((customer) => `<option value="${escapeHtml(customer.id)}">${escapeHtml(customer.name)}</option>`).join('')}`;
    document.getElementById('quote-template-select').innerHTML = `<option value="">Choose a saved item</option>${state.serviceTemplates.map((template) => `<option value="${escapeHtml(template.id)}">${escapeHtml(template.name)} — ${money(template.unitPrice, template.currency || state.settings.currency)}</option>`).join('')}`;
    if (existingQuote) {
      form.elements.customerId.value = existingQuote.customerId;
      form.elements.notes.value = existingQuote.notes || '';
      document.querySelector('#quote-dialog .modal-heading h2').textContent = `Edit ${existingQuote.number}`;
      form.querySelector('button[type="submit"]').textContent = 'Save changes';
    } else {
      document.querySelector('#quote-dialog .modal-heading h2').textContent = 'Create a quote';
      form.querySelector('button[type="submit"]').textContent = 'Save quote';
    }
    document.getElementById('quote-lines').replaceChildren();
    if (existingQuote) existingQuote.lines.forEach((line) => addQuoteLine(line.description, line.quantity, line.unitPrice));
    else addQuoteLine();
    updateQuotePreview();
    openDialog('quote-dialog');
    form.elements.customerId.focus();
  }

  function nextNumber(kind) {
    const prefix = kind === 'quote' ? 'Q' : 'I';
    const number = `${prefix}-${String(state.counters[kind]).padStart(4, '0')}`;
    state.counters[kind] += 1;
    return number;
  }

  function performAction(action, id, type, element, channel) {
    if (action === 'sign-out') return signOut();
    if (action === 'new-customer') return openCustomerDialog();
    if (action === 'edit-customer') return editCustomer(id);
    if (action === 'archive-customer') return confirmArchiveCustomer(id);
    if (action === 'restore-customer') return setCustomerArchived(id, false);
    if (action === 'delete-customer') return confirmDeleteCustomer(id);
    if (action === 'toggle-archived-customers') {
      showArchivedCustomers = !showArchivedCustomers;
      return render('customers');
    }
    if (action === 'new-quote') return openQuoteDialog();
    if (action === 'edit-quote') return openQuoteDialog(id);
    if (action === 'renew-quote') return confirmRenewQuote(id);
    if (action === 'archive-quote') return confirmArchiveQuote(id);
    if (action === 'restore-quote') return setQuoteArchived(id, false);
    if (action === 'delete-quote') return confirmDeleteQuote(id);
    if (action === 'toggle-archived-quotes') {
      showArchivedQuotes = !showArchivedQuotes;
      return render('quotes');
    }
    if (action === 'use-template') {
      const template = state.serviceTemplates.find((item) => item.id === document.getElementById('quote-template-select')?.value);
      if (!template) return showToast('Choose a saved item first.', true);
      const quote = editingQuoteId && state.quotes.find((item) => item.id === editingQuoteId);
      if ((template.currency || state.settings.currency) !== (quote ? quoteCurrency(quote) : state.settings.currency)) return showToast(`This saved item is priced in ${template.currency || state.settings.currency}. Enter its price manually to avoid using the wrong currency.`, true);
      addQuoteLine(template.name, 1, template.unitPrice);
      return updateQuotePreview();
    }
    if (action === 'remove-template') {
      const index = state.serviceTemplates.findIndex((item) => item.id === id);
      if (index < 0) return showToast('Saved item could not be found.', true);
      state.serviceTemplates.splice(index, 1);
      if (!saveState()) return;
      render('settings');
      return showToast('Saved item removed. Existing quotes are unchanged.');
    }
    if (action === 'open-settings') {
      const form = document.getElementById('settings-form');
      form.elements.businessName.value = state.settings.businessName;
      form.elements.businessCountry.innerHTML = Object.keys(countryCurrencies).sort((a, b) => countryNames[a].localeCompare(countryNames[b])).map((code) => `<option value="${code}">${escapeHtml(countryNames[code])} (${countryCurrencies[code]})</option>`).join('');
      form.elements.currency.value = state.settings.currency;
      const country = state.settings.businessCountry || defaultCountryForCurrency(state.settings.currency);
      form.elements.businessCountry.value = country;
      form.elements.currency.value = countryCurrencies[country] || state.settings.currency;
      form.elements.businessCountry.disabled = false;
      form.elements.currency.disabled = true;
      document.getElementById('currency-note').hidden = false;
      form.elements.taxRate.value = state.settings.taxRate;
      form.elements.bankTransferInstructions.value = state.settings.bankTransferInstructions || '';
      const reminders = state.settings.reminders || { enabled: false, email: true, sms: false, daysAfterDue: [1, 3, 7] };
      form.elements.remindersEnabled.checked = Boolean(reminders.enabled);
      form.elements.remindersEmail.checked = reminders.email !== false;
      form.elements.remindersSms.checked = Boolean(reminders.sms);
      document.querySelectorAll('#settings-form [name=reminderDay]').forEach((input) => { input.checked = (reminders.daysAfterDue || [1, 3, 7]).includes(Number(input.value)); });
      document.getElementById('provider-status').textContent = `Email: ${appConfig?.emailEnabled ? 'connected' : 'not configured'} · SMS: ${appConfig?.smsEnabled ? 'connected' : 'not configured'} · Card (Stripe): ${appConfig?.stripeEnabled ? 'connected' : 'not configured'} · PayPal: ${appConfig?.paypalEnabled ? 'connected' : 'not configured'} · Paystack: ${appConfig?.paystackEnabled ? 'connected' : 'not configured'}. Configure keys on the server; never enter them in this workspace.`;
      return openDialog('settings-dialog');
    }
    if (action === 'close-dialog') return closeDialogs();
    if (action === 'add-line') {
      addQuoteLine();
      return updateQuotePreview();
    }
    if (action === 'remove-line') {
      if (document.querySelectorAll('#quote-lines .quote-line').length === 1) return showToast('A quote needs at least one item.');
      element?.closest('.quote-line')?.remove();
      return updateQuotePreview();
    }
    if (action === 'export-data') return exportData();
    if (action === 'import-data') return document.getElementById('import-file').click();
    if (action === 'print-document') return printDocument(id, type);
    if (action === 'send-quote') return shareQuote(id, channel || 'email');
    if (action === 'copy-quote-link') return shareQuote(id, 'link');
    if (action === 'payment-link') return openPaymentDialog(id, channel || 'link');
    if (action === 'mark-accepted') return confirmQuoteStatus(id, 'accepted');
    if (action === 'mark-declined') return confirmQuoteStatus(id, 'declined');
    if (action === 'create-invoice') return confirmCreateInvoice(id);
    if (action === 'mark-paid') return openPaymentDialog(id, 'offline');
    if (action === 'edit-payment') return openPaymentEdit(id, element.dataset.paymentId);
    if (action === 'void-payment') return voidPayment(id, element.dataset.paymentId);
    if (action === 'record-refund') return openRefundDialog(id, element.dataset.paymentId);
    if (action === 'void-refund') return voidRefundRecord(id, element.dataset.paymentId);
    if (action === 'confirm-bank-transfer') return setBankTransferStatus(id, element.dataset.paymentId, 'confirmed');
    if (action === 'reject-bank-transfer') return setBankTransferStatus(id, element.dataset.paymentId, 'rejected');
    if (action === 'edit-payment-plan') return openPaymentPlan(id);
    if (action === 'send-reminder') return sendReminder(id, channel || 'email');
  }

  async function shareQuote(id, channel) {
    const quote = state.quotes.find((item) => item.id === id);
    const customer = quote && customerFor(quote.customerId);
    if (!quote || !customer) return showToast('Quote or customer could not be found.', true);
    try {
      await cloudSaveQueue;
      if (cloudBlocked) throw new Error('Cloud sync is paused. Sign in again or reload before sending.');
      const result = await apiRequest(`/api/quotes/${encodeURIComponent(id)}/share`, { method: 'POST', body: { channel } });
      if (channel === 'link') {
        if (result.revision) await refreshWorkspace();
        await navigator.clipboard.writeText(result.url);
        showToast('Approval link copied. The quote is now awaiting the customer’s response.');
      } else {
        if (result.revision) await refreshWorkspace();
        showToast(`Quote sent by ${channel === 'sms' ? 'text message' : 'email'}.`);
      }
    } catch (error) {
      showToast(error.message, true);
    }
  }

  function openPaymentDialog(id, channel) {
    const invoice = state.invoices.find((item) => item.id === id);
    if (!invoice) return showToast('Invoice could not be found.', true);
    const balance = invoiceBalanceDue(invoice);
    if (!balance) return showToast('This invoice has no remaining balance.', true);
    paymentDialogInvoiceId = id;
    paymentDialogChannel = channel;
    const form = document.getElementById('payment-form');
    form.reset();
    form.elements.amountMode.value = 'remaining';
    form.elements.amount.required = false;
    const currency = paymentCurrency(invoice);
    form.elements.amount.step = String(1 / (10 ** currencyDigits(currency)));
    form.elements.amount.min = form.elements.amount.step;
    form.elements.amount.value = amountInputValue(balance, currency);
    form.elements.amount.max = amountInputValue(balance, currency);
    const isOffline = channel === 'offline';
    document.getElementById('payment-provider-field').hidden = isOffline;
    document.getElementById('payment-offline-method-field').hidden = !isOffline;
    document.getElementById('payment-reference-field').hidden = !isOffline;
    const providerOptions = {
      stripe: Boolean(appConfig?.stripeEnabled),
      paypal: Boolean(appConfig?.paypalEnabled),
      paystack: Boolean(appConfig?.paystackEnabled && paymentCurrency(invoice) === 'NGN'),
      bank_transfer: Boolean(state.settings.bankTransferInstructions?.trim())
    };
    [...form.elements.provider.options].forEach((option) => {
      option.disabled = !providerOptions[option.value];
      if (option.value === 'paystack' && !providerOptions.paystack && appConfig?.paystackEnabled) option.textContent = 'Paystack (requires NGN currency)';
      else if (option.value === 'paystack') option.textContent = 'Paystack';
      if (option.value === 'bank_transfer' && !providerOptions.bank_transfer) option.textContent = 'Bank transfer (add instructions in settings)';
      else if (option.value === 'bank_transfer') option.textContent = 'Bank transfer instructions';
    });
    const initialProvider = ['stripe', 'paypal', 'paystack', 'bank_transfer'].find((provider) => providerOptions[provider]);
    if (initialProvider) form.elements.provider.value = initialProvider;
    document.getElementById('payment-title').textContent = channel === 'offline' ? 'Record a payment' : 'Create a payment link';
    document.getElementById('payment-invoice-summary').textContent = `${invoice.number} · ${money(balance, currency)} remaining`;
    document.getElementById('payment-amount-field').hidden = true;
    document.getElementById('payment-form-submit').disabled = !isOffline && !initialProvider;
    document.getElementById('payment-form-submit').textContent = channel === 'offline'
      ? 'Record payment'
      : channel === 'link' ? 'Copy payment link' : `Send by ${channel}`;
    openDialog('payment-dialog');
    if (channel === 'offline') form.elements.amountMode.focus();
  }

  async function createPaymentLink(id, channel, amount, provider) {
    try {
      await cloudSaveQueue;
      if (cloudBlocked) throw new Error('Cloud sync is paused. Sign in again or reload before creating a payment link.');
      const result = await apiRequest(`/api/invoices/${encodeURIComponent(id)}/payment-link`, { method: 'POST', body: { channel, amount, provider } });
      if (provider === 'bank_transfer') {
        await refreshWorkspace();
        if (channel === 'link') await navigator.clipboard.writeText(result.instructions);
        showToast(channel === 'link' ? 'Bank transfer instructions copied.' : `Bank transfer instructions sent by ${channel}.`);
        return true;
      }
      await refreshWorkspace();
      if (channel === 'link') await navigator.clipboard.writeText(result.url);
      const invoice = state.invoices.find((item) => item.id === id);
      showToast(channel === 'link' ? `${providerLabel(provider)} link for ${money(amount, paymentCurrency(invoice))} copied.` : `${providerLabel(provider)} payment link for ${money(amount, paymentCurrency(invoice))} sent by ${channel}.`);
      return true;
    } catch (error) {
      if (provider === 'bank_transfer') {
        try {
          await refreshWorkspace();
        } catch (refreshError) {
          console.warn('Unable to refresh transfer history after a delivery error.', refreshError);
        }
      }
      showToast(error.message, true);
      return false;
    }
  }

  function providerLabel(provider) {
    return ({ stripe: 'Card payment', paypal: 'PayPal', paystack: 'Paystack' })[provider] || 'Payment';
  }

  function recordOfflinePayment(id, amount, method, reference) {
    const invoice = state.invoices.find((item) => item.id === id);
    if (!invoice) return showToast('Invoice could not be found.', true);
    const balance = invoiceBalanceDue(invoice);
    const currency = paymentCurrency(invoice);
    const enteredAmount = Number(amount);
    const roundedAmount = roundMoney(enteredAmount, currency);
    if (!Number.isFinite(enteredAmount) || Math.abs(enteredAmount - roundedAmount) > 0.0000001 || roundedAmount < 1 / (10 ** currencyDigits(currency)) || roundedAmount > balance) return showToast(`Enter a payment amount between ${money(1 / (10 ** currencyDigits(currency)), currency)} and the remaining balance.`, true);
    const previousState = JSON.stringify(state);
    invoice.payments = Array.isArray(invoice.payments) ? invoice.payments : [];
    invoice.payments.push({ id: makeId(), amount: roundedAmount, date: localDate(), method, ...(reference ? { note: reference } : {}) });
    invoice.status = invoiceBalanceDue(invoice) === 0 ? 'paid' : 'unpaid';
    invoice.paidAt = invoice.status === 'paid' ? localDate() : null;
    if (!saveState()) {
      state = JSON.parse(previousState);
      render();
      return;
    }
    paymentDialogInvoiceId = null;
    paymentDialogChannel = null;
    closeDialogs();
    render();
    showToast(invoice.status === 'paid' ? 'Final payment recorded; invoice is paid.' : `Partial payment recorded. ${money(invoiceBalanceDue(invoice), paymentCurrency(invoice))} remains due.`);
  }

  function paymentFor(invoice, paymentId) {
    return invoice?.payments?.find((payment) => payment.id === paymentId);
  }

  function openPaymentEdit(invoiceId, paymentId) {
    const invoice = state.invoices.find((item) => item.id === invoiceId);
    const payment = paymentFor(invoice, paymentId);
    if (!payment || !['cash', 'bank_transfer', 'card_terminal', 'other'].includes(payment.method) || payment.type === 'refund' || payment.type === 'bank_transfer_pending' || payment.voidedAt || payment.status === 'rejected') {
      return showToast('Only manually recorded payments can be edited.', true);
    }
    adjustingPaymentId = paymentId;
    document.getElementById('payment-adjust-title').textContent = 'Edit recorded payment';
    const form = document.getElementById('payment-adjust-form');
    const refunded = roundMoney((invoice.payments || []).filter((item) => item.type === 'refund' && item.refundOf === paymentId && !item.voidedAt).reduce((sum, item) => sum + Number(item.amount), 0), paymentCurrency(invoice));
    form.elements.amount.value = payment.amount;
    form.elements.amount.step = String(1 / (10 ** currencyDigits(paymentCurrency(invoice))));
    form.elements.amount.min = amountInputValue(Math.max(refunded, 1 / (10 ** currencyDigits(paymentCurrency(invoice)))), paymentCurrency(invoice));
    form.elements.amount.max = amountInputValue(invoiceBalanceDue(invoice) + Number(payment.amount), paymentCurrency(invoice));
    form.elements.date.value = payment.date || localDate();
    form.elements.method.value = payment.method;
    form.elements.method.disabled = false;
    form.elements.note.value = payment.note || '';
    document.getElementById('payment-adjust-kind').value = 'edit';
    document.getElementById('payment-adjust-warning').hidden = true;
    openDialog('payment-adjust-dialog');
  }

  function voidPayment(invoiceId, paymentId) {
    const invoice = state.invoices.find((item) => item.id === invoiceId);
    const payment = paymentFor(invoice, paymentId);
    if (!payment || !['cash', 'bank_transfer', 'card_terminal', 'other'].includes(payment.method) || payment.type === 'refund' || payment.type === 'bank_transfer_pending' || payment.voidedAt || payment.status === 'rejected') {
      return showToast('Only active manually recorded payments can be removed.', true);
    }
    if ((invoice.payments || []).some((item) => item.type === 'refund' && item.refundOf === paymentId && !item.voidedAt)) return showToast('Void the related refund record before removing this payment.', true);
    showConfirmation('Remove this payment record?', `Void the ${money(payment.amount, paymentCurrency(invoice))} ${String(payment.method).replace('_', ' ')} entry from ${formatDate(payment.date)}? The audit entry will remain. This does not refund money.`, 'Void payment record', () => {
      payment.voidedAt = new Date().toISOString();
      payment.voidReason = 'Voided by business owner';
      invoice.status = invoiceBalanceDue(invoice) === 0 ? 'paid' : 'unpaid';
      invoice.paidAt = invoice.status === 'paid' ? localDate() : null;
      if (!saveState()) return;
      render('invoices');
      showToast('Payment record voided. No money was refunded.');
    });
  }

  function voidRefundRecord(invoiceId, paymentId) {
    const invoice = state.invoices.find((item) => item.id === invoiceId);
    const payment = paymentFor(invoice, paymentId);
    if (!payment || payment.type !== 'refund' || payment.voidedAt) return showToast('Refund record could not be found or was already voided.', true);
    showConfirmation('Void this refund record?', `Remove the recorded ${money(payment.amount, paymentCurrency(invoice))} refund from invoice calculations? This corrects Neatwork history only; it does not reverse the actual refund.`, 'Void refund record', () => {
      payment.voidedAt = new Date().toISOString();
      payment.voidReason = 'Refund record voided by business owner';
      invoice.status = invoiceBalanceDue(invoice) === 0 ? 'paid' : 'unpaid';
      invoice.paidAt = invoice.status === 'paid' ? localDate() : null;
      if (!saveState()) return;
      render('invoices');
      showToast('Refund record voided. The actual money movement is unchanged.');
    });
  }

  function openRefundDialog(invoiceId, paymentId) {
    const invoice = state.invoices.find((item) => item.id === invoiceId);
    const payment = paymentFor(invoice, paymentId);
    if (!payment || payment.type === 'refund' || payment.voidedAt || payment.status === 'rejected' || (payment.type === 'bank_transfer_pending' && payment.status !== 'confirmed')) {
      return showToast('Only confirmed payments can have a refund recorded.', true);
    }
    const refunded = (invoice.payments || []).filter((item) => item.type === 'refund' && item.refundOf === paymentId && !item.voidedAt).reduce((sum, item) => sum + Number(item.amount), 0);
    const refundable = roundMoney(Number(payment.amount) - refunded, paymentCurrency(invoice));
    if (refundable <= 0) return showToast('This payment has already been fully refunded.', true);
    refundPaymentContext = { invoiceId, paymentId, maxAmount: refundable };
    const form = document.getElementById('payment-adjust-form');
    form.reset();
    form.elements.method.disabled = false;
    document.getElementById('payment-adjust-kind').value = 'refund';
    document.getElementById('payment-adjust-title').textContent = 'Record an external refund';
    form.elements.amount.step = String(1 / (10 ** currencyDigits(paymentCurrency(invoice))));
    form.elements.amount.min = form.elements.amount.step;
    form.elements.amount.value = amountInputValue(refundable, paymentCurrency(invoice));
    form.elements.amount.max = amountInputValue(refundable, paymentCurrency(invoice));
    form.elements.date.value = localDate();
    form.elements.method.disabled = false;
    form.elements.method.value = payment.method || 'other';
    form.elements.method.disabled = true;
    form.elements.note.value = '';
    document.getElementById('payment-adjust-warning').hidden = false;
    document.getElementById('payment-adjust-warning').textContent = 'This only updates Neatwork records; issue the refund in your payment provider or bank first.';
    openDialog('payment-adjust-dialog');
  }

  function setBankTransferStatus(invoiceId, paymentId, status) {
    const invoice = state.invoices.find((item) => item.id === invoiceId);
    const payment = paymentFor(invoice, paymentId);
    if (!payment || payment.type !== 'bank_transfer_pending' || payment.status !== 'pending') {
      return showToast('This transfer is no longer awaiting confirmation.', true);
    }
    if (status === 'rejected') {
      showConfirmation('Reject this transfer?', 'The transfer will not count toward the invoice balance. The pending record will remain in the audit history.', 'Reject transfer', () => {
        payment.status = 'rejected';
        payment.reviewedAt = new Date().toISOString();
        if (!saveState()) return;
        render('invoices');
        showToast('Transfer rejected; it was not counted as paid.');
      });
      return;
    }
    showConfirmation('Confirm bank transfer received?', `Confirm that ${money(payment.amount, paymentCurrency(invoice))} reached your bank account? Only confirm after checking your bank.`, 'Confirm receipt', () => {
      payment.status = 'confirmed';
      payment.confirmedAt = new Date().toISOString();
      invoice.status = invoiceBalanceDue(invoice) === 0 ? 'paid' : 'unpaid';
      invoice.paidAt = invoice.status === 'paid' ? localDate() : null;
      if (!saveState()) return;
      render('invoices');
      showToast(invoice.status === 'paid' ? 'Transfer confirmed; invoice is paid.' : `Transfer confirmed. ${money(invoiceBalanceDue(invoice), paymentCurrency(invoice))} remains due.`);
    });
  }

  function openPaymentPlan(invoiceId) {
    const invoice = state.invoices.find((item) => item.id === invoiceId);
    if (!invoice) return showToast('Invoice could not be found.', true);
    const balance = invoiceBalanceDue(invoice);
    if (!balance) return showToast('This invoice has no remaining balance.', true);
    plannedInvoiceId = invoiceId;
    const form = document.getElementById('payment-plan-form');
    form.reset();
    const savedPlan = invoice.paymentPlan || [];
    const savedDeposit = savedPlan.find((item) => item.deposit)?.amount || 0;
    const savedInstallments = savedPlan.filter((item) => !item.deposit);
    form.elements.deposit.value = amountInputValue(savedDeposit, paymentCurrency(invoice));
    form.elements.deposit.step = String(1 / (10 ** currencyDigits(paymentCurrency(invoice))));
    form.elements.deposit.max = amountInputValue(balance, paymentCurrency(invoice));
    form.elements.installments.value = String(savedInstallments.length || 3);
    form.elements.firstDueDate.value = savedInstallments[0]?.dueDate || (invoice.dueDate > localDate() ? invoice.dueDate : addDays(localDate(), 7));
    const priorInterval = savedInstallments.length > 1
      ? Math.round((Date.parse(`${savedInstallments[1].dueDate}T00:00:00Z`) - Date.parse(`${savedInstallments[0].dueDate}T00:00:00Z`)) / 86400000)
      : 14;
    form.elements.intervalDays.value = String(priorInterval);
    document.getElementById('payment-plan-summary').textContent = `${invoice.number} · ${money(balance, paymentCurrency(invoice))} remaining. Plans schedule reminders only; they do not charge customers automatically.`;
    openDialog('payment-plan-dialog');
  }

  document.getElementById('payment-adjust-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const kind = document.getElementById('payment-adjust-kind').value;
    const editInvoice = state.invoices.find((item) => item.payments?.some((payment) => payment.id === adjustingPaymentId));
    const refundInvoice = refundPaymentContext && state.invoices.find((item) => item.id === refundPaymentContext.invoiceId);
    const currency = paymentCurrency(editInvoice || refundInvoice || { currency: state.settings.currency });
    const enteredAmount = Number(form.elements.amount.value);
    const amount = roundMoney(enteredAmount, currency);
    const date = form.elements.date.value;
    const note = form.elements.note.value.trim();
    if (!Number.isFinite(enteredAmount) || Math.abs(enteredAmount - amount) > 0.0000001 || amount <= 0 || !safeFormDate(date) || date > localDate()) {
      return showToast('Enter a valid payment amount and date.', true);
    }
    if (kind === 'refund') {
      const { invoiceId, paymentId, maxAmount } = refundPaymentContext || {};
      const invoice = state.invoices.find((item) => item.id === invoiceId);
      const payment = paymentFor(invoice, paymentId);
      if (!invoice || !payment || payment.voidedAt || payment.status === 'rejected' || (payment.type === 'bank_transfer_pending' && payment.status !== 'confirmed') || amount > maxAmount || amount > roundMoney(Number(payment.amount) - (invoice.payments || []).filter((item) => item.type === 'refund' && item.refundOf === paymentId && !item.voidedAt).reduce((sum, item) => sum + Number(item.amount), 0), paymentCurrency(invoice))) return showToast('Refund amount exceeds the remaining refundable amount or the source payment is no longer refundable.', true);
      invoice.payments.push({ id: makeId(), type: 'refund', amount, date, method: payment.method, refundOf: paymentId, note, status: 'recorded' });
      invoice.status = invoiceBalanceDue(invoice) === 0 ? 'paid' : 'unpaid';
      invoice.paidAt = invoice.status === 'paid' ? localDate() : null;
    } else {
      const invoice = state.invoices.find((item) => item.payments?.some((payment) => payment.id === adjustingPaymentId));
      const payment = paymentFor(invoice, adjustingPaymentId);
      if (!invoice || !payment) return showToast('Payment record could not be found.', true);
      const availableBalance = invoiceBalanceDue(invoice) + Number(payment.amount);
      if (amount > availableBalance) return showToast(`Amount cannot exceed ${money(availableBalance, paymentCurrency(invoice))}.`, true);
      const refunded = roundMoney((invoice.payments || []).filter((item) => item.type === 'refund' && item.refundOf === adjustingPaymentId && !item.voidedAt).reduce((sum, item) => sum + Number(item.amount), 0), paymentCurrency(invoice));
      if (amount < refunded) return showToast(`This payment has ${money(refunded, paymentCurrency(invoice))} in active refunds and cannot be reduced below that amount.`, true);
      payment.edits = Array.isArray(payment.edits) ? payment.edits : [];
      payment.edits.push({
        amount: Number(payment.amount),
        date: payment.date,
        method: payment.method,
        note: payment.note || '',
        editedAt: new Date().toISOString()
      });
      payment.amount = amount;
      payment.date = date;
      payment.method = form.elements.method.value;
      payment.note = note;
      invoice.status = invoiceBalanceDue(invoice) === 0 ? 'paid' : 'unpaid';
      invoice.paidAt = invoice.status === 'paid' ? localDate() : null;
    }
    if (!saveState()) return;
    refundPaymentContext = null;
    adjustingPaymentId = null;
    form.elements.method.disabled = false;
    document.getElementById('payment-adjust-warning').hidden = true;
    closeDialogs();
    render('invoices');
    showToast(kind === 'refund' ? 'Refund recorded. Check your provider separately to confirm the money was returned.' : 'Payment record updated.');
  });

  document.getElementById('payment-plan-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const invoice = state.invoices.find((item) => item.id === plannedInvoiceId);
    if (!invoice) return showToast('Invoice could not be found.', true);
    const form = event.currentTarget;
    const balance = invoiceBalanceDue(invoice);
    const currency = paymentCurrency(invoice);
    const enteredDeposit = Number(form.elements.deposit.value || 0);
    const deposit = roundMoney(enteredDeposit, currency);
    const count = Number(form.elements.installments.value);
    const intervalDays = Number(form.elements.intervalDays.value);
    const firstDueDate = form.elements.firstDueDate.value;
    if (!Number.isFinite(enteredDeposit) || Math.abs(enteredDeposit - deposit) > 0.0000001 || deposit < 0 || deposit >= balance || !Number.isInteger(count) || count < 1 || count > 24 || !Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 90 || !safeFormDate(firstDueDate) || firstDueDate < localDate()) {
      return showToast('Check the deposit, installment count, interval, and first due date.', true);
    }
    const scale = 10 ** currencyDigits(currency);
    const remaining = roundMoney(balance - deposit, currency);
    const installmentAmount = Math.floor((remaining / count) * scale) / scale;
    const installments = Array.from({ length: count }, (_, index) => ({
      amount: index === count - 1 ? roundMoney(remaining - installmentAmount * (count - 1), currency) : installmentAmount,
      dueDate: addDays(firstDueDate, intervalDays * index),
      deposit: false
    }));
    invoice.paymentPlan = [
      ...(deposit ? [{ amount: deposit, dueDate: localDate(), deposit: true }] : []),
      ...installments
    ];
    invoice.paymentPlanCreatedAt = new Date().toISOString();
    if (!saveState()) return;
    plannedInvoiceId = null;
    closeDialogs();
    render('invoices');
    showToast('Installment schedule saved. No automatic charges will be made.');
  });

  function safeFormDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  document.getElementById('payment-form').elements.amountMode.addEventListener('change', (event) => {
    const invoice = state.invoices.find((item) => item.id === paymentDialogInvoiceId);
    if (!invoice) return;
    const amountField = document.getElementById('payment-amount-field');
    const input = document.getElementById('payment-amount');
    const currency = paymentCurrency(invoice);
    amountField.hidden = event.currentTarget.value !== 'partial';
    input.required = event.currentTarget.value === 'partial';
    input.step = String(1 / (10 ** currencyDigits(currency)));
    input.min = input.step;
    input.max = amountInputValue(invoiceBalanceDue(invoice), currency);
    if (event.currentTarget.value === 'partial' && Number(input.value) >= invoiceBalanceDue(invoice)) {
      input.value = amountInputValue(Math.max(1 / (10 ** currencyDigits(currency)), roundMoney(invoiceBalanceDue(invoice) / 2, currency)), currency);
    } else if (event.currentTarget.value === 'remaining') {
      input.value = amountInputValue(invoiceBalanceDue(invoice), currency);
    }
  });

  document.getElementById('payment-form').elements.provider.addEventListener('change', (event) => {
    const option = event.currentTarget.selectedOptions[0];
    document.getElementById('payment-form-submit').disabled = Boolean(option?.disabled);
  });

  document.getElementById('payment-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const invoice = state.invoices.find((item) => item.id === paymentDialogInvoiceId);
    if (!invoice) return showToast('Invoice could not be found.', true);
    const balance = invoiceBalanceDue(invoice);
    const form = event.currentTarget;
    const amount = form.elements.amountMode.value === 'remaining' ? balance : Number(form.elements.amount.value);
    const currency = paymentCurrency(invoice);
    if (!Number.isFinite(amount) || amount < 1 / (10 ** currencyDigits(currency)) || amount > balance) return showToast(`Enter an amount from ${money(1 / (10 ** currencyDigits(currency)), currency)} up to ${money(balance, currency)}.`, true);
    if (paymentDialogChannel === 'offline') {
      recordOfflinePayment(invoice.id, amount, form.elements.offlineMethod.value, form.elements.offlineReference.value.trim());
      return;
    }
    const submit = document.getElementById('payment-form-submit');
    submit.disabled = true;
    const provider = form.elements.provider.value;
    const succeeded = await createPaymentLink(invoice.id, paymentDialogChannel, roundMoney(amount, currency), provider);
    if (succeeded) {
      paymentDialogInvoiceId = null;
      paymentDialogChannel = null;
      closeDialogs();
    } else submit.disabled = false;
  });

  function showConfirmation(title, message, buttonLabel, onConfirm) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    document.getElementById('confirm-submit').textContent = buttonLabel;
    confirmationHandler = onConfirm;
    openDialog('confirm-dialog');
  }

  function confirmQuoteStatus(id, status) {
    const quote = state.quotes.find((item) => item.id === id);
    if (!quote) return showToast('Quote could not be found.', true);
    if ((status === 'sent' && quote.status !== 'draft') || (status !== 'sent' && quoteStatus(quote) !== 'sent')) {
      return showToast(status === 'sent' ? 'Only draft quotes can be marked sent.' : 'Only sent, unexpired quotes can be accepted or declined.', true);
    }
    const label = status;
    showConfirmation(`Mark quote ${label}?`, `Record ${quote.number} as ${label}. This is a manual record; the customer is not notified automatically.`, `Mark ${label}`, () => {
      quote.status = status;
      if (!saveState()) return;
      render();
      showToast(`Quote marked ${label}.`);
    });
  }

  function confirmArchiveCustomer(id) {
    const customer = customerFor(id);
    if (!customer || customer.archivedAt) return showToast('Active customer could not be found.', true);
    showConfirmation('Archive this customer?', `Archive ${customer.name}? Their quotes and invoices stay in your records, but the customer will no longer appear in new quote lists.`, 'Archive customer', () => setCustomerArchived(id, true));
  }

  function setCustomerArchived(id, archived) {
    const customer = customerFor(id);
    if (!customer) return showToast('Customer could not be found.', true);
    if (archived) customer.archivedAt = new Date().toISOString();
    else delete customer.archivedAt;
    if (!saveState()) return;
    render('customers');
    showToast(archived ? 'Customer archived.' : 'Customer restored.');
  }

  function confirmDeleteCustomer(id) {
    const customer = customerFor(id);
    if (!customer) return showToast('Customer could not be found.', true);
    const hasDocuments = state.quotes.some((quote) => quote.customerId === id) || state.invoices.some((invoice) => invoice.customerId === id);
    if (hasDocuments) return showToast('This customer has quotes or invoices. Archive them instead to preserve business records.', true);
    showConfirmation('Delete this customer permanently?', `Permanently remove ${customer.name}? This cannot be undone.`, 'Delete customer', () => {
      state.customers = state.customers.filter((item) => item.id !== id);
      if (!saveState()) return;
      render('customers');
      showToast('Customer deleted.');
    });
  }

  function confirmArchiveQuote(id) {
    const quote = state.quotes.find((item) => item.id === id);
    if (!quote || quote.archivedAt) return showToast('Active quote could not be found.', true);
    showConfirmation('Archive this quote?', `Archive ${quote.number}? The quote and any related invoice remain in your records.`, 'Archive quote', () => setQuoteArchived(id, true));
  }

  function setQuoteArchived(id, archived) {
    const quote = state.quotes.find((item) => item.id === id);
    if (!quote) return showToast('Quote could not be found.', true);
    if (archived) quote.archivedAt = new Date().toISOString();
    else delete quote.archivedAt;
    if (!saveState()) return;
    render('quotes');
    showToast(archived ? 'Quote archived.' : 'Quote restored.');
  }

  function confirmDeleteQuote(id) {
    const quote = state.quotes.find((item) => item.id === id);
    if (!quote) return showToast('Quote could not be found.', true);
    if (state.invoices.some((invoice) => invoice.quoteId === id)) return showToast('This quote has a linked invoice. Archive it instead to preserve business records.', true);
    showConfirmation('Delete this quote permanently?', `Permanently remove ${quote.number}? This cannot be undone.`, 'Delete quote', () => {
      state.quotes = state.quotes.filter((item) => item.id !== id);
      if (!saveState()) return;
      render('quotes');
      showToast('Quote deleted.');
    });
  }

  function confirmRenewQuote(id) {
    const quote = state.quotes.find((item) => item.id === id);
    if (!quote || quoteStatus(quote) !== 'expired') return showToast('Only expired quotes can be renewed.', true);
    showConfirmation(`Renew ${quote.number}?`, 'Create a new draft with the same services and pricing, dated today and valid for 30 days. The expired quote will remain in your records.', 'Create draft', () => {
      const today = localDate();
      const renewedQuote = {
        ...structuredClone(quote),
        id: makeId(),
        number: nextNumber('quote'),
        date: today,
        validUntil: addDays(today, 30),
        status: 'draft'
      };
      state.quotes.push(renewedQuote);
      if (!saveState()) return;
      render('quotes');
      showToast(`${renewedQuote.number} created as a new draft.`);
    });
  }

  function confirmCreateInvoice(id) {
    const quote = state.quotes.find((item) => item.id === id);
    if (!quote) return showToast('Quote could not be found.', true);
    if (quote.status !== 'accepted') return showToast('Only accepted quotes can be invoiced.', true);
    if (state.invoices.some((invoice) => invoice.quoteId === id)) return showToast('An invoice already exists for this quote.', true);
    showConfirmation('Create an invoice?', `Create an invoice for ${quote.number} with a due date 14 days from today?`, 'Create invoice', () => {
      const date = localDate();
      const subtotal = quoteSubtotal(quote);
      state.invoices.push({
        id: makeId(),
        number: nextNumber('invoice'),
        quoteId: quote.id,
        customerId: quote.customerId,
        currency: quoteCurrency(quote),
        date,
        dueDate: addDays(date, 14),
        lines: structuredClone(quote.lines),
        subtotal,
        tax: taxAmount(subtotal, quote.taxRate, quoteCurrency(quote)),
        taxRate: Number(quote.taxRate || 0),
        total: quoteTotal(quote),
        notes: quote.notes,
        status: 'unpaid',
        paidAt: null,
        payments: []
      });
      if (!saveState()) return;
      closeDialogs();
      render('invoices');
      showToast('Invoice created. You can print it, send a payment link, or record payment.');
    });
  }

  async function sendReminder(id, channel) {
    const invoice = state.invoices.find((item) => item.id === id);
    const customer = invoice && customerFor(invoice.customerId);
    if (!invoice || !customer) return showToast('Invoice or customer could not be found.', true);
    try {
      await cloudSaveQueue;
      if (cloudBlocked) throw new Error('Cloud sync is paused. Sign in again or reload before sending a reminder.');
      await apiRequest(`/api/invoices/${encodeURIComponent(id)}/remind`, { method: 'POST', body: { channel } });
      await refreshWorkspace();
      showToast(`Payment reminder sent by ${channel}.`);
    } catch (error) {
      showToast(error.message, true);
    }
  }

  function printDocument(id, type) {
    const documentRecord = type === 'quote' ? state.quotes.find((item) => item.id === id) : state.invoices.find((item) => item.id === id);
    const customer = documentRecord && customerFor(documentRecord.customerId);
    if (!documentRecord || !customer) return showToast('Document or customer could not be found.', true);
    const title = type === 'quote' ? 'Quote' : 'Invoice';
    const status = type === 'quote' ? quoteStatus(documentRecord) : invoiceStatus(documentRecord);
    const currency = type === 'quote' ? quoteCurrency(documentRecord) : paymentCurrency(documentRecord);
    const detailRows = documentRecord.lines.map((line) => `<tr><td>${escapeHtml(line.description)}</td><td>${escapeHtml(line.quantity)}</td><td>${money(line.unitPrice, currency)}</td><td>${money(line.quantity * line.unitPrice, currency)}</td></tr>`).join('');
    const details = type === 'quote' ? `Valid until ${formatDate(documentRecord.validUntil)}` : `Payment due ${formatDate(documentRecord.dueDate)} · ${money(invoiceBalanceDue(documentRecord), currency)} remaining`;
    root.innerHTML = `<div class="document-print"><div class="document-top"><div><span class="eyebrow">${escapeHtml(state.settings.businessName || 'YOUR BUSINESS')}</span><h1>${title}</h1><p>${escapeHtml(documentRecord.number)} · ${formatDate(documentRecord.date)}</p></div>${statusBadge(status)}</div>
      <div class="document-recipient"><span class="eyebrow">PREPARED FOR</span><strong>${escapeHtml(customer.name)}</strong>${customer.address ? `<span>${escapeHtml(customer.address)}</span>` : ''}${customer.email ? `<span>${escapeHtml(customer.email)}</span>` : ''}${customer.phone ? `<span>${escapeHtml(customer.phone)}</span>` : ''}</div>
      <p class="document-due">${details}</p>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Item or service</th><th>Qty</th><th>Price each</th><th>Total</th></tr></thead><tbody>${detailRows}</tbody></table></div>
      <div class="document-totals"><div><span>Subtotal</span><strong>${money(documentRecord.subtotal ?? quoteSubtotal(documentRecord), currency)}</strong></div>${Number(documentRecord.tax ?? taxAmount(quoteSubtotal(documentRecord), documentRecord.taxRate, currency)) ? `<div><span>Tax (${Number(documentRecord.taxRate ?? state.settings.taxRate)}%)</span><strong>${money(documentRecord.tax ?? taxAmount(quoteSubtotal(documentRecord), documentRecord.taxRate, currency), currency)}</strong></div>` : ''}<div class="document-grand-total"><span>Total</span><strong>${money(documentRecord.total ?? quoteTotal(documentRecord), currency)}</strong></div></div>
      ${type === 'invoice' && invoicePaidAmount(documentRecord) ? `<div class="document-totals"><div><span>Paid so far</span><strong>${money(invoicePaidAmount(documentRecord), currency)}</strong></div><div class="document-grand-total"><span>Balance due</span><strong>${money(invoiceBalanceDue(documentRecord), currency)}</strong></div></div>` : ''}
      ${documentRecord.notes ? `<div class="document-notes"><strong>Note</strong><p>${escapeHtml(documentRecord.notes).replace(/\n/g, '<br>')}</p></div>` : ''}<p class="document-thanks">Thank you for your business.</p>
      <div class="document-controls"><button class="button button-outline" data-view="${type === 'quote' ? 'quotes' : 'invoices'}">← Back</button><button class="button button-primary" data-action="browser-print">Print / Save PDF</button></div></div>`;
    document.getElementById('page-title').textContent = `${title} ${documentRecord.number}`;
    document.querySelectorAll('.nav-link[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === (type === 'quote' ? 'quotes' : 'invoices')));
  }

  function exportData() {
    const data = JSON.stringify({ ...state, exportedAt: new Date().toISOString(), format: 'neatwork-backup-v1' }, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `neatwork-backup-${localDate()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Workspace backup downloaded.');
  }

  async function importData(file) {
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Backup file is too large (10 MB maximum).');
      const imported = JSON.parse(await file.text());
      const data = imported;
      if (!data || data.format !== 'neatwork-backup-v1' || !Array.isArray(data.customers) || !Array.isArray(data.quotes) || !Array.isArray(data.invoices) || !data.settings || typeof data.settings !== 'object') {
        throw new Error('This file does not look like a Neatwork workspace backup.');
      }
      const isDate = (value) => {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const parsed = Date.parse(`${value}T00:00:00Z`);
        return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
      };
      const isText = (value) => typeof value === 'string';
      const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
      const validLine = (line) => line && isText(line.description) && line.description.trim() && isFiniteNumber(line.quantity) && line.quantity > 0 && isFiniteNumber(line.unitPrice) && line.unitPrice >= 0;
      const uniqueIds = (items) => items.every((item) => item && isText(item.id) && item.id) && new Set(items.map((item) => item.id)).size === items.length;
      const serviceTemplates = data.serviceTemplates ?? [];
      if (!Array.isArray(serviceTemplates) || !uniqueIds(serviceTemplates) || serviceTemplates.some((template) => !isText(template.name) || !template.name.trim() || !isFiniteNumber(template.unitPrice) || template.unitPrice < 0 || (template.currency !== undefined && !currencyNames[template.currency]))) {
        throw new Error('The backup contains invalid saved items.');
      }
      if (!uniqueIds(data.customers) || data.customers.some((customer) => !isText(customer.name) || !customer.name.trim() || ['email', 'phone', 'address'].some((key) => customer[key] !== undefined && !isText(customer[key])) || (customer.smsConsent !== undefined && typeof customer.smsConsent !== 'boolean'))) {
        throw new Error('The backup contains invalid customer records.');
      }
      if (!uniqueIds(data.quotes) || data.quotes.some((quote) => !isText(quote.number) || !isText(quote.customerId) || !isDate(quote.date) || !isDate(quote.validUntil) || quote.validUntil < quote.date || !['draft', 'sent', 'accepted', 'declined'].includes(quote.status) || !Array.isArray(quote.lines) || !quote.lines.length || quote.lines.some((line) => !validLine(line)) || (quote.currency !== undefined && !currencyNames[quote.currency]) || (quote.taxRate !== undefined && (!isFiniteNumber(quote.taxRate) || quote.taxRate < 0 || quote.taxRate > 100)) || (quote.notes !== undefined && !isText(quote.notes)))) {
        throw new Error('The backup contains invalid quote records.');
      }
      if (!uniqueIds(data.invoices) || data.invoices.some((invoice) => !isText(invoice.number) || !isText(invoice.customerId) || !isDate(invoice.date) || !isDate(invoice.dueDate) || invoice.dueDate < invoice.date || !['unpaid', 'paid'].includes(invoice.status) || !Array.isArray(invoice.lines) || !invoice.lines.length || invoice.lines.some((line) => !validLine(line)) || !['subtotal', 'tax', 'total'].every((key) => isFiniteNumber(invoice[key])) || (invoice.currency !== undefined && !currencyNames[invoice.currency]) || (invoice.taxRate !== undefined && (!isFiniteNumber(invoice.taxRate) || invoice.taxRate < 0 || invoice.taxRate > 100)) || (invoice.payments !== undefined && (!Array.isArray(invoice.payments) || invoice.payments.some((payment) => !payment || !isText(payment.id) || !payment.id || !isFiniteNumber(payment.amount) || payment.amount <= 0 || !isDate(payment.date) || !['stripe', 'paypal', 'paystack', 'cash', 'bank_transfer', 'card_terminal', 'other'].includes(payment.method) || (payment.type !== undefined && !['refund', 'bank_transfer_pending'].includes(payment.type)) || (payment.status !== undefined && !['pending', 'confirmed', 'rejected', 'recorded'].includes(payment.status))))))) {
        throw new Error('The backup contains invalid invoice records.');
      }
      if (!isText(data.settings.businessName || '') || !currencyNames[data.settings.currency] || !isFiniteNumber(data.settings.taxRate) || data.settings.taxRate < 0 || data.settings.taxRate > 100) {
        throw new Error('The backup contains invalid business settings.');
      }
      const customerIds = new Set(data.customers.map((customer) => customer.id));
      const quoteIds = new Set(data.quotes.map((quote) => quote.id));
      if (data.quotes.some((quote) => !customerIds.has(quote.customerId)) || data.invoices.some((invoice) => !customerIds.has(invoice.customerId) || (invoice.quoteId && !quoteIds.has(invoice.quoteId)))) {
        throw new Error('The backup contains documents linked to missing customers or quotes.');
      }
      if (!window.confirm('Replace all current workspace data with this backup? This cannot be undone.')) return;
      const nextSequence = (items, prefix, supplied) => {
        const largest = items.reduce((maximum, item) => {
          const match = new RegExp(`^${prefix}-(\\d+)$`).exec(item.number);
          return match ? Math.max(maximum, Number(match[1])) : maximum;
        }, 0);
        return Math.max(Number.isSafeInteger(supplied) && supplied > 0 ? supplied : 1, largest + 1);
      };
      const replacement = {
        settings: {
          ...initialState.settings,
          ...data.settings,
          businessCountry: countryCurrencies[data.settings.businessCountry]
            ? data.settings.businessCountry
            : defaultCountryForCurrency(data.settings.currency)
        },
        customers: data.customers,
        serviceTemplates: serviceTemplates.map((template) => ({ ...template, currency: template.currency || data.settings.currency })),
        quotes: data.quotes.map((quote) => ({ ...quote, currency: quote.currency || data.settings.currency })),
        invoices: data.invoices.map((invoice) => ({ ...invoice, currency: invoice.currency || data.settings.currency })),
        counters: {
          quote: nextSequence(data.quotes, 'Q', data.counters?.quote),
          invoice: nextSequence(data.invoices, 'I', data.counters?.invoice)
        }
      };
      const previousState = state;
      state = replacement;
      if (!saveState()) {
        state = previousState;
        return;
      }
      render('dashboard');
      showToast('Workspace backup imported.');
    } catch (error) {
      console.error('Unable to import Neatwork backup.', error);
      showToast(error.message || 'Could not import that backup file.', true);
    } finally {
      document.getElementById('import-file').value = '';
    }
  }

  document.addEventListener('click', (event) => {
    const viewButton = event.target.closest('[data-view]');
    if (viewButton) {
      event.preventDefault();
      render(viewButton.dataset.view);
      return;
    }
    const actionButton = event.target.closest('[data-action]');
    if (actionButton) {
      if (actionButton.dataset.action === 'browser-print') return window.print();
      performAction(actionButton.dataset.action, actionButton.dataset.id, actionButton.dataset.type, actionButton, actionButton.dataset.channel);
    }
  });

  root.addEventListener('submit', (event) => {
    if (event.target.id !== 'template-form') return;
    event.preventDefault();
    const data = new FormData(event.target);
    const name = String(data.get('name')).trim();
    const unitPrice = Number(data.get('unitPrice'));
    if (!name || !Number.isFinite(unitPrice) || unitPrice < 0) return showToast('Enter an item name and a valid price.', true);
    if (state.serviceTemplates.some((template) => template.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return showToast('A saved item with that name already exists.', true);
    state.serviceTemplates.push({ id: makeId(), name, unitPrice, currency: state.settings.currency });
    if (!saveState()) return;
    render('settings');
    showToast('Saved item added.');
  });

  document.getElementById('customer-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const existing = editingCustomerId ? customerFor(editingCustomerId) : null;
    if (editingCustomerId && (!existing || existing.archivedAt)) return showToast('This customer is no longer editable.', true);
    const customer = {
      ...(existing || {}),
      id: existing?.id || makeId(),
      name: String(data.get('name')).trim(),
      email: String(data.get('email')).trim(),
      phone: String(data.get('phone')).trim(),
      address: String(data.get('address')).trim(),
      smsConsent: Boolean(data.get('smsConsent')),
      smsConsentUpdatedAt: data.get('smsConsent') ? new Date().toISOString() : null,
      createdAt: existing?.createdAt || localDate()
    };
    if (!customer.name) return showToast('Enter a customer name.', true);
    if (existing) state.customers[state.customers.indexOf(existing)] = customer;
    else state.customers.push(customer);
    if (!saveState()) return;
    editingCustomerId = null;
    closeDialogs();
    render('customers');
    showToast(existing ? 'Customer updated.' : 'Customer added.');
  });

  document.getElementById('quote-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const lines = [...document.querySelectorAll('#quote-lines .quote-line')].map((line) => ({
      description: line.querySelector('[name="description"]').value.trim(),
      quantity: Number(line.querySelector('[name="quantity"]').value),
      unitPrice: Number(line.querySelector('[name="unitPrice"]').value)
    }));
    if (!customerFor(data.get('customerId'))) return showToast('Choose a valid customer.', true);
    if (!lines.length || lines.some((line) => !line.description || !Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.unitPrice) || line.unitPrice < 0)) return showToast('Check each item or service, quantity, and price.', true);
    const date = String(data.get('date'));
    const validUntil = String(data.get('validUntil'));
    if (!date || !validUntil || validUntil < date) return showToast('The valid-until date must be on or after the quote date.', true);
    const editedQuote = editingQuoteId ? state.quotes.find((item) => item.id === editingQuoteId && item.status === 'draft') : null;
    if (editingQuoteId && !editedQuote) return showToast('This quote is no longer an editable draft.', true);
    const quote = {
      id: editedQuote?.id || makeId(),
      number: editedQuote?.number || nextNumber('quote'),
      customerId: String(data.get('customerId')),
      date,
      validUntil,
      lines,
      currency: editedQuote?.currency || state.settings.currency,
      taxRate: Number(state.settings.taxRate || 0),
      notes: String(data.get('notes')).trim(),
      status: 'draft'
    };
    if (editedQuote) state.quotes[state.quotes.indexOf(editedQuote)] = quote;
    else state.quotes.push(quote);
    if (!saveState()) return;
    editingQuoteId = null;
    closeDialogs();
    render('quotes');
    showToast(`${quote.number} ${editedQuote ? 'updated' : 'saved'} as a draft.`);
  });

  document.getElementById('settings-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const taxRate = Number(data.get('taxRate'));
    const businessCountry = String(data.get('businessCountry'));
    const currency = countryCurrencies[businessCountry];
    const businessName = String(data.get('businessName')).trim();
    if (!businessName || !countryCurrencies[businessCountry] || !currencyNames[currency] || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) return showToast('Enter valid business settings.', true);
    const daysAfterDue = [...document.querySelectorAll('#settings-form [name=reminderDay]:checked')].map((input) => Number(input.value)).sort((a, b) => a - b);
    const reminders = {
      enabled: event.currentTarget.elements.remindersEnabled.checked,
      email: event.currentTarget.elements.remindersEmail.checked,
      sms: event.currentTarget.elements.remindersSms.checked,
      daysAfterDue
    };
    if (reminders.enabled && !reminders.email && !reminders.sms) return showToast('Choose at least one reminder channel.', true);
    if (reminders.enabled && !daysAfterDue.length) return showToast('Choose at least one reminder day.', true);
    if (reminders.enabled && reminders.email && !appConfig?.emailEnabled) return showToast('Email reminders are not configured. Add Gmail credentials on the server first.', true);
    if (reminders.enabled && reminders.sms && !appConfig?.smsEnabled) return showToast('SMS reminders are not configured. Add Twilio credentials on the server first.', true);
    state.settings = { ...state.settings, businessName, businessCountry, currency, taxRate, bankTransferInstructions: String(data.get('bankTransferInstructions') || '').trim(), reminders };
    if (!saveState()) return;
    closeDialogs();
    render();
    showToast('Business settings saved.');
  });

  document.querySelector('#settings-form [name=businessCountry]').addEventListener('change', (event) => {
    const currency = countryCurrencies[event.currentTarget.value];
    if (currency) document.querySelector('#settings-form [name=currency]').value = currency;
  });

  document.getElementById('confirm-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const handler = confirmationHandler;
    confirmationHandler = null;
    closeDialogs();
    handler?.();
  });

  document.getElementById('import-file').addEventListener('change', (event) => importData(event.currentTarget.files?.[0]));

  root.addEventListener('input', (event) => {
    if (event.target.id !== 'list-search') return;
    const position = event.target.selectionStart;
    const query = event.target.value;
    if (activeView === 'quotes') renderQuotes(query);
    else if (activeView === 'invoices') renderInvoices(query);
    else if (activeView === 'customers') renderCustomers(query);
    const search = document.getElementById('list-search');
    if (search) {
      search.focus();
      search.setSelectionRange(position, position);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') confirmationHandler = null;
  });

  document.querySelectorAll('[data-auth-mode]').forEach((button) => button.addEventListener('click', () => setAuthMode(button.dataset.authMode)));
  document.getElementById('auth-form').addEventListener('submit', submitAuth);
  setAuthMode('signin');
  updateBusinessLabel();
  render();
  initializeAuth();
})();
