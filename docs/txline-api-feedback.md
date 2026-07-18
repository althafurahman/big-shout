# TxLINE API feedback — running notes

Kept from day one, per the submission's "API feedback" deliverable. Raw observations,
newest last. Items marked (FlashSettle) were first hit while building our other entry
and re-confirmed here.

- (FlashSettle) `/scores/stat-validation` 404s on records that exist in the stream but
  aren't in a committed proof batch yet — there is no way to ask "what is the latest
  provable seq for fixture X?", so settlers must probe backwards through seqs.
- (FlashSettle) Score records differ in field casing between endpoints (`fixtureId` vs
  `FixtureId`); clients need tolerant adapters.
- (FlashSettle) SSE stream requires `Accept-Encoding: deflate` to be set explicitly or
  the connection stalls silently.
- (FlashSettle) Seqs start at 1; passing seq=0 produces an unhelpful error rather than a
  validation message.
- The docs' quickstart signs `${txSig}:${LEAGUES}:${jwt}` — for the free bundle
  (`LEAGUES = []`) this silently becomes a double-colon string; an explicit example for
  the empty-league case would save an activation 403 loop.
