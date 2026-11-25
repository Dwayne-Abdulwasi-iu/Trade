(() => {
  'use strict';
  const content = document.getElementById('share-content');
  const token = new URLSearchParams(location.search).get('token');
  const currencyFormat = (currency, amount) => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(amount) || 0);

  function showMessage(title, message, error = false) {
    content.replaceChildren();
    const eyebrow = document.createElement('span');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = error ? 'LINK UNAVAILABLE' : 'QUOTE UPDATE';
    const heading = document.createElement('h1');
    heading.textContent = title;
    const body = document.createElement('p');
    body.textContent = message;
    content.append(eyebrow, heading, body);
  }

  async function request(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Unable to load this quote.');
    return data;
  }

  function showQuote(quote) {
    content.replaceChildren();
    document.title = `${quote.businessName} — Quote ${quote.number}`;
    const eyebrow = document.createElement('span');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = quote.businessName;
    const heading = document.createElement('h1');
    heading.textContent = `Quote ${quote.number}`;
    const greeting = document.createElement('p');
    greeting.className = 'share-greeting';
    greeting.textContent = `Prepared for ${quote.customerName} · Valid until ${new Date(`${quote.validUntil}T12:00:00`).toLocaleDateString()}`;
    const table = document.createElement('table');
    table.className = 'share-table';
    const body = document.createElement('tbody');
    for (const line of quote.lines) {
      const row = document.createElement('tr');
      for (const value of [line.description, `${line.quantity} × ${currencyFormat(quote.currency, line.unitPrice)}`, currencyFormat(quote.currency, line.quantity * line.unitPrice)]) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      }
      body.append(row);
    }
    table.append(body);
    const summary = document.createElement('div');
    summary.className = 'share-total';
    const subtotal = document.createElement('p');
    subtotal.textContent = `Subtotal: ${currencyFormat(quote.currency, quote.subtotal)}`;
    const tax = document.createElement('p');
    tax.textContent = `Tax (${quote.taxRate}%): ${currencyFormat(quote.currency, quote.total - quote.subtotal)}`;
    const total = document.createElement('strong');
    total.textContent = `Total: ${currencyFormat(quote.currency, quote.total)}`;
    summary.append(subtotal, tax, total);
    content.append(eyebrow, heading, greeting, table, summary);

    if (quote.notes) {
      const note = document.createElement('p');
      note.className = 'share-note';
      note.textContent = quote.notes;
      content.append(note);
    }

    const status = document.createElement('p');
    status.className = 'share-status';
    if (quote.status === 'accepted') {
      status.textContent = 'You have accepted this quote. Thank you.';
      content.append(status);
    } else if (quote.status === 'declined') {
      status.textContent = 'You have declined this quote.';
      content.append(status);
    } else if (quote.status !== 'sent') {
      status.textContent = 'This quote is not currently accepting responses.';
      content.append(status);
    } else {
      const actions = document.createElement('div');
      actions.className = 'share-actions';
      for (const answer of ['accepted', 'declined']) {
        const button = document.createElement('button');
        button.className = answer === 'accepted' ? 'button button-primary' : 'button button-outline';
        button.textContent = answer === 'accepted' ? 'Accept quote' : 'Decline';
        button.addEventListener('click', () => respond(answer, actions, status));
        actions.append(button);
      }
      content.append(actions, status);
    }
  }

  async function respond(answer, actions, status) {
    actions.querySelectorAll('button').forEach((button) => { button.disabled = true; });
    status.textContent = 'Recording your response…';
    try {
      const result = await request(`/api/public/quote/${encodeURIComponent(token)}/respond`, { method: 'POST', body: JSON.stringify({ response: answer }) });
      status.textContent = result.status === 'accepted' ? `Quote accepted. Your response has been recorded for ${result.businessName}.` : `Quote declined. Your response has been recorded for ${result.businessName}.`;
      actions.remove();
    } catch (error) {
      status.textContent = error.message;
      actions.querySelectorAll('button').forEach((button) => { button.disabled = false; });
    }
  }

  async function initialize() {
    const payment = new URLSearchParams(location.search).get('payment');
    if (payment === 'success') {
      showMessage('Payment submitted', 'Thank you. Your payment is being confirmed securely. The invoice status will update after Stripe confirms it.');
      return;
    }
    if (payment === 'paypal') {
      const orderId = new URLSearchParams(location.search).get('token');
      if (!orderId) {
        showMessage('Payment confirmation pending', 'PayPal returned without an order reference. Contact the business to confirm your payment.', true);
        return;
      }
      try {
        await request('/api/public/paypal/capture', { method: 'POST', body: JSON.stringify({ orderId }) });
        showMessage('Payment received', 'PayPal confirmed your payment. The invoice balance has been updated.');
      } catch (error) {
        showMessage('Payment confirmation pending', `${error.message} Contact the business if you have already completed payment.`, true);
      }
      return;
    }
    if (payment === 'paystack') {
      const parameters = new URLSearchParams(location.search);
      const reference = parameters.get('reference') || parameters.get('trxref');
      if (!reference) {
        showMessage('Payment confirmation pending', 'Paystack returned without a transaction reference. Contact the business to confirm your payment.', true);
        return;
      }
      try {
        await request('/api/public/paystack/verify', { method: 'POST', body: JSON.stringify({ reference }) });
        showMessage('Payment received', 'Paystack confirmed your payment. The invoice balance has been updated.');
      } catch (error) {
        showMessage('Payment confirmation pending', `${error.message} Contact the business if you have already completed payment.`, true);
      }
      return;
    }
    if (payment === 'cancelled') {
      showMessage('Payment not completed', 'No payment was recorded. You can reopen the payment link or contact the business.');
      return;
    }
    if (!token) {
      showMessage('Quote link missing', 'Open the complete approval link you received from the business.', true);
      return;
    }
    try {
      showQuote(await request(`/api/public/quote?token=${encodeURIComponent(token)}`));
    } catch (error) {
      showMessage('Quote unavailable', error.message, true);
    }
  }

  initialize();
})();
