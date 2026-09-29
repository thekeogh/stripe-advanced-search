"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronDown, LoaderCircle, Search, Trash2 } from "lucide-react";
import { discoverFields, Operator, Rule } from "@/lib/filter";
import { fieldInfo } from "@/lib/field-info";

const operatorLabels: Record<Operator, string> = {
  is: "is", is_not: "is not", one_of: "is one of", not_one_of: "is not one of", contains: "contains", not_contains: "does not contain", starts: "starts with", ends: "ends with",
  on_day: "on day (UTC)", gt: "greater than / after", gte: "at least / on or after", lt: "less than / before", lte: "at most / on or before", between: "between", exists: "is set", empty: "is empty",
};

function FieldPicker({ value, fields, sample, rootName, onChange }: { value: string; fields: string[]; sample: unknown[]; rootName: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const fieldSamples = useMemo(() => new Map(discoverFields(sample).map((field) => [field.path, field])), [sample]);
  const options = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const matching = fields.map((path) => ({ path, info: fieldInfo(path, fieldSamples.get(path), rootName) })).filter(({ path, info }) => `${path} ${info.label} ${info.badge}`.toLowerCase().includes(normalized));
    if (normalized.includes("product")) matching.sort((a, b) => {
      const rank = (path: string) => path === "items.data.price.product" ? 0 : path.endsWith(".price.product") ? 1 : path.endsWith(".plan.product") ? 2 : path === "plan.product" ? 3 : path.includes("metadata") ? 10 : 5;
      return rank(a.path) - rank(b.path) || a.path.localeCompare(b.path);
    });
    return matching.slice(0, 80);
  }, [fields, fieldSamples, rootName, query]);
  const selected = value ? fieldInfo(value, fieldSamples.get(value), rootName) : null;
  const choose = (path: string) => { onChange(path); setOpen(false); setQuery(""); };
  return <div className="field-input" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button type="button" className={`field-trigger ${open ? "focused" : ""}`} onClick={() => { setOpen(!open); setQuery(""); }} aria-label="Choose Stripe field" aria-expanded={open}>
      <span className="field-trigger-text">{selected ? <><strong>{selected.label}</strong><small>{value}</small></> : <span className="field-placeholder">Choose a field…</span>}</span>
      {selected && <span className="field-badge">{selected.badge}</span>}<ChevronDown size={15} />
    </button>
    {open && <div className="field-popover"><div className="field-search"><Search size={15} /><input autoFocus aria-label="Search fields" placeholder="Search field name or path…" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); if (event.key === "Enter") choose(options[0]?.path ?? query.trim()); }} /></div><div className="field-options">{options.map(({ path, info }) => <button type="button" key={path} onClick={() => choose(path)}><span><strong>{info.label}</strong><small>{path}</small>{["discount_id", "coupon_id", "promotion_code_id", "object", "list"].includes(info.kind) && <small className="field-option-hint">{info.hint}</small>}</span><em>{info.badge}</em>{value === path && <Check size={14} />}</button>)}{query.trim() && !fields.includes(query.trim()) && <button type="button" className="custom-path" onClick={() => choose(query.trim())}><span><strong>Use custom field path</strong><small>{query.trim()}</small></span><em>CUSTOM</em></button>}{!options.length && !query.trim() && <div className="field-empty">No fields found in the current sample. Type a path to use it.</div>}</div><div className="field-popover-footer">Labels distinguish object IDs, nested lists, and values. Select a field to see its full description.</div></div>}
  </div>;
}

