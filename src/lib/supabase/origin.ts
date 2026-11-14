export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    // Next.js may normalize request.url to localhost. Host retains the requested
    // authority; forwarded-host is not a trusted substitute.
    return parsed.origin === origin
      && parsed.protocol === new URL(request.url).protocol
      && parsed.host === request.headers.get("host");
  } catch {
    return false;
  }
}
