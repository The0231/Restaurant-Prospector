// Server-only loader for the base FSA venue dataset.
//
// In production the dataset lives in Supabase Storage (refreshed weekly by the
// GitHub Actions job — see .github/workflows/fsa-refresh.yml) and is fetched by
// URL via NEXT_PUBLIC_DATASET_URL. Locally, when that env var isn't set, it
// falls back to the bundled public/uk-restaurants.json so dev still works.
//
// Callers only need id/name/postcode; the blob has many more fields, ignored here.

import fs from "node:fs/promises";
import path from "node:path";

export interface BaseVenueRow {
  id: string;
  name: string;
  postcode?: string;
}

export async function loadBaseVenues(): Promise<BaseVenueRow[]> {
  const url = process.env.NEXT_PUBLIC_DATASET_URL;
  if (url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`dataset fetch ${res.status} from ${url}`);
    const data = (await res.json()) as { venues?: BaseVenueRow[] };
    return data.venues ?? [];
  }
  const file = path.join(process.cwd(), "public", "uk-restaurants.json");
  const data = JSON.parse(await fs.readFile(file, "utf8")) as { venues?: BaseVenueRow[] };
  return data.venues ?? [];
}
