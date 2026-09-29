"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Braces, ChevronDown, CircleHelp, Columns3, Download, Filter, Layers3, LoaderCircle, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { resources, resourceById } from "@/lib/resources";
import { discoverFields, discoverScopes, Group, matchesGroup, newGroup, newRule, pretty, Rule, StripeRecord, valuesAt } from "@/lib/filter";
import { validateFieldValue } from "@/lib/field-info";
import { RuleEditor } from "@/components/FilterControls";

type Page = { data: StripeRecord[]; has_more: boolean; next_cursor: string | null; expanded: boolean };
const sections = [...new Set(resources.map((item) => item.section))];
const defaults: Record<string, string[]> = {
  customers: ["id", "name", "email", "phone", "created", "metadata", "discount", "discount.source.coupon", "subscriptions.data.discounts", "subscriptions.data.items.data.discounts"],
  subscriptions: ["id", "status", "customer", "customer.email", "items.data.price.id", "items.data.price.product", "items.data.quantity", "discounts", "discounts.source.coupon", "discounts.coupon.id", "items.data.discounts", "items.data.discounts.source.coupon", "created", "cancel_at_period_end"],
  payment_intents: ["id", "status", "amount", "currency", "customer", "customer.email", "payment_method", "created", "metadata"],
  charges: ["id", "status", "paid", "amount", "currency", "customer", "customer.email", "payment_method_details.card.brand", "payment_method_details.card.last4", "created"],
  invoices: ["id", "number", "status", "customer", "customer.email", "subscription", "subtotal", "total", "currency", "due_date", "created"],
};

