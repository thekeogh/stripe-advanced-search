export type StripeRecord = Record<string, unknown>;
export type Join = "all" | "any" | "none";
export type Operator = "is" | "is_not" | "one_of" | "not_one_of" | "contains" | "not_contains" | "starts" | "ends" | "on_day" | "gt" | "gte" | "lt" | "lte" | "between" | "exists" | "empty";
export type Rule = { id: string; kind: "rule"; field: string; operator: Operator; value: string; value2: string };
export type Group = { id: string; kind: "group"; join: Join; scope: string; children: FilterNode[] };
export type FilterNode = Rule | Group;
export type Field = { path: string; sample: unknown; type: "text" | "number" | "date" | "boolean" | "object" | "array" };

export function id() { return Math.random().toString(36).slice(2, 11); }
export function newRule(field = ""): Rule { return { id: id(), kind: "rule", field, operator: "is", value: "", value2: "" }; }
export function newGroup(scope = ""): Group { return { id: id(), kind: "group", join: "all", scope, children: [] }; }

export function valuesAt(value: unknown, path: string): unknown[] {
  if (!path) return [value];
  const parts = path.split(".").filter(Boolean);
  const walk = (current: unknown, index: number): unknown[] => {
    if (index === parts.length) return Array.isArray(current) ? current.flatMap((item) => walk(item, index)) : [current];
    if (Array.isArray(current)) return current.flatMap((item) => walk(item, index));
    if (!current || typeof current !== "object") return [];
    return walk((current as StripeRecord)[parts[index]], index + 1);
  };
  return walk(value, 0).filter((item) => item !== undefined);
}

function scalar(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return "id" in value ? String(value.id) : JSON.stringify(value);
  return String(value);
}

function comparable(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value;
  const str = String(value);
  if (/^-?\d+(\.\d+)?$/.test(str)) return Number(str);
  if (/date|period|created|updated|at$|arrival|due|start|end/i.test(field)) {
    const parsed = Date.parse(str);
    return Number.isNaN(parsed) ? null : parsed / 1000;
  }
  return null;
}

function matchesValue(actual: unknown, rule: Rule): boolean {
  const left = scalar(actual).toLowerCase();
  const right = rule.value.toLowerCase();
  if (rule.operator === "is") return left === right;
  if (rule.operator === "one_of") return rule.value.split(",").map((part) => part.trim().toLowerCase()).includes(left);
  if (rule.operator === "contains") return left.includes(right);
  if (rule.operator === "starts") return left.startsWith(right);
  if (rule.operator === "ends") return left.endsWith(right);
  if (rule.operator === "on_day") {
    const timestamp = comparable(actual, rule.field);
    if (timestamp === null) return false;
    const date = new Date(timestamp * 1000);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === rule.value.slice(0, 10);
  }
  const n = comparable(actual, rule.field);
  const a = comparable(rule.value, rule.field);
  const b = comparable(rule.value2, rule.field);
  if (n === null || a === null) return false;
  if (rule.operator === "gt") return n > a;
  if (rule.operator === "gte") return n >= a;
  if (rule.operator === "lt") return n < a;
  if (rule.operator === "lte") return n <= a;
  if (rule.operator === "between") return b !== null && n >= Math.min(a, b) && n <= Math.max(a, b);
  return false;
}

export function matchesRule(record: unknown, rule: Rule): boolean {
  if (!rule.field) return true;
  const values = valuesAt(record, rule.field);
  if (rule.operator === "exists") return values.some((value) => value !== null && value !== "");
  if (rule.operator === "empty") return values.length === 0 || values.every((value) => value === null || value === "");
  if (rule.operator === "is_not") return values.every((value) => scalar(value).toLowerCase() !== rule.value.toLowerCase());
  if (rule.operator === "not_one_of") return values.every((value) => !rule.value.split(",").map((part) => part.trim().toLowerCase()).includes(scalar(value).toLowerCase()));
  if (rule.operator === "not_contains") return values.every((value) => !scalar(value).toLowerCase().includes(rule.value.toLowerCase()));
  if (!rule.value) return true;
  return values.some((value) => matchesValue(value, rule));
}

export function matchesGroup(record: unknown, group: Group): boolean {
  const evaluate = (context: unknown): boolean => {
    const results = group.children.map((child) => child.kind === "rule" ? matchesRule(context, child) : matchesGroup(context, child));
    if (!results.length) return true;
    if (group.join === "all") return results.every(Boolean);
    if (group.join === "any") return results.some(Boolean);
    return results.every((result) => !result);
  };
  if (!group.scope) return evaluate(record);
  const items = valuesAt(record, group.scope);
  if (group.join === "none") {
    if (!group.children.length) return true;
    return !items.some((item) => group.children.every((child) => child.kind === "rule" ? matchesRule(item, child) : matchesGroup(item, child)));
  }
  return items.some(evaluate);
}

export function discoverFields(records: unknown[], limit = 1500): Field[] {
  const found = new Map<string, Field>();
  const remember = (path: string, sample: unknown, type: Field["type"]) => {
    if (!path) return;
    const existing = found.get(path);
    if (!existing || (existing.sample === null && sample !== null)) found.set(path, { path, sample, type });
  };
  const visit = (value: unknown, path: string, depth: number) => {
    if (depth > 8 || found.size >= limit || value === null || value === undefined) return;
    if (Array.isArray(value)) {
      remember(path, value, "array");
      for (const item of value.slice(0, 5)) visit(item, path, depth + 1);
      return;
    }
    if (typeof value === "object") {
      remember(path, value, "object");
      for (const [key, item] of Object.entries(value as StripeRecord)) {
        if (["object", "url", "has_more", "total_count"].includes(key) && path.endsWith(".items")) continue;
        const next = path ? `${path}.${key}` : key;
        if (item && typeof item === "object" && !(item instanceof Date)) visit(item, next, depth + 1);
        else {
          const type = typeof item === "number" ? (/created|updated|date|period|_at$|_end$|_start$|arrival/i.test(key) ? "date" : "number") : typeof item === "boolean" ? "boolean" : "text";
          remember(next, item, type);
        }
      }
      return;
    }
    remember(path, value, typeof value === "number" ? "number" : "text");
  };
  for (const record of records.slice(0, 20)) visit(record, "", 0);
  return [...found.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export function discoverScopes(records: unknown[]): string[] {
  const scopes = new Set<string>();
  const visit = (value: unknown, path: string, depth: number) => {
    if (depth > 6 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      if (path && value.some((item) => item && typeof item === "object")) scopes.add(path);
      for (const item of value.slice(0, 3)) visit(item, path, depth + 1);
      return;
    }
    for (const [key, item] of Object.entries(value as StripeRecord)) visit(item, path ? `${path}.${key}` : key, depth + 1);
  };
  for (const record of records.slice(0, 5)) visit(record, "", 0);
  return [...scopes].sort();
}

export function pretty(path: string): string {
  return path.replaceAll("_", " ").replaceAll(".", "  ›  ");
}
