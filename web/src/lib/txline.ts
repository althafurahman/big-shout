import { config } from "./config";

/**
 * Minimal server-side TxLINE client for the web app (practice mode, verify
 * page, replay fixture list). Credentials stay server-side; the browser
 * never talks to TxLINE. The guest JWT is renewed on demand and kept in
 * module scope.
 */

let jwt = process.env.TX_JWT ?? "";

async function renewJwt(): Promise<string> {
  const r = await fetch(config.jwtUrl, { method: "POST" });
  const data = await r.json();
  jwt = data.token;
  return jwt;
}

async function get(path: string, retry = true): Promise<any> {
  const r = await fetch(`${config.apiBase}${path}`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      "X-Api-Token": config.txApiToken,
    },
    cache: "no-store",
  });
  if ((r.status === 401 || r.status === 403) && retry) {
    await renewJwt();
    return get(path, false);
  }
  if (!r.ok) throw new Error(`TxLINE ${path} -> ${r.status}`);
  return r.json();
}

/** The scores GET endpoints return SSE-framed text (`data: {...}` lines)
 *  even for a one-shot request — unwrap that or plain JSON. */
function parseSseRecords(body: string): any[] {
  try {
    const j = JSON.parse(body);
    return Array.isArray(j) ? j : [j];
  } catch {
    /* not plain JSON — fall through to SSE parsing */
  }
  const out: any[] = [];
  for (const line of body.split(/\r?\n/)) {
    if (line.startsWith("data:")) {
      try {
        out.push(JSON.parse(line.slice(5)));
      } catch {
        /* partial line */
      }
    }
  }
  return out;
}

async function getRecords(path: string, retry = true): Promise<any[]> {
  const r = await fetch(`${config.apiBase}${path}`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      "X-Api-Token": config.txApiToken,
    },
    cache: "no-store",
  });
  if ((r.status === 401 || r.status === 403) && retry) {
    await renewJwt();
    return getRecords(path, false);
  }
  if (!r.ok) throw new Error(`TxLINE ${path} -> ${r.status}`);
  return parseSseRecords(await r.text());
}

export const txline = {
  fixturesSnapshot: (startEpochDay: number, competitionId?: number) =>
    get(
      `/fixtures/snapshot?startEpochDay=${startEpochDay}${competitionId ? `&competitionId=${competitionId}` : ""}`
    ),
  scoresHistorical: (fixtureId: number) => getRecords(`/scores/historical/${fixtureId}`),
  scoresSnapshot: (fixtureId: number) => getRecords(`/scores/snapshot/${fixtureId}`),
  statValidation: (fixtureId: number, seq: number, statKeys: number[]) =>
    get(`/scores/stat-validation?fixtureId=${fixtureId}&seq=${seq}&statKeys=${statKeys.join(",")}`),
};

/** Tolerant field access — TxLINE record casing varies by endpoint. */
export function field(rec: any, ...names: string[]): any {
  for (const n of names) {
    if (rec?.[n] !== undefined) return rec[n];
    const pascal = n[0].toUpperCase() + n.slice(1);
    if (rec?.[pascal] !== undefined) return rec[pascal];
  }
  return undefined;
}

export function statOf(rec: any, key: number): number | undefined {
  const stats = field(rec, "stats", "statistics");
  if (!stats) return undefined;
  if (Array.isArray(stats)) {
    const hit = stats.find((s: any) => field(s, "key") === key);
    return hit ? field(hit, "value") : undefined;
  }
  const v = stats[key] ?? stats[String(key)];
  return typeof v === "number" ? v : undefined;
}
