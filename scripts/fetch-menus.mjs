// Fetch menu content + contact details from restaurant websites.
//
// Run with:  node scripts/fetch-menus.mjs
//
// For each venue with a website that needs a menu OR contacts:
//   1. Fetch the main page (and /menu as fallback for thin content)
//   2. Also fetch /contact or /about for email/phone extraction
//   3. Strip HTML → plain text, ask Claude Haiku for menu summary + pasta relevance
//   4. Save email and phone found via regex if not already present
//   5. Write results back to public/uk-restaurants.json
//
// Saves progress every 50 venues so a crash doesn't lose work.

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const OUTPUT = "public/uk-restaurants.json";
const CONCURRENCY = 8;   // parallel website fetches
const FETCH_TIMEOUT = 8000; // ms per HTTP request
const SAVE_EVERY = 50;   // write JSON after every N venues processed
const MIN_CONTENT = 150; // chars of stripped text needed to bother calling Claude

// ── Env ───────────────────────────────────────────────────────────────────────

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnvLocal();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Contact extraction ────────────────────────────────────────────────────────

const EMAIL_SPAM_PREFIXES = ["noreply", "no-reply", "donotreply", "mailer-daemon", "bounce", "postmaster"];
const EMAIL_SPAM_DOMAINS  = ["example.com", "sentry.io", "schema.org", "w3.org", "cloudflare.com", "google.com", "facebook.com", "wix.com", "squarespace.com"];

function extractContacts(html) {
  // Emails
  const emailRe = /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,6}\b/g;
  const email = (html.match(emailRe) ?? []).find((e) => {
    const lo = e.toLowerCase();
    if (EMAIL_SPAM_PREFIXES.some((p) => lo.startsWith(p))) return false;
    if (EMAIL_SPAM_DOMAINS.some((d) => lo.endsWith(d) || lo.includes(`@${d}`))) return false;
    if (/\.(png|jpg|gif|svg|css|js|woff2?)$/i.test(lo)) return false;
    if (lo.length > 80) return false;
    return true;
  }) ?? null;

  // UK phone numbers: 01xxx, 02xxx, 03xxx, 07xxx, +44...
  const phoneRe = /(?:\+44[\s\-.]?|(?:^|[\s(])0)(?:\d[\s\-.]?){9,10}/gm;
  const rawPhones = html.match(phoneRe) ?? [];
  const phone = rawPhones
    .map((p) => p.replace(/[^\d+]/g, ""))
    .filter((p) => p.length >= 10 && p.length <= 13)
    .map((p) => (p.startsWith("44") ? `+${p}` : p.startsWith("0") ? p : null))
    .find(Boolean) ?? null;

  return { email, phone };
}

// ── HTML → plain text ─────────────────────────────────────────────────────────

function extractText(html) {
  // Drop entire script / style / nav / footer / header blocks
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ");
  // Replace block-level tags with newlines to preserve structure
  s = s.replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n");
  // Strip remaining tags
  s = s.replace(/<[^>]+>/g, " ");
  // Decode common entities
  s = s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, " ")
    .replace(/&[a-z]+;/g, " ");
  // Collapse whitespace
  s = s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return s;
}

// ── HTTP fetch with timeout ────────────────────────────────────────────────────

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-GB,en;q=0.9",
};

async function fetchRaw(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: HEADERS, redirect: "follow" });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("html")) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Returns { text, html } — html is the raw HTML of the best page found
async function getBestContent(website) {
  const base = website.replace(/\/$/, "");
  let html = await fetchRaw(base);
  let text = html ? extractText(html) : null;
  if (!text || text.length < MIN_CONTENT) {
    const menuHtml = await fetchRaw(`${base}/menu`);
    if (menuHtml) {
      const menuText = extractText(menuHtml);
      if (menuText.length > (text?.length ?? 0)) { html = menuHtml; text = menuText; }
    }
  }
  if (!text || text.length < MIN_CONTENT) return { text: null, html };
  return { text: text.slice(0, 3000), html };
}

// Fetch contact page HTML (tries /contact, /contact-us, /about)
async function fetchContactHtml(base) {
  for (const path of ["/contact", "/contact-us", "/about", "/about-us"]) {
    const h = await fetchRaw(base + path);
    if (h) return h;
  }
  return null;
}

// ── Claude analysis ───────────────────────────────────────────────────────────

