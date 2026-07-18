/** JSON responses with Prisma BigInt fields: convert to number (all our
 *  values — points, stakes, ids, timestamps — sit far below 2^53). */
export function toJson<T>(value: T): unknown {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? Number(v) : v))
  );
}

export function jsonResponse(value: unknown, init?: ResponseInit): Response {
  return Response.json(toJson(value), init);
}
