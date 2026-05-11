/**
 * Have I Been Pwned — password compromise check via k-anonymity.
 *
 * Sprint 6 sécu/ops (PR #84). Implements the HIBP "Pwned Passwords v3"
 * range API : https://haveibeenpwned.com/API/v3#PwnedPasswords
 *
 * Privacy contract :
 *   - The plaintext password is **never** sent on the wire.
 *   - We compute SHA-1 locally, send only the first 5 hex chars (the
 *     "prefix"), and receive the list of matching suffixes back.
 *   - We then check locally if our computed suffix is in that list.
 *   - This is k-anonymity : the server never learns which exact hash
 *     we asked for, only that we're interested in one of ~500 hashes
 *     sharing the prefix.
 *
 * Why SHA-1 ?
 *   It's not a cryptographic primitive here — HIBP picked it for the
 *   public dataset format. We never store SHA-1 hashes ourselves ;
 *   passwords at rest are argon2id (cf. passwordService).
 *
 * Soft-fail on outage :
 *   `isPasswordPwned` returns `false` (treats the password as "not
 *   pwned") when the API is unreachable, slow, or returns malformed
 *   data. Rationale : a HIBP outage must not block legitimate signup /
 *   reset. We log a warn so an operator can reactivate retries if it
 *   becomes a pattern. The user-facing flow stays unchanged.
 *
 * Override :
 *   `HIBP_DISABLED=true` skips the check entirely (useful for offline
 *   tests, dev without internet, and emergency disable). Any other
 *   value (or unset) leaves the check active.
 */

import { createHash } from "crypto";
import { moduleLogger } from "../../lib/logger";

const log = moduleLogger("HIBP");

const RANGE_API = "https://api.pwnedpasswords.com/range";
/** Total time budget for the HTTP call before we soft-fail. */
const FETCH_TIMEOUT_MS = 1500;

/** Returns true iff the user explicitly disabled the HIBP check. */
export function isHibpDisabled(): boolean {
  return process.env.HIBP_DISABLED === "true";
}

function sha1HexUpper(input: string): string {
  return createHash("sha1").update(input, "utf8").digest("hex").toUpperCase();
}

/**
 * Pure parser exposed for tests : given the raw response body of the
 * HIBP range endpoint and a candidate suffix, returns true iff the
 * suffix is listed (i.e. password has been seen in a breach).
 *
 * Body format (CRLF-separated) : `SUFFIX:COUNT` per line, e.g.
 *   `001A6F6FB6E7B6CC8E1F4F25C5E4F6E5DC3:5`
 *
 * `count` is informational ; we only need presence/absence.
 */
export function suffixIsPwned(rangeBody: string, suffix: string): boolean {
  if (!rangeBody) return false;
  const target = suffix.toUpperCase();
  for (const rawLine of rangeBody.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const colonIdx = line.indexOf(":");
    const candidate = colonIdx === -1 ? line : line.slice(0, colonIdx);
    if (candidate.toUpperCase() === target) return true;
  }
  return false;
}

/**
 * Returns true iff the given password is found in the HIBP corpus.
 * Soft-fails (returns false) on network/parse errors so the calling
 * flow is never blocked by an external outage.
 */
export async function isPasswordPwned(plain: string): Promise<boolean> {
  if (isHibpDisabled()) return false;
  if (!plain) return false;

  const hash = sha1HexUpper(plain);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  let response: Response;
  try {
    response = await fetch(`${RANGE_API}/${prefix}`, {
      method: "GET",
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    log.warn({ err }, "HIBP range API unreachable, treating as not pwned");
    return false;
  }

  if (!response.ok) {
    log.warn({ status: response.status }, "HIBP range API returned non-2xx, treating as not pwned");
    return false;
  }

  let body: string;
  try {
    body = await response.text();
  } catch (err) {
    log.warn({ err }, "HIBP range API body read failed, treating as not pwned");
    return false;
  }

  return suffixIsPwned(body, suffix);
}
