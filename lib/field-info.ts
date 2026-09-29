import type { Field } from "./filter";

export type FieldKind = "product_id" | "price_id" | "customer_id" | "coupon_id" | "discount_id" | "promotion_code_id" | "id" | "date" | "amount" | "number" | "boolean" | "email" | "object" | "list" | "text";
export type FieldInfo = { label: string; kind: FieldKind; badge: string; hint: string; placeholder: string };

const title = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const prefix = (path: string) => path.startsWith("items.data.") ? "Subscription item · " : path.startsWith("customer.") ? "Customer · " : path.startsWith("lines.data.") ? "Invoice line · " : "";

export function fieldInfo(path: string, sample?: Field, rootName = "Record"): FieldInfo {
  const parts = path.split(".");
  const leaf = parts.at(-1) ?? path;
  const context = prefix(path);
  const metadataAt = parts.indexOf("metadata");
  if (metadataAt !== -1) {
    const key = parts.slice(metadataAt + 1).join(".");
    if (!key) return { label: `${context}Metadata`, kind: "object", badge: "OBJECT", hint: "Metadata is a key/value object. Choose a key below it, or check whether metadata is set or empty.", placeholder: "" };
    return { label: `${context}Metadata${key ? ` · ${key}` : ""}`, kind: "text", badge: "TEXT", hint: "A value saved in Stripe metadata. Its format depends on your integration.", placeholder: "Enter metadata value" };
  }
  const discountIndex = parts.findIndex((part) => part === "discount" || part === "discounts");
  if (discountIndex !== -1) {
    const before = parts.slice(0, discountIndex);
    const after = parts.slice(discountIndex + 1);
    const owner = before.includes("items") ? "Subscription item" : before.includes("subscriptions") ? "Subscription" : before.includes("customer") || rootName === "Customer" ? "Customer" : rootName === "Subscription" ? "Subscription" : "Applied";
    const plural = parts[discountIndex] === "discounts";
    const discountLabel = `${owner} discount${plural ? "s" : ""}`;
    if (!after.length || (after.length === 1 && after[0] === "id")) return {
      label: `${discountLabel} · Discount ID`, kind: "discount_id", badge: plural ? "DISCOUNT IDS" : "DISCOUNT ID",
      hint: before.includes("subscriptions") ? "These are applied discount IDs (di_…), not coupon IDs. The customer’s nested subscription list does not include coupon details; search Subscriptions to filter by coupon ID." : `Match an applied Stripe discount ID (di_…). This is not a coupon ID. ${plural ? "A match in any discount in this list counts. " : ""}Choose ${discountLabel} · Coupon ID to match the coupon instead.`, placeholder: "di_…",
    };
    if (after.join(".") === "source.coupon" || after.join(".") === "coupon.id" || after.join(".") === "coupon") return {
      label: `${discountLabel} · Coupon ID`, kind: "coupon_id", badge: "COUPON ID",
      hint: "Match the coupon ID that caused the applied discount. This is the coupon ID, not the discount ID (di_…) or a promotion code.", placeholder: "Coupon ID",
    };
    if (after.join(".") === "promotion_code" || after.join(".") === "promotion_code.id") return {
      label: `${discountLabel} · Promotion code ID`, kind: "promotion_code_id", badge: "PROMO CODE ID",
      hint: "Match the Stripe promotion code ID (promo_…), not the code a customer typed.", placeholder: "promo_…",
    };
  }
  if (leaf === "product") {
    const owner = parts.includes("plan") ? "Legacy plan · " : parts.includes("price") ? "Price · " : "";
    return { label: `${context}${owner}Product ID`, kind: "product_id", badge: "PRODUCT ID", hint: "Select a product by name or paste its Stripe ID (prod_…). This field stores an ID, not a product name.", placeholder: "Search product name or paste prod_…" };
  }
  if (leaf === "price" || (leaf === "id" && parts.at(-2) === "price")) return { label: `${context}Price ID`, kind: "price_id", badge: "PRICE ID", hint: "Enter a Stripe price ID beginning with price_.", placeholder: "price_…" };
  if (leaf === "customer" || (leaf === "id" && parts.at(-2) === "customer")) return { label: `${context}Customer ID`, kind: "customer_id", badge: "CUSTOMER ID", hint: "Enter a Stripe customer ID beginning with cus_.", placeholder: "cus_…" };
  if (leaf === "coupon" || (leaf === "id" && parts.at(-2) === "coupon")) return { label: `${context}Coupon ID`, kind: "coupon_id", badge: "COUPON ID", hint: "Enter the coupon ID, not its display name or promotion code.", placeholder: "Coupon ID" };
  if (leaf === "id") return { label: path === "id" ? `${title(rootName)} ID` : `${context}${title(parts.at(-2) ?? "Record")} ID`, kind: "id", badge: "ID", hint: "Enter the exact Stripe object ID.", placeholder: "Stripe ID" };
  if (leaf === "email") return { label: `${context}Email`, kind: "email", badge: "EMAIL", hint: "Enter an email address or choose a text operator such as contains.", placeholder: "name@example.com" };
  if (sample?.type === "boolean" || ["active", "paid", "livemode", "cancel_at_period_end"].includes(leaf)) return { label: `${context}${title(leaf)}`, kind: "boolean", badge: "YES / NO", hint: "Choose true or false.", placeholder: "true or false" };
  if (sample?.type === "date" || /(^created$|^updated$|_at$|_date$|^due_date$|^arrival_date$|^current_period_(start|end)$|^trial_(start|end)$)/.test(leaf)) return { label: `${context}${title(leaf)}`, kind: "date", badge: "DATE", hint: "For a calendar day, use ‘on day (UTC)’ with YYYY-MM-DD. Stripe stores this as a Unix timestamp.", placeholder: "YYYY-MM-DD or Unix seconds" };
  if (/percent|percentage/.test(leaf)) return { label: `${context}${title(leaf)}`, kind: "number", badge: "PERCENT", hint: "Enter a percentage, for example 12.5.", placeholder: "e.g. 12.5" };
  if (/(^|_)(amount|total|subtotal|fee|net|balance)(_|$)/.test(leaf)) return { label: `${context}${title(leaf)}`, kind: "amount", badge: "MINOR UNITS", hint: "Enter Stripe's raw integer amount, usually cents or pence. For example, 1000 means £10.00 for GBP.", placeholder: "e.g. 1000" };
  if (sample?.type === "number") return { label: `${context}${title(leaf)}`, kind: "number", badge: "NUMBER", hint: "Enter a number.", placeholder: "Enter number" };
  if (sample?.type === "object" || sample?.type === "array") return { label: `${context}${title(leaf)}`, kind: sample.type === "array" ? "list" : "object", badge: sample.type === "array" ? "LIST" : "OBJECT", hint: sample.type === "array" ? "This is a list. A value comparison matches any entry; is empty checks whether the list has no values. For objects in this list, choose a child field for a precise comparison." : "This contains nested values. Choose a field inside it to compare a value, or check whether it is set or empty.", placeholder: sample.type === "array" ? "Value in list" : "" };
  const label = `${context}${title(leaf)}`;
  return { label, kind: "text", badge: "TEXT", hint: "Enter the exact value, or choose a text operator such as contains.", placeholder: "Enter value" };
}

export function validateFieldValue(field: string, value: string): string | null {
  if (!field) return "Choose a field for every condition.";
  if (!value.trim()) return `Enter a value for ${field}.`;
  if (fieldInfo(field).kind === "product_id" && !value.startsWith("prod_")) return "Choose a product from the list or enter a prod_… ID.";
  return null;
}
