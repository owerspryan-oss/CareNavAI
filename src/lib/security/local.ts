/**
 * Hosts that address this machine. Local-only pages (/admin/usage, /dev/inbox) are served only to
 * these, and they are the one place auth works without HTTPS (AC-12.3). A guard, not authentication.
 */
const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export function isLocalHost(host: string | null | undefined): boolean {
  return LOCAL_HOSTS.test(host ?? "");
}

/** True when the request came over HTTPS, directly or via a proxy that says so. */
export function isHttps(req: Request): boolean {
  if (req.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "https") return true;
  try {
    return new URL(req.url).protocol === "https:";
  } catch {
    return false;
  }
}