async function analyseMenu(venue, content) {
  const prompt = `You are analysing a restaurant website for a fresh pasta supplier (La Tua Pasta).

Restaurant: "${venue.name}" — ${venue.cuisineType}, ${venue.borough}

Website content (truncated):
---
${content}
---

Return ONLY a JSON object with exactly these two fields:
{
  "menuSummary": "<1-2 sentences describing what the restaurant serves>",
  "pastaRelevance": "<1-2 sentences on whether fresh pasta appears on the menu, what pasta dishes if any, or that no pasta was found>"
}

Rules:
- menuSummary: concise factual description of the food style and key dishes
- pastaRelevance: be specific — name pasta dishes if present, otherwise say "No pasta dishes found on the menu"
- If the content is too sparse to determine the menu, say "Menu details not available on website" for menuSummary and "Unable to assess pasta relevance from available content" for pastaRelevance
- Do not invent dishes — only report what you can see in the content`;

  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    messages: [{ role: "user", content: prompt }],
  });

  const text = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (typeof parsed.menuSummary === "string" && typeof parsed.pastaRelevance === "string") {
      return { menuSummary: parsed.menuSummary, pastaRelevance: parsed.pastaRelevance };
    }
    return null;
  } catch {
    return null;
  }
}

// ── Concurrency helper ────────────────────────────────────────────────────────

async function inBatches(items, size, fn) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const raw = JSON.parse(readFileSync(OUTPUT, "utf8"));
const venues = raw.venues;

// Process venues that need a menu OR are missing contacts
const toProcess = venues.filter((v) => v.website && (!v.menuSummary || (!v.email && !v.phone)));
const needsMenuCount    = toProcess.filter((v) => !v.menuSummary).length;
const needsContactCount = toProcess.filter((v) => !v.email && !v.phone).length;
console.log(`Processing ${toProcess.length} venues with websites:`);
console.log(`  ${needsMenuCount} need menu extraction`);
console.log(`  ${needsContactCount} need contact extraction`);
console.log(`Estimated Claude cost: ~$${((needsMenuCount / 1000) * 0.8).toFixed(2)}`);

let done = 0;
let menusExtracted = 0;
let noContent = 0;
let emailsFound = 0;
let phonesFound = 0;
let sinceLastSave = 0;

await inBatches(toProcess, CONCURRENCY, async (venue) => {
  const needsMenu    = !venue.menuSummary;
  const needsContact = !venue.email && !venue.phone;
  const base = venue.website.replace(/\/$/, "");

  // Fetch main page (raw HTML + stripped text)
  let mainHtml = null;
  let text = null;
  try {
    const result = await getBestContent(venue.website);
    text = result.text;
    mainHtml = result.html;
  } catch { /* unreachable */ }

  // ── Contact extraction ────────────────────────────────────────────────────
  if (needsContact) {
    let contactHtml = mainHtml ?? "";
    // Also try dedicated contact/about pages
    try {
      const extra = await fetchContactHtml(base);
      if (extra) contactHtml += extra;
    } catch { /* ignore */ }

    if (contactHtml) {
      const { email, phone } = extractContacts(contactHtml);
      if (email && !venue.email) { venue.email = email; emailsFound++; }
      if (phone && !venue.phone) { venue.phone = phone; phonesFound++; }
    }
  }

  // ── Menu extraction ───────────────────────────────────────────────────────
  if (needsMenu) {
    if (!text) {
      noContent++;
      venue.menuSummary = "Menu details not available on website";
      venue.pastaRelevance = "Unable to assess pasta relevance from available content";
    } else {
      try {
        const result = await analyseMenu(venue, text);
        if (result) {
          venue.menuSummary = result.menuSummary;
          venue.pastaRelevance = result.pastaRelevance;
          menusExtracted++;
        } else {
          venue.menuSummary = "Menu details not available on website";
          venue.pastaRelevance = "Unable to assess pasta relevance from available content";
        }
      } catch (err) {
        process.stderr.write(`\n  Claude error on ${venue.name}: ${err.message}\n`);
      }
    }
  }

  done++;
  sinceLastSave++;
  if (sinceLastSave >= SAVE_EVERY) {
    writeFileSync(OUTPUT, JSON.stringify({ venues }, null, 0));
    sinceLastSave = 0;
  }

  process.stdout.write(
    `  ${done}/${toProcess.length} · menus:${menusExtracted} · emails:${emailsFound} · phones:${phonesFound}\r`
  );
});

// Final save
writeFileSync(OUTPUT, JSON.stringify({ venues }, null, 0));
console.log(`\nDone.`);
console.log(`  Menus extracted: ${menusExtracted}`);
console.log(`  Emails found:    ${emailsFound}`);
console.log(`  Phones found:    ${phonesFound}`);
console.log(`  No content:      ${noContent}`);
console.log(`Written to ${OUTPUT}`);
