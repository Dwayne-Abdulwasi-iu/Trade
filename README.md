# Neatwork

> **Run sales, track commissions, and keep every payment in order.**

Neatwork is a business operations workspace for agencies and teams that manage customer records, sales, quotes, invoices, and payments. The product is designed for cleaning and sales agencies, recruitment and referral businesses, real-estate and property agents, affiliate and reseller networks, marketing agencies, delivery and freelance teams, and businesses with custom services.

## Website usage

1. Sign in to your private workspace.
2. Add customers or companies with their contact details.
3. Create itemized quotes for products or services, then share them for customer approval.
4. Convert accepted quotes into invoices.
5. Send an online payment link or record an offline payment; follow partial balances, refunds, and payment history.
6. Review quotes, invoices, and payments from the overview. Configure business details and reusable items in Settings.

The public **Platform overview and usage** page is available at `/guide` and from the sign-in page and workspace navigation.

## Current features

- Customer and company contact records
- Product or service quotes, customer responses, invoices, and payment links
- Online checkout integrations for configured Stripe, PayPal, and Paystack accounts
- Manual payment records, partial payments, refund records, and informational installment plans
- Email/SMS delivery and configurable invoice reminders
- Customer and quote archiving, workspace backup import/export, and cloud sync

## Planned capabilities

Commission rules and payout states, agent/team roles, branch management, sales targets, commission and revenue reports, configurable work types, customer notes and referral history, and a cross-workspace activity audit trail are planned, but are **not currently available**. Neatwork does not currently calculate or pay commissions.

## Run locally

1. Install Node.js 20 or later.
2. Install dependencies with `npm install`.
3. Configure the server environment using `.env.example`. MongoDB URI, database name, and a unique session secret are required for cloud accounts and workspace sync. Add provider credentials only for integrations you intend to enable.
4. Run `npm start` and open `http://localhost:4173`.

Keep database and payment-provider credentials on the server, never in browser code. Use HTTPS in production and configure payment provider webhooks and messaging consent before enabling live services.
