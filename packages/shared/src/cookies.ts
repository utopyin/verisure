export interface Cookie {
  readonly name: string;
  readonly value: string;
  readonly domain?: string;
  readonly path?: string;
  readonly expires?: Date;
  readonly maxAge?: number;
  readonly httpOnly?: boolean;
  readonly secure?: boolean;
  readonly sameSite?: "Strict" | "Lax" | "None";
}

export const parseSetCookieHeader = (header: string): Cookie => {
  const [nameValue, ...attributes] = header
    .split(";")
    .map((part) => part.trim());
  const separator = nameValue?.indexOf("=") ?? -1;
  if (!nameValue || separator < 1) {
    throw new Error(`Invalid Set-Cookie header: ${header}`);
  }

  const cookie: Record<string, unknown> = {
    name: nameValue.slice(0, separator),
    value: nameValue.slice(separator + 1),
  };

  for (const attribute of attributes) {
    const [rawName, ...rawValue] = attribute.split("=");
    const name = rawName?.toLowerCase();
    const value = rawValue.join("=");

    switch (name) {
      case "domain": {
        cookie.domain = value;
        break;
      }
      case "path": {
        cookie.path = value;
        break;
      }
      case "expires": {
        const expires = new Date(value);
        if (!Number.isNaN(expires.getTime())) {
          cookie.expires = expires;
        }
        break;
      }
      case "max-age": {
        cookie.maxAge = Number(value);
        break;
      }
      case "httponly": {
        cookie.httpOnly = true;
        break;
      }
      case "secure": {
        cookie.secure = true;
        break;
      }
      case "samesite": {
        cookie.sameSite = normalizeSameSite(value);
        break;
      }
      default: {
        break;
      }
    }
  }

  return cookie as unknown as Cookie;
};

export const parseSetCookieHeaders = (
  headers: Iterable<string>
): readonly Cookie[] => Array.from(headers, parseSetCookieHeader);

export const serializeCookieHeader = (
  cookies: Iterable<Pick<Cookie, "name" | "value">>
): string =>
  Array.from(cookies, ({ name, value }) => `${name}=${value}`).join("; ");

export const serializeSetCookieHeader = (cookie: Cookie): string => {
  const parts = [`${cookie.name}=${cookie.value}`];
  if (cookie.domain) {
    parts.push(`Domain=${cookie.domain}`);
  }
  if (cookie.path) {
    parts.push(`Path=${cookie.path}`);
  }
  if (cookie.expires) {
    parts.push(`Expires=${cookie.expires.toUTCString()}`);
  }
  if (cookie.maxAge !== undefined) {
    parts.push(`Max-Age=${cookie.maxAge}`);
  }
  if (cookie.httpOnly) {
    parts.push("HttpOnly");
  }
  if (cookie.secure) {
    parts.push("Secure");
  }
  if (cookie.sameSite) {
    parts.push(`SameSite=${cookie.sameSite}`);
  }
  return parts.join("; ");
};

export const extractSetCookieHeaders = (
  headers: Headers
): readonly string[] => {
  const headerSetCookies = (
    headers as Headers & { readonly getSetCookie?: () => readonly string[] }
  ).getSetCookie?.();

  if (headerSetCookies !== undefined && headerSetCookies.length > 0) {
    return [...headerSetCookies];
  }

  const combined = headers.get("set-cookie");
  return combined === null ? [] : splitCombinedSetCookieHeader(combined);
};

export const splitCombinedSetCookieHeader = (
  header: string
): readonly string[] =>
  header
    .split(/,(?=\s*[^;,]+=)/u)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

export const mergeCookies = (
  current: readonly Cookie[],
  incoming: readonly Cookie[],
  now: Date = new Date()
): readonly Cookie[] => {
  const merged = new Map<string, Cookie>();

  for (const cookie of current) {
    merged.set(cookie.name, cookie);
  }

  for (const cookie of incoming) {
    if (cookieDeletes(cookie, now)) {
      merged.delete(cookie.name);
    } else {
      merged.set(cookie.name, cookie);
    }
  }

  return [...merged.values()];
};

const normalizeSameSite = (value: string): Cookie["sameSite"] => {
  const lower = value.toLowerCase();
  if (lower === "strict") {
    return "Strict";
  }
  if (lower === "none") {
    return "None";
  }
  return "Lax";
};

const cookieDeletes = (cookie: Cookie, now: Date): boolean =>
  cookie.maxAge === 0 ||
  cookie.maxAge === -1 ||
  (cookie.expires !== undefined && cookie.expires.getTime() <= now.getTime());
