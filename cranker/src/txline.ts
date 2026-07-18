import axios, { AxiosInstance } from "axios";
import { config } from "./config";

/**
 * The scores GET endpoints (historical/updates/snapshot) return SSE-framed
 * text (`data: {...}\nid: N`) even for a one-shot request — this unwraps
 * either that or plain JSON. See docs/txline-api-feedback.md.
 */
export function parseSseRecords(body: any): any[] {
  if (Array.isArray(body)) return body;
  if (body == null) return [];
  if (typeof body === "object") return [body];
  const out: any[] = [];
  for (const line of String(body).split(/\r?\n/)) {
    if (line.startsWith("data:")) {
      try {
        out.push(JSON.parse(line.slice(5)));
      } catch {
        /* partial/keepalive line */
      }
    }
  }
  return out;
}

/**
 * Thin TxLINE API client with automatic guest-JWT renewal.
 * Requires an already-activated API token (config.txApiToken); the guest JWT
 * is disposable and renewed on any 401.
 */
export class TxLine {
  private jwt = config.txJwt;
  readonly http: AxiosInstance;

  constructor() {
    this.http = axios.create({ baseURL: config.apiBase });
    this.http.interceptors.request.use((c) => {
      if (this.jwt) c.headers["Authorization"] = `Bearer ${this.jwt}`;
      if (config.txApiToken) c.headers["X-Api-Token"] = config.txApiToken;
      return c;
    });
    this.http.interceptors.response.use(
      (r) => r,
      async (error) => {
        const original = error.config;
        if (error.response?.status === 401 && !original._retry) {
          original._retry = true;
          await this.renewJwt();
          original.headers["Authorization"] = `Bearer ${this.jwt}`;
          return this.http(original);
        }
        return Promise.reject(error);
      }
    );
  }

  async renewJwt(): Promise<string> {
    const r = await axios.post(config.jwtUrl);
    this.jwt = r.data.token;
    return this.jwt;
  }

  currentJwt(): string {
    return this.jwt;
  }

  async fixturesSnapshot(startEpochDay: number, competitionId?: number): Promise<any[]> {
    const params = new URLSearchParams({ startEpochDay: String(startEpochDay) });
    if (competitionId) params.set("competitionId", String(competitionId));
    return (await this.http.get(`/fixtures/snapshot?${params}`)).data ?? [];
  }

  async scoresHistorical(fixtureId: number): Promise<any[]> {
    return parseSseRecords((await this.http.get(`/scores/historical/${fixtureId}`)).data);
  }

  async scoresUpdates(fixtureId: number): Promise<any[]> {
    return parseSseRecords((await this.http.get(`/scores/updates/${fixtureId}`)).data);
  }

  async scoresSnapshot(fixtureId: number): Promise<any[]> {
    return parseSseRecords((await this.http.get(`/scores/snapshot/${fixtureId}`)).data);
  }

  async oddsSnapshot(fixtureId: number): Promise<any> {
    return (await this.http.get(`/odds/snapshot/${fixtureId}`)).data;
  }

  /** Merkle stat proof for `statKeys` at the given score record sequence. */
  async statValidation(fixtureId: number, seq: number, statKeys: number[]): Promise<any> {
    if (seq < 1) throw new Error("TxLINE seqs start at 1; refusing seq=" + seq);
    const url = `/scores/stat-validation?fixtureId=${fixtureId}&seq=${seq}&statKeys=${statKeys.join(",")}`;
    return (await this.http.get(url)).data;
  }

  /**
   * Server-Sent Events stream. Calls onRecord for every parsed record.
   * The explicit `Accept-Encoding: deflate` matters — without it the stream
   * stalls silently (see docs/txline-api-feedback.md). Renews the JWT when
   * the connection is refused.
   */
  private async stream(
    path: string,
    params: Record<string, string>,
    onRecord: (rec: any) => void,
    onError: (e: unknown) => void
  ): Promise<() => void> {
    const { EventSource } = await import("eventsource");
    const url = new URL(`${config.apiBase}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const self = this;
    const es = new EventSource(url.toString(), {
      fetch: async (input: any, init: any) => {
        const attempt = (jwt: string) =>
          fetch(input, {
            ...init,
            headers: {
              ...init?.headers,
              "Accept-Encoding": "deflate",
              Authorization: `Bearer ${jwt}`,
              "X-Api-Token": config.txApiToken,
            },
          });
        let resp = await attempt(self.jwt);
        if (resp.status === 401 || resp.status === 403) {
          resp = await attempt(await self.renewJwt());
        }
        return resp;
      },
    });
    es.onmessage = (ev: MessageEvent) => {
      try {
        onRecord(typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data);
      } catch {
        onRecord(ev.data);
      }
    };
    es.onerror = (e: unknown) => onError(e);
    return () => es.close();
  }

  streamScores(
    fixtureId: number | undefined,
    onRecord: (rec: any) => void,
    onError: (e: unknown) => void
  ): Promise<() => void> {
    return this.stream(
      "/scores/stream",
      fixtureId ? { fixtureId: String(fixtureId) } : {},
      onRecord,
      onError
    );
  }

  streamOdds(onRecord: (rec: any) => void, onError: (e: unknown) => void): Promise<() => void> {
    return this.stream("/odds/stream", {}, onRecord, onError);
  }
}
