/**
 * CSRF protection utilities for server actions.
 */

import { timingSafeEqual } from "node:crypto";

/**
 * Generate a random CSRF token using Web Crypto API.
 */
export function generateCsrfToken(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback using getRandomValues
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Validate that the __vx_csrf field in the FormData matches the expected token.
 */
export function validateCsrfToken(formData: FormData, expectedToken: string): boolean {
  const token = formData.get("__vx_csrf");
  if (typeof token !== "string" || token.length === 0) {
    return false;
  }
  const tokenBuf = Buffer.from(token);
  const expectedBuf = Buffer.from(expectedToken);
  if (tokenBuf.length !== expectedBuf.length) {
    return false;
  }
  return timingSafeEqual(tokenBuf, expectedBuf);
}

/**
 * Inject a hidden CSRF input field before every </form> tag in the given HTML.
 */
export function injectCsrfField(html: string, token: string): string {
  const escapedToken = token
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const field = `<input type="hidden" name="__vx_csrf" value="${escapedToken}">`;
  return html.replace(/<\/form>/gi, `${field}</form>`);
}

/**
 * Validate the request's Origin (or Referer) header against the request URL's origin.
 *
 * - If Origin header is present, compare it to the request URL's origin.
 * - If Origin is absent but Referer is present, compare the Referer URL's origin.
 * - If neither is present, return false.
 * - If allowedOrigins is provided, also accept those origins in addition to same-origin.
 */
export function validateOrigin(request: Request, allowedOrigins?: string[]): boolean {
  const requestUrl = new URL(request.url);
  const requestOrigin = requestUrl.origin;

  const buildAllowed = (): string[] => {
    const set: string[] = [requestOrigin];
    if (allowedOrigins) {
      set.push(...allowedOrigins);
    }
    return set;
  };

  const originHeader = request.headers.get("origin");
  if (originHeader) {
    return buildAllowed().includes(originHeader);
  }

  const refererHeader = request.headers.get("referer");
  if (refererHeader) {
    try {
      const refererOrigin = new URL(refererHeader).origin;
      return buildAllowed().includes(refererOrigin);
    } catch {
      return false;
    }
  }

  // Neither Origin nor Referer present — reject
  return false;
}