type ProductOption = { id: string; name: string; active: boolean };
function ProductValueInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [query, setQuery] = useState(value);
  const [options, setOptions] = useState<ProductOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const selectedRef = useRef(value);
  const selectedDisplay = Boolean(value && (query === value || query.endsWith(`(${value})`)));
  useEffect(() => { if (value && value !== selectedRef.current) { selectedRef.current = value; setQuery(value); } }, [value]);
  useEffect(() => {
    if (!open || selectedDisplay || query.trim().length < 3 || query.trim().startsWith("prod_")) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true); setError("");
      fetch(`/api/options?resource=products&q=${encodeURIComponent(query.trim())}`, { signal: abort.signal })
        .then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? "Product search failed."); return payload.data as ProductOption[]; })
        .then(setOptions)
        .catch((reason) => { if (reason.name !== "AbortError") setError(reason.message); })
        .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [query, open, selectedDisplay]);
  function edit(next: string) { setQuery(next); setOpen(true); setOptions([]); onChange(next.startsWith("prod_") ? next : ""); }
  function select(option: ProductOption) { selectedRef.current = option.id; setQuery(`${option.name} (${option.id})`); onChange(option.id); setOpen(false); }
  return <div className="product-input" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}><input aria-label="Product name or Stripe ID" placeholder="Search product name or paste prod_…" value={query} onFocus={() => setOpen(true)} onChange={(event) => edit(event.target.value)} />{open && !selectedDisplay && query.trim().length > 0 && !query.trim().startsWith("prod_") && <div className="product-options">{query.trim().length < 3 ? <div className="option-message">Type at least 3 characters to search by name, or paste a prod_… ID.</div> : <>{loading && <div className="option-message"><LoaderCircle size={14} className="spin" /> Searching products…</div>}{error && <div className="option-message error-text">{error}</div>}{!loading && !error && options.map((option) => <button type="button" key={option.id} onClick={() => select(option)}><strong>{option.name}</strong><small>{option.id}{option.active ? "" : " · inactive"}</small></button>)}{!loading && !error && !options.length && <div className="option-message">No products found. Try another name or paste a prod_… ID.</div>}</>}</div>}</div>;
}

export function RuleEditor({ rule, fields, sample, rootName, onChange, onMove, onRemove }: { rule: Rule; fields: string[]; sample: unknown[]; rootName: string; onChange: (rule: Rule) => void; onMove: (delta: number) => void; onRemove: () => void }) {
  const sampleField = useMemo(() => discoverFields(sample).find((field) => field.path === rule.field), [sample, rule.field]);
  const info = rule.field ? fieldInfo(rule.field, sampleField, rootName) : null;
  const hasValue = !["exists", "empty"].includes(rule.operator);
  const operators = info?.kind === "object" ? (["exists", "empty"] as Operator[]) : (Object.keys(operatorLabels) as Operator[]);
  return <div className="rule-block"><div className="rule-row"><div className="rule-line" />
    <FieldPicker value={rule.field} fields={fields} sample={sample} rootName={rootName} onChange={(field) => { const next = fieldInfo(field, discoverFields(sample).find((item) => item.path === field), rootName); onChange({ ...rule, field, operator: next.kind === "object" || next.kind === "list" ? "exists" : "is", value: "", value2: "" }); }} />
    <select aria-label="Filter operator" value={rule.operator} onChange={(event) => onChange({ ...rule, operator: event.target.value as Operator })}>{operators.map((operator) => <option key={operator} value={operator}>{operatorLabels[operator]}</option>)}</select>
    {hasValue && info?.kind === "product_id" && ["is", "is_not"].includes(rule.operator) ? <ProductValueInput value={rule.value} onChange={(value) => onChange({ ...rule, value })} /> : hasValue && info?.kind === "boolean" && ["is", "is_not"].includes(rule.operator) ? <select className="value-input" aria-label="Filter value" value={rule.value} onChange={(event) => onChange({ ...rule, value: event.target.value })}><option value="">Choose…</option><option value="true">True</option><option value="false">False</option></select> : hasValue && <input className="value-input" type={rule.operator === "on_day" ? "date" : "text"} aria-label="Filter value" placeholder={info?.placeholder ?? "Choose a field first"} value={rule.value} onChange={(event) => onChange({ ...rule, value: event.target.value })} />}
    {rule.operator === "between" && <><span className="and-label">and</span><input className="value-input second-value" aria-label="Second filter value" placeholder={info?.placeholder ?? "Value"} value={rule.value2} onChange={(event) => onChange({ ...rule, value2: event.target.value })} /></>}
    <div className="rule-actions"><button title="Move condition up" onClick={() => onMove(-1)}><ArrowUp size={13} /></button><button title="Move condition down" onClick={() => onMove(1)}><ArrowDown size={13} /></button><button title="Remove condition" onClick={onRemove}><Trash2 size={14} /></button></div>
  </div><div className="rule-hint">{info ? <><span>{info.badge}</span> {info.hint}</> : "Choose a field to see what value it expects."}</div></div>;
}
