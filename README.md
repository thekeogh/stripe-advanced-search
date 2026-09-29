# Prism — Stripe Explorer

A read-only, dark themed explorer for Stripe data. Choose a record type, combine conditions across its fields and nested objects, inspect full API records, and export the matches as CSV.

## Requirements

- Node.js **24.21.0** (`.nvmrc`)
- pnpm
- A [Stripe restricted API key](https://docs.stripe.com/keys/restricted-api-keys) with **read** access to the resources you want to explore

## Setup

```bash
nvm use
pnpm install
cp .env.example .env.local
```

Edit `.env.local`:

```dotenv
STRIPE_RESTRICTED_KEY=rk_test_your_key_here
```

Then start the app:

```bash
pnpm run dev
```

The development command opens the app in your default browser. If the key is missing, the home page shows a prominent setup error instead of an empty explorer. `.env.local` is ignored by Git; never use a `NEXT_PUBLIC_` prefix for this key.

For live data, use an `rk_live_...` restricted key with the appropriate read permissions. The server-side API route is allowlisted to supported Stripe list endpoints and sends **GET requests only**. The app contains no Stripe create, update or delete routes. If you deploy this app, protect access to the deployment: a server-side key alone does not restrict who can use its search UI.

## Searching

1. Choose a data source in the left sidebar. The app supports customers, subscriptions, payments, charges, balance transactions, refunds, disputes, invoices, invoice items, credit notes, quotes, subscription schedules, products, prices, coupons, promotion codes, tax rates, shipping rates, Checkout sessions, payment links, payouts, transfers, top-ups and recent events.
2. Add conditions. Searchable field choices show a readable label, the exact Stripe path, and the expected value type. For example, **Subscription item · Price · Product ID** expects `prod_…`; type at least three characters to search for a product by name and select its ID. Metadata fields are labeled as metadata. Fields found in sampled Stripe records appear automatically, and you can still enter any dot-separated path such as `metadata.segment` or `payment_method_details.card.last4`.
3. Combine conditions with **all**, **any** or **none** groups. A **related record group** evaluates its conditions on the same item in a nested array, for example the same subscription item.
4. Run the search. The app follows every top-level Stripe list page, checks each record locally, and shows results as they arrive. The result count is final only after the scan finishes.
5. Pick visible columns, open a row for its complete returned JSON, or export the completed result set to CSV. Filter definitions can be saved in this browser; Stripe data and the API key are not saved there.

### Examples

- **Payment on a day by a customer:** choose Payments; set `customer` **is** `cus_...` and `created` **on day (UTC)** `2026-09-29`. Stripe date fields are Unix seconds; comparison filters also accept ISO dates.
- **Active subscription containing a product:** choose Subscriptions; set `status` **is** `active` and `items.data.price.product` **is** `prod_...`.
- **Product and price conditions on the same item:** choose Subscriptions, add a related record group for `items.data`, then set `price.product` and `price.id` within that group.
- **No matching coupon on a subscription:** use a related record group for `discounts` and select **none**, with `source.coupon` **is** the coupon ID. On older Stripe API versions, `coupon.id` may be the returned path instead. Depending on how discounts were applied, also inspect customer-level or subscription-item discounts.

An applied **discount ID** (`di_…`) identifies the discount instance. A **coupon ID** identifies the coupon behind it. `discount` and `discounts` in the field picker match discount IDs; choose `discount.source.coupon`, `discounts.source.coupon`, or `items.data.discounts.source.coupon` to match coupon IDs when those fields appear in the returned data. The customer's nested `subscriptions.data.*.discounts` lists contain discount IDs without coupon details. Use the **Subscriptions** data source for subscription coupon criteria.

Amounts are displayed and filtered in the raw integer units returned by Stripe (typically the currency's smallest unit). Dates displayed in the table use the browser's locale; date filter input is interpreted as a UTC instant for numeric Stripe timestamps.

## Scope and limits

The field builder can inspect any attribute **returned** by the selected Stripe list API and supported expansions. It cannot search data Stripe does not expose, or data omitted from a response. Certain nested lists, such as a customer's expanded subscriptions or an invoice's lines, can themselves have more pages. The app warns when it sees such a partial nested list; criteria on later nested pages may be missed. A custom field path can filter an existing nested value, but it does not fetch an unreturned relationship automatically.

The app scans top-level pages on demand. Wide searches over very large accounts may be slow and consume substantial read-request allocation. Stripe rate limits can produce a visible error; narrow the query or retry later. There is no local Stripe data index or background sync. Search results can change while a multi-page scan runs.

Stripe permissions determine which resources can be listed. If a resource has no read permission, Stripe's error appears in the interface. This app uses Stripe's list APIs, so search-index freshness delays do not apply to the main scan; the scan still is not a transactionally consistent snapshot.

## Scripts

```bash
pnpm run dev        # Next.js development server; opens a browser
pnpm run build      # production build
pnpm run start      # production server
pnpm run lint       # ESLint
pnpm run typecheck  # TypeScript
```
