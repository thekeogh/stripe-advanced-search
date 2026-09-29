import Explorer from "@/components/Explorer";

export const dynamic = "force-dynamic";

export default function Home() {
  const configured = Boolean(process.env.STRIPE_RESTRICTED_KEY && process.env.STRIPE_RESTRICTED_KEY !== "rk_test_replace_me");
  if (!configured) {
    return <main className="setup-page"><div className="setup-card"><div className="brand-mark">✳</div><div className="eyebrow">SETUP REQUIRED</div><h1>Stripe key missing</h1><p>This explorer needs a read-only Stripe restricted API key before it can load data.</p><div className="setup-steps"><div><span>01</span><p>Create a <strong>.env.local</strong> file in the project root.</p></div><div><span>02</span><p>Add <code>STRIPE_RESTRICTED_KEY=rk_...</code></p></div><div><span>03</span><p>Restart <code>pnpm run dev</code>.</p></div></div><div className="setup-note">The key stays on the server. Give it read permissions for the Stripe resources you want to explore.</div></div></main>;
  }
  return <Explorer />;
}
