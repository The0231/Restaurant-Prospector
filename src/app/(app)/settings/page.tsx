import { PageHeader } from "@/components/PageHeader";
import { DisplayPreferences } from "./DisplayPreferences";
import { MigrateLocalData } from "@/components/MigrateLocalData";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">{title}</h2>
      {children}
    </div>
  );
}

function StatusBadge({ connected }: { connected: boolean }) {
  return connected ? (
    <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Connected</span>
  ) : (
    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Not connected</span>
  );
}

export default function SettingsPage() {
  // Server component: env vars are read on the server and only the resulting
  // booleans are sent to the browser — the secret values never leave the server.
  const hasGooglePlaces = Boolean(process.env.GOOGLE_PLACES_API_KEY);
  const hasSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Integrations, scoring rules and compliance — connect real services here later."
      />

      <div className="mb-4">
        <MigrateLocalData />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Data sources">
          <ul className="space-y-2 text-sm text-slate-600">
            <li className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div>
                <span>Food Standards Agency API</span>
                <p className="text-xs text-slate-400">Bundled — venue data refreshed via fetch-fsa.mjs script</p>
              </div>
              <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Bundled</span>
            </li>
            <li className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div>
                <span>Google Places API</span>
                <p className="text-xs text-slate-400">Enriches phone, website &amp; business status on high-scoring leads</p>
              </div>
              <StatusBadge connected={hasGooglePlaces} />
            </li>
            <li className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div>
                <span>Supabase (shared team data)</span>
                <p className="text-xs text-slate-400">Syncs contact logs and overrides across the team</p>
              </div>
              <StatusBadge connected={hasSupabase} />
            </li>
            <li className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div>
                <span>Anthropic (AI assistant)</span>
                <p className="text-xs text-slate-400">Powers the in-app sales assistant and email drafts</p>
              </div>
              <StatusBadge connected={hasAnthropic} />
            </li>
            <li className="flex items-center justify-between">
              <span>Companies House</span>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Not connected</span>
            </li>
          </ul>
        </Section>

        <Section title="Email provider">
          <p className="text-sm text-slate-600">
            Connect SendGrid, Mailgun or the Gmail API to send approved outreach.
          </p>
          <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 p-3">
            <span className="text-sm text-slate-600">Sending mode</span>
            <select className="rounded border border-slate-300 px-2 py-1 text-sm">
              <option>Level 1 — Draft only</option>
              <option>Level 2 — Approved batch sending</option>
              <option>Level 3 — Fully automatic (high-confidence only)</option>
            </select>
          </div>
        </Section>

        <Section title="Lead scoring weights">
          <ul className="space-y-1.5 text-sm text-slate-600">
            {[
              ["Cuisine fit", "0–25"],
              ["Menu fit", "0–25"],
              ["Business type fit", "0–15"],
              ["Location / delivery fit", "0–10"],
              ["Price point fit", "0–10"],
              ["New opening signal", "0–10"],
              ["Contact quality", "0–5"],
            ].map(([k, v]) => (
              <li key={k} className="flex justify-between">
                <span>{k}</span>
                <span className="text-slate-400">{v}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Compliance">
          <ul className="space-y-2 text-sm text-slate-600">
            <li>✓ Prefer generic business emails (info@, hello@, trade@)</li>
            <li>✓ Unsubscribe / opt-out link on every email</li>
            <li>✓ Suppression list — never re-email opted-out contacts</li>
            <li>✓ Store source &amp; date for each contact</li>
            <li>✓ Weekly volume limit per restaurant</li>
          </ul>
        </Section>

        <Section title="Users &amp; permissions">
          <p className="text-sm text-slate-600">
            Roles: Admin · Sales · Viewer. User management connects to your auth provider
            once the private login is wired up.
          </p>
        </Section>

        <Section title="Display preferences">
          <DisplayPreferences />
        </Section>
      </div>
    </div>
  );
}