function updateNode(group: Group, nodeId: string, updater: (node: Group | Rule) => Group | Rule): Group {
  if (group.id === nodeId) return updater(group) as Group;
  return { ...group, children: group.children.map((node) => node.id === nodeId ? updater(node) : node.kind === "group" ? updateNode(node, nodeId, updater) : node) };
}
function removeNode(group: Group, nodeId: string): Group {
  return { ...group, children: group.children.filter((node) => node.id !== nodeId).map((node) => node.kind === "group" ? removeNode(node, nodeId) : node) };
}
function moveNode(group: Group, nodeId: string, delta: number): Group {
  const index = group.children.findIndex((node) => node.id === nodeId);
  if (index !== -1) {
    const next = [...group.children];
    const target = index + delta;
    if (target < 0 || target >= next.length) return group;
    [next[index], next[target]] = [next[target], next[index]];
    return { ...group, children: next };
  }
  return { ...group, children: group.children.map((node) => node.kind === "group" ? moveNode(node, nodeId, delta) : node) };
}
function formatValue(value: unknown, path: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" && /amount|total|subtotal|fee|net|balance|unit_amount/.test(path)) return String(value);
  if (typeof value === "number" && /created|updated|date|period|_at$|arrival/.test(path)) return new Date(value * 1000).toLocaleDateString();
  if (typeof value === "object") return Array.isArray(value) ? `${value.length} items` : "id" in value ? String(value.id) : "Object";
  return String(value);
}
function displayValue(record: StripeRecord, path: string): string {
  const values = valuesAt(record, path);
  return values.length ? values.slice(0, 3).map((value) => formatValue(value, path)).join(", ") + (values.length > 3 ? ` +${values.length - 3}` : "") : "—";
}
function csvCell(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function hasPartialNestedList(value: unknown, depth = 0): boolean {
  if (!value || typeof value !== "object" || depth > 7) return false;
  if (Array.isArray(value)) return value.some((item) => hasPartialNestedList(item, depth + 1));
  const record = value as StripeRecord;
  if (record.object === "list" && record.has_more === true) return true;
  return Object.values(record).some((item) => hasPartialNestedList(item, depth + 1));
}
function filterIssue(group: Group, root = true): string | null {
  if (!root && !group.children.length) return "Add a condition to every group, or remove the empty group.";
  for (const node of group.children) {
    if (node.kind === "group") { const issue = filterIssue(node, false); if (issue) return issue; continue; }
    if (!node.field) return "Choose a field for every condition.";
    if (!["exists", "empty"].includes(node.operator)) {
      const issue = validateFieldValue(node.field, node.value);
      if (issue) return issue;
      if (node.operator === "between" && !node.value2.trim()) return `Enter the second value for ${node.field}.`;
    }
  }
  return null;
}

export default function Explorer() {
  const [resourceId, setResourceId] = useState("customers");
  const [resourceSearch, setResourceSearch] = useState("");
  const [sample, setSample] = useState<StripeRecord[]>([]);
  const [sampleError, setSampleError] = useState("");
  const [loadingSample, setLoadingSample] = useState(true);
  const [filter, setFilter] = useState<Group>(newGroup());
  const [matches, setMatches] = useState<StripeRecord[]>([]);
  const [scanned, setScanned] = useState(0);
  const [running, setRunning] = useState(false);
  const [complete, setComplete] = useState(false);
  const [scanError, setScanError] = useState("");
  const [selected, setSelected] = useState<StripeRecord | null>(null);
  const [showCount, setShowCount] = useState(100);
  const [columns, setColumns] = useState<string[]>(resourceById.customers.columns);
  const [columnMenu, setColumnMenu] = useState(false);
  const [fieldSearch, setFieldSearch] = useState("");
  const [saved, setSaved] = useState<{ name: string; resourceId: string; filter: Group }[]>([]);
  const [saveName, setSaveName] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [partialNested, setPartialNested] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const resource = resourceById[resourceId];
  const issue = filterIssue(filter);
  const fields = useMemo(() => [...new Set([...(defaults[resourceId] ?? ["id", "created", "metadata"]), ...resource.columns, ...discoverFields(sample).map((field) => field.path)])].sort(), [resourceId, resource.columns, sample]);
  const scopes = useMemo(() => discoverScopes(sample), [sample]);

  useEffect(() => {
    const timer = setTimeout(() => {
      try { setSaved(JSON.parse(localStorage.getItem("prism.savedFilters") ?? "[]")); } catch { /* ignore damaged local data */ }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const fetchPage = useCallback(async (resource: string, cursor: string | null, signal: AbortSignal): Promise<Page> => {
    const params = new URLSearchParams({ resource });
    if (cursor) params.set("cursor", cursor);
    const response = await fetch(`/api/records?${params}`, { signal, cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Could not load Stripe data.");
    return payload as Page;
  }, []);

  useEffect(() => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    fetchPage(resourceId, null, abort.signal).then((page) => setSample(page.data)).catch((error) => {
      if (error.name !== "AbortError") setSampleError(error.message);
    }).finally(() => { if (!abort.signal.aborted) setLoadingSample(false); });
    return () => abort.abort();
  }, [resourceId, fetchPage]);

  function chooseResource(next: string) {
    if (next === resourceId) return;
    setResourceId(next); setFilter(newGroup()); setSelected(null); setColumnMenu(false);
    setSample([]); setSampleError(""); setLoadingSample(true);
    setMatches([]); setScanned(0); setComplete(false); setScanError(""); setPartialNested(false);
    setColumns(resourceById[next].columns);
  }

  async function runSearch() {
    if (issue) return;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setRunning(true); setScanError(""); setMatches([]); setScanned(0); setComplete(false); setShowCount(100); setPartialNested(false);
    let cursor: string | null = null;
    let count = 0;
    const found: StripeRecord[] = [];
    const seen = new Set<string>();
    try {
      do {
        const page: Page = await fetchPage(resourceId, cursor, abort.signal);
        if (page.data.some(hasPartialNestedList)) setPartialNested(true);
        count += page.data.length;
        for (const record of page.data) {
          if (matchesGroup(record, filter) && !seen.has(String(record.id))) { found.push(record); seen.add(String(record.id)); }
        }
        setScanned(count); setMatches([...found]);
        if (!page.has_more || !page.next_cursor || page.next_cursor === cursor) break;
        cursor = page.next_cursor;
      } while (!abort.signal.aborted);
      if (!abort.signal.aborted) setComplete(true);
    } catch (error) {
      if ((error as Error).name !== "AbortError") setScanError((error as Error).message);
    } finally { setRunning(false); }
  }

  function saveFilter() {
    const name = saveName.trim();
    if (!name) return;
    const next = [...saved.filter((item) => item.name !== name), { name, resourceId, filter }];
    setSaved(next); localStorage.setItem("prism.savedFilters", JSON.stringify(next));
    setSaveName(""); setSaveOpen(false);
  }
  function removeSaved(name: string) {
    const next = saved.filter((item) => item.name !== name);
    setSaved(next); localStorage.setItem("prism.savedFilters", JSON.stringify(next));
  }
  function exportCsv() {
    const csv = [columns.map(csvCell).join(","), ...matches.map((item) => columns.map((column) => csvCell(displayValue(item, column))).join(","))].join("\n");
    const href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = href; link.download = `stripe-${resourceId}-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(href);
  }

  const displayed = matches.slice(0, showCount);
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-icon"><Layers3 size={19} strokeWidth={2.5} /></div><div><strong>PRISM</strong><small>STRIPE EXPLORER</small></div></div>
      <div className="sidebar-label">WORKSPACE</div>
      <div className="nav-item active"><SlidersHorizontal size={16} /> Explorer <span className="nav-dot" /></div>
      <div className="sidebar-label data-label">DATA SOURCES</div>
      <div className="sidebar-search"><Search size={15} /><input aria-label="Search data sources" placeholder="Find a data source..." value={resourceSearch} onChange={(event) => setResourceSearch(event.target.value)} /></div>
      <div className="resource-list">{sections.map((section) => {
        const group = resources.filter((item) => item.section === section && `${item.name} ${item.description}`.toLowerCase().includes(resourceSearch.toLowerCase()));
        return group.length ? <div key={section} className="resource-section"><div className="section-heading">{section}</div>{group.map((item) => <button className={`resource-item ${resourceId === item.id ? "selected" : ""}`} key={item.id} onClick={() => chooseResource(item.id)}><span>{item.name}</span>{resourceId === item.id && <ArrowRight size={14} />}</button>)}</div> : null;
      })}</div>
      <div className="sidebar-footer"><span className="status-dot" /> Read-only connection <div>Stripe API · server-side key</div></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> Explorer <span>/</span> <strong>{resource.name}</strong></div><select className="mobile-resource" aria-label="Choose data source" value={resourceId} onChange={(event) => chooseResource(event.target.value)}>{resources.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><div className="topbar-right"><span className="readonly-badge"><span /> READ ONLY</span><div className="avatar">S</div></div></header>
      <div className="content">
        <div className="page-heading"><div><div className="eyebrow">DATA EXPLORER <span> / {resource.section.toUpperCase()}</span></div><h1>{resource.name}<span className="heading-period">.</span></h1><p>{resource.description}. Explore any field Stripe returns.</p></div><button className="icon-button help-button" title="See how filtering works" onClick={() => alert("Choose fields and conditions, then run the search. Fields from nested records and metadata appear after Stripe data loads. Add a related-record group when multiple conditions must match the same nested item. Use a custom field path for any other returned attribute.")}><CircleHelp size={19} /></button></div>

        <section className="builder-card"><div className="card-title"><div className="card-icon"><Filter size={18} /></div><div><h2>Build your search</h2><p>Combine conditions across fields, metadata and related records.</p></div><div className="builder-actions"><button className="subtle-button" onClick={() => setFilter(newGroup())}>Clear all</button><button className="subtle-button" onClick={() => setSaveOpen(true)}>Save view</button></div></div>
          <div className="builder-body"><div className="query-intro">Show <strong>{resource.name.toLowerCase()}</strong> where</div>
            <GroupEditor group={filter} root rootName={resource.singular} fields={fields} sample={sample} scopes={scopes} onChange={setFilter} onRemove={() => {}} onMove={() => {}} />
            {issue && <div className="builder-error">{issue}</div>}
            <div className="builder-footer"><div className="builder-hint"><Braces size={15} /> Field names show the expected value; custom JSON paths still work.</div><button className="run-button" disabled={running || loadingSample || Boolean(issue)} onClick={runSearch}>{running ? <><LoaderCircle size={16} className="spin" /> Searching...</> : <><Search size={16} /> Run search <ArrowRight size={16} /></>}</button></div>
          </div>
        </section>

        {saveOpen && <div className="modal-backdrop" onClick={() => setSaveOpen(false)}><div className="save-modal" onClick={(event) => event.stopPropagation()}><button className="icon-button modal-close" onClick={() => setSaveOpen(false)}><X size={18} /></button><div className="eyebrow">SAVE VIEW</div><h2>Name this search</h2><p>Saved filter definitions stay in this browser. Stripe data is not saved.</p><input autoFocus placeholder="e.g. Active annual customers" value={saveName} onChange={(event) => setSaveName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && saveFilter()} /><button className="run-button" onClick={saveFilter}>Save view</button></div></div>}

        {saved.length > 0 && <div className="saved-strip"><span>Saved views</span>{saved.map((item) => <div className="saved-pill" key={item.name}><button onClick={() => { chooseResource(item.resourceId); setFilter(item.filter); }}>{item.name}</button><button title="Remove saved view" onClick={() => removeSaved(item.name)}><X size={12} /></button></div>)}</div>}

        <section className="results-card"><div className="results-heading"><div><div className="results-title">Results <span>{complete ? matches.length.toLocaleString() : running ? `${matches.length.toLocaleString()}+` : "—"}</span></div><p>{running ? `Scanned ${scanned.toLocaleString()} ${resource.name.toLowerCase()} so far…` : complete ? `Searched ${scanned.toLocaleString()} ${resource.name.toLowerCase()} across all pages.` : "Run a search to see matching records."}</p></div><div className="result-actions">{running && <button className="outline-button" onClick={() => controller.current?.abort()}>Stop scan</button>}<div className="column-wrapper"><button className="outline-button" onClick={() => setColumnMenu(!columnMenu)}><Columns3 size={15} /> Columns <ChevronDown size={14} /></button>{columnMenu && <div className="column-menu"><div className="column-menu-title">Visible columns</div><input placeholder="Find a field..." value={fieldSearch} onChange={(event) => setFieldSearch(event.target.value)} /> <div className="column-options">{fields.filter((field) => field.toLowerCase().includes(fieldSearch.toLowerCase())).slice(0, 100).map((field) => <label key={field}><input type="checkbox" checked={columns.includes(field)} onChange={() => setColumns(columns.includes(field) ? columns.filter((column) => column !== field) : [...columns, field])} /> {pretty(field)}</label>)}</div></div>}</div><button className="outline-button" disabled={!complete || !matches.length} onClick={exportCsv}><Download size={15} /> Export CSV</button></div></div>
          {sampleError && <div className="error-banner">{sampleError}</div>}{scanError && <div className="error-banner">{scanError}</div>}
          {partialNested && <div className="warning-banner">Some nested lists have more pages in Stripe. Filters on those nested items may miss records beyond the first nested page.</div>}
          {!complete && !running && !matches.length ? <div className="empty-state"><div className="empty-illustration"><Search size={30} /></div><h3>Answers start with a question.</h3><p>Add a condition or run the search to browse all {resource.name.toLowerCase()}.</p></div> : matches.length ? <><div className="table-scroll"><table><thead><tr>{columns.map((column) => <th key={column}>{pretty(column)}</th>)}<th /></tr></thead><tbody>{displayed.map((record) => <tr key={String(record.id)} onClick={() => setSelected(record)}>{columns.map((column) => <td key={column} title={displayValue(record, column)} className={column === "id" ? "mono-cell" : ""}>{displayValue(record, column)}</td>)}<td className="row-arrow"><ArrowRight size={15} /></td></tr>)}</tbody></table></div>{matches.length > showCount && <button className="more-button" onClick={() => setShowCount(showCount + 100)}>Show 100 more <ArrowDown size={15} /></button>}</> : <div className="empty-state"><div className="empty-illustration"><Search size={30} /></div><h3>{running ? "Scanning Stripe…" : "No matches found."}</h3><p>{running ? "Results will appear as matching pages arrive." : "Try broadening your conditions or checking the field values."}</p></div>}
        </section>
        <div className="page-footer">Data is read directly from Stripe. No Stripe records are created, updated or deleted.</div>
      </div>
    </main>
    {selected && <div className="drawer-backdrop" onClick={() => setSelected(null)}><aside className="detail-drawer" onClick={(event) => event.stopPropagation()}><div className="drawer-head"><div><div className="eyebrow">STRIPE RECORD</div><h2>{String(selected.id)}</h2></div><button className="icon-button" onClick={() => setSelected(null)}><X size={19} /></button></div><p className="drawer-copy">Full object returned by the Stripe API. Nested values shown below may contain additional searchable fields.</p><div className="json-header"><Braces size={16} /> JSON RESPONSE</div><pre>{JSON.stringify(selected, null, 2)}</pre></aside></div>}
  </div>;
}

function GroupEditor({ group, root, rootName, fields, sample, scopes, onChange, onRemove, onMove }: { group: Group; root?: boolean; rootName: string; fields: string[]; sample: unknown[]; scopes: string[]; onChange: (group: Group) => void; onRemove: () => void; onMove: (delta: number) => void }) {
  const localRootName = group.scope ? group.scope.split(".").at(-1) === "discounts" ? "Discount" : group.scope.endsWith("items.data") ? "Subscription item" : group.scope.split(".").at(-1) ?? rootName : rootName;
  const scopedSamples = useMemo(() => group.scope ? sample.flatMap((item) => valuesAt(item, group.scope)).slice(0, 20) : sample, [group.scope, sample]);
  const localFields = useMemo(() => group.scope ? discoverFields(scopedSamples).map((field) => field.path) : fields, [group.scope, scopedSamples, fields]);
  const localScopes = useMemo(() => group.scope ? discoverScopes(scopedSamples) : scopes, [group.scope, scopedSamples, scopes]);
  const mutate = (nodeId: string, updater: (node: Group | Rule) => Group | Rule) => onChange(updateNode(group, nodeId, updater));
  const addRule = () => onChange({ ...group, children: [...group.children, newRule()] });
  const addGroup = (scope = "") => onChange({ ...group, children: [...group.children, newGroup(scope)] });
  return <div className={`filter-group ${root ? "root-group" : "nested-group"}`}>
    <div className="group-toolbar"><div className="group-title">{group.scope ? "Related records" : root ? "Match" : "Group matches"} <select aria-label="Group matching mode" value={group.join} onChange={(event) => onChange({ ...group, join: event.target.value as Group["join"] })}>{group.scope ? <><option value="all">one matches all</option><option value="any">one matches any</option><option value="none">none match all</option></> : <><option value="all">all</option><option value="any">any</option><option value="none">none</option></>}</select> {group.scope ? "conditions on" : root ? "of these conditions" : "conditions"}</div>{group.scope && <span className="scope-badge">{pretty(group.scope)}</span>}{!root && <div className="group-tools"><button title="Move group up" onClick={() => onMove(-1)}><ArrowUp size={14} /></button><button title="Move group down" onClick={() => onMove(1)}><ArrowDown size={14} /></button><button title="Remove group" onClick={onRemove}><X size={15} /></button></div>}</div>
    <div className="group-content">{group.children.map((node) => node.kind === "rule" ? <RuleEditor key={node.id} rule={node} fields={localFields} sample={scopedSamples} rootName={localRootName} onChange={(next) => mutate(node.id, () => next)} onMove={(delta) => onChange(moveNode(group, node.id, delta))} onRemove={() => onChange(removeNode(group, node.id))} /> : <GroupEditor key={node.id} group={node} rootName={localRootName} fields={localFields} sample={scopedSamples} scopes={localScopes} onChange={(next) => mutate(node.id, () => next)} onRemove={() => onChange(removeNode(group, node.id))} onMove={(delta) => onChange(moveNode(group, node.id, delta))} />)}
      {!group.children.length && <div className="empty-group">No conditions yet. Add one below, or run a search to browse everything.</div>}
      <div className="add-actions"><button onClick={addRule}><Plus size={15} /> Add condition</button><button onClick={() => addGroup()}><Plus size={15} /> Add group</button><div className="related-menu"><select aria-label="Add related record group" value="" onChange={(event) => event.target.value && addGroup(event.target.value)}><option value="">+ Related record group...</option>{localScopes.map((scope) => <option value={scope} key={scope}>{pretty(scope)}</option>)}</select></div></div>
    </div>
  </div>;
}
