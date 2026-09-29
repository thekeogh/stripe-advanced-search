import assert from "node:assert/strict";
import test from "node:test";
import { discoverFields, matchesGroup, newGroup, newRule, valuesAt } from "./filter.ts";
import { fieldInfo, validateFieldValue } from "./field-info.ts";

test("reads fields through nested Stripe list arrays", () => {
  const record = { items: { data: [{ price: { product: "prod_A" } }, { price: { product: "prod_B" } }] } };
  assert.deepEqual(valuesAt(record, "items.data.price.product"), ["prod_A", "prod_B"]);
});

test("related group matches conditions on the same item", () => {
  const record = { items: { data: [{ price: { product: "prod_A", id: "price_1" } }, { price: { product: "prod_B", id: "price_2" } }] } };
  const group = newGroup("items.data");
  const product = newRule("price.product"); product.value = "prod_A";
  const price = newRule("price.id"); price.value = "price_2";
  group.children = [product, price];
  assert.equal(matchesGroup(record, group), false);
  price.value = "price_1";
  assert.equal(matchesGroup(record, group), true);
});

test("none scoped group excludes any item using a specified coupon", () => {
  const group = newGroup("discounts"); group.join = "none";
  const coupon = newRule("coupon.id"); coupon.value = "coupon_Y"; group.children = [coupon];
  assert.equal(matchesGroup({ discounts: [{ coupon: { id: "coupon_X" } }] }, group), true);
  assert.equal(matchesGroup({ discounts: [{ coupon: { id: "coupon_Y" } }] }, group), false);
  assert.equal(matchesGroup({ discounts: [] }, group), true);
});

test("numeric and date comparisons work with Stripe timestamps", () => {
  const group = newGroup();
  const amount = newRule("amount"); amount.operator = "gte"; amount.value = "1000";
  const created = newRule("created"); created.operator = "gte"; created.value = "2026-09-29";
  group.children = [amount, created];
  assert.equal(matchesGroup({ amount: 1200, created: Date.parse("2026-09-30") / 1000 }, group), true);
  assert.equal(matchesGroup({ amount: 900, created: Date.parse("2026-09-30") / 1000 }, group), false);
  created.operator = "on_day"; created.value = "2026-09-30";
  assert.equal(matchesGroup({ amount: 1200, created: Date.parse("2026-09-30T13:00:00Z") / 1000 }, group), true);
});

test("field labels distinguish product IDs from metadata text", () => {
  assert.equal(fieldInfo("items.data.price.product").kind, "product_id");
  assert.equal(fieldInfo("items.data.price.product").badge, "PRODUCT ID");
  assert.match(fieldInfo("items.data.price.product").label, /Price · Product ID/);
  assert.match(fieldInfo("items.data.plan.product").label, /Legacy plan · Product ID/);
  assert.equal(fieldInfo("customer.metadata.product").kind, "text");
  assert.equal(fieldInfo("cancellation_details.feedback").kind, "text");
  assert.match(fieldInfo("customer.metadata.product").label, /Metadata/);
  assert.match(validateFieldValue("items.data.price.product", "Gold Plan") ?? "", /prod_/);
  assert.equal(validateFieldValue("items.data.price.product", "prod_123"), null);
});

test("discount choices distinguish applied discount, coupon, and nested list values", () => {
  const records = [{ discount: null, subscriptions: { data: [{ items: { data: [{ discounts: ["di_123"] }] } }] } }];
  const fields = discoverFields(records);
  assert.equal(fieldInfo("discount", fields.find((field) => field.path === "discount"), "Customer").badge, "DISCOUNT ID");
  const itemDiscounts = fieldInfo("subscriptions.data.items.data.discounts", fields.find((field) => field.path === "subscriptions.data.items.data.discounts"), "Customer");
  assert.equal(itemDiscounts.badge, "DISCOUNT IDS");
  assert.match(itemDiscounts.hint, /does not include coupon details/);
  assert.equal(fieldInfo("discount.source.coupon", undefined, "Customer").badge, "COUPON ID");
  assert.equal(fieldInfo("items.data.discounts.source.coupon", undefined, "Subscription").badge, "COUPON ID");
  assert.equal(fieldInfo("billing_mode.flexible.proration_discounts", { path: "billing_mode.flexible.proration_discounts", sample: "included", type: "text" }).badge, "TEXT");
  assert.equal(fields.find((field) => field.path === "subscriptions.data.items.data.discounts")?.type, "array");
});

test("generic nested objects and lists are not presented as text", () => {
  const fields = discoverFields([{ settings: { enabled: true }, tags: ["one"] }]);
  assert.equal(fieldInfo("settings", fields.find((field) => field.path === "settings")).badge, "OBJECT");
  assert.equal(fieldInfo("tags", fields.find((field) => field.path === "tags")).badge, "LIST");
});
