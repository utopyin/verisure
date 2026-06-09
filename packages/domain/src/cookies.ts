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
  const [nameValue, ...attributes] = header.split(";").map((part) => part.trim());
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
      case "domain":
        cookie.domain = value;
        break;
      case "path":
        cookie.path = value;
        break;
      case "expires": {
        const expires = new Date(value);
        if (!Number.isNaN(expires.getTime())) {
          cookie.expires = expires;
        }
        break;
      }
      case "max-age":
        cookie.maxAge = Number(value);
        break;
      case "httponly":
        cookie.httpOnly = true;
        break;
      case "secure":
        cookie.secure = true;
        break;
      case "samesite":
        cookie.sameSite = normalizeSameSite(value);
        break;
    }
  }

  return cookie as unknown as Cookie;
};

export const parseSetCookieHeaders = (headers: Iterable<string>): ReadonlyArray<Cookie> =>
  Array.from(headers, parseSetCookieHeader);

export const serializeCookieHeader = (cookies: Iterable<Pick<Cookie, "name" | "value">>): string =>
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
