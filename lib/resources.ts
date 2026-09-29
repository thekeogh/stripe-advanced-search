export type Resource = {
  id: string;
  name: string;
  singular: string;
  section: string;
  path: string;
  description: string;
  columns: string[];
  expand?: string[];
};

export const resources: Resource[] = [
  { id: "customers", name: "Customers", singular: "customer", section: "People", path: "/v1/customers", description: "Profiles, contact details, balances and metadata", columns: ["id", "name", "email", "created"], expand: ["data.subscriptions"] },
  { id: "subscriptions", name: "Subscriptions", singular: "subscription", section: "Billing", path: "/v1/subscriptions", description: "Status, items, prices, discounts and periods", columns: ["id", "customer", "status", "items.data.price.product", "created"], expand: ["data.customer", "data.discounts", "data.items.data.discounts"] },
  { id: "payment_intents", name: "Payments", singular: "payment", section: "Money", path: "/v1/payment_intents", description: "Payment amount, status, method and customer", columns: ["id", "customer", "amount", "currency", "status", "created"], expand: ["data.customer"] },
  { id: "charges", name: "Charges", singular: "charge", section: "Money", path: "/v1/charges", description: "Completed and attempted charges, card details", columns: ["id", "customer", "amount", "currency", "status", "created"], expand: ["data.customer"] },
  { id: "balance_transactions", name: "Balance transactions", singular: "balance transaction", section: "Money", path: "/v1/balance_transactions", description: "Gross, fees, net, type and source", columns: ["id", "type", "amount", "fee", "net", "created"] },
  { id: "refunds", name: "Refunds", singular: "refund", section: "Money", path: "/v1/refunds", description: "Refund amounts, reasons and status", columns: ["id", "payment_intent", "amount", "currency", "status", "created"] },
  { id: "disputes", name: "Disputes", singular: "dispute", section: "Money", path: "/v1/disputes", description: "Dispute amount, reason, status and evidence", columns: ["id", "charge", "amount", "reason", "status", "created"] },
  { id: "invoices", name: "Invoices", singular: "invoice", section: "Billing", path: "/v1/invoices", description: "Totals, status, due dates and line items", columns: ["id", "number", "customer", "total", "currency", "status", "created"], expand: ["data.customer"] },
  { id: "credit_notes", name: "Credit notes", singular: "credit note", section: "Billing", path: "/v1/credit_notes", description: "Credits against invoices", columns: ["id", "customer", "invoice", "total", "status", "created"] },
  { id: "invoiceitems", name: "Invoice items", singular: "invoice item", section: "Billing", path: "/v1/invoiceitems", description: "Individual invoice charges and credits", columns: ["id", "customer", "invoice", "amount", "currency", "created"] },
  { id: "quotes", name: "Quotes", singular: "quote", section: "Billing", path: "/v1/quotes", description: "Quotes, totals, customers and status", columns: ["id", "customer", "status", "amount_total", "created"] },
  { id: "subscription_schedules", name: "Subscription schedules", singular: "schedule", section: "Billing", path: "/v1/subscription_schedules", description: "Phases, future prices and status", columns: ["id", "customer", "status", "start_date", "end_date"] },
  { id: "products", name: "Products", singular: "product", section: "Catalog", path: "/v1/products", description: "Product names, active state and metadata", columns: ["id", "name", "active", "created"] },
  { id: "prices", name: "Prices", singular: "price", section: "Catalog", path: "/v1/prices", description: "Product, amount, currency and recurrence", columns: ["id", "product", "unit_amount", "currency", "recurring.interval", "active"] },
  { id: "coupons", name: "Coupons", singular: "coupon", section: "Catalog", path: "/v1/coupons", description: "Discount value, duration and limits", columns: ["id", "name", "percent_off", "amount_off", "duration", "valid"] },
  { id: "promotion_codes", name: "Promotion codes", singular: "promotion code", section: "Catalog", path: "/v1/promotion_codes", description: "Codes, coupons and redemption rules", columns: ["id", "code", "coupon.id", "active", "created"] },
  { id: "tax_rates", name: "Tax rates", singular: "tax rate", section: "Catalog", path: "/v1/tax_rates", description: "Rates, regions and inclusive settings", columns: ["id", "display_name", "percentage", "country", "active"] },
  { id: "shipping_rates", name: "Shipping rates", singular: "shipping rate", section: "Catalog", path: "/v1/shipping_rates", description: "Shipping costs, types and destinations", columns: ["id", "display_name", "fixed_amount.amount", "active", "created"] },
  { id: "checkout_sessions", name: "Checkout sessions", singular: "checkout session", section: "Commerce", path: "/v1/checkout/sessions", description: "Checkout status, customer and totals", columns: ["id", "customer", "mode", "payment_status", "amount_total", "created"], expand: ["data.customer"] },
  { id: "payment_links", name: "Payment links", singular: "payment link", section: "Commerce", path: "/v1/payment_links", description: "Link status, restrictions and metadata", columns: ["id", "active", "url", "created"] },
  { id: "payouts", name: "Payouts", singular: "payout", section: "Money", path: "/v1/payouts", description: "Payout amounts, arrival and status", columns: ["id", "amount", "currency", "status", "arrival_date"] },
  { id: "transfers", name: "Transfers", singular: "transfer", section: "Money", path: "/v1/transfers", description: "Transfers to connected accounts", columns: ["id", "destination", "amount", "currency", "created"] },
  { id: "topups", name: "Top-ups", singular: "top-up", section: "Money", path: "/v1/topups", description: "Account funding amounts and status", columns: ["id", "amount", "currency", "status", "created"] },
  { id: "events", name: "Events", singular: "event", section: "Activity", path: "/v1/events", description: "Recent Stripe event objects", columns: ["id", "type", "data.object.id", "created"] },
];

export const resourceById = Object.fromEntries(resources.map((resource) => [resource.id, resource])) as Record<string, Resource>;
