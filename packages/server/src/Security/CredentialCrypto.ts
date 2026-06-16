import type { VerisureCredentialRow } from "@verisure/db/schema";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";

import { RuntimeConfig } from "../Runtime/RuntimeConfig.ts";

const CipherVersion = "v1" as const;
const AesGcmIvBytes = 12;

export interface PlainVerisureCredentialInput {
  readonly email: string;
  readonly password: string;
  readonly pin?: string | null;
}

export interface EncryptedVerisureCredentialInput {
  readonly encryptedEmail: string;
  readonly encryptedPassword: string;
  readonly encryptedPin?: string | null;
}

export interface DecryptedVerisureCredential {
  readonly id: string;
  readonly userId: string;
  readonly email: Redacted.Redacted;
  readonly password: Redacted.Redacted;
  readonly pin?: Redacted.Redacted;
}

export class CredentialCryptoError extends Data.TaggedError(
  "CredentialCryptoError"
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export interface CredentialCryptoShape {
  readonly encryptString: (
    plaintext: string
  ) => Effect.Effect<string, CredentialCryptoError>;
  readonly decryptString: (
    ciphertext: string
  ) => Effect.Effect<string, CredentialCryptoError>;
  readonly encryptCredential: (
    input: PlainVerisureCredentialInput
  ) => Effect.Effect<EncryptedVerisureCredentialInput, CredentialCryptoError>;
  readonly decryptCredential: (
    row: VerisureCredentialRow
  ) => Effect.Effect<DecryptedVerisureCredential, CredentialCryptoError>;
}

export class CredentialCrypto extends Context.Service<
  CredentialCrypto,
  CredentialCryptoShape
>()("@verisure/server/CredentialCrypto") {
  static readonly Live = Layer.effect(
    CredentialCrypto,
    Effect.gen(function* makeCredentialCrypto() {
      const config = yield* RuntimeConfig;
      const key = yield* importAesKey(
        Redacted.value(config.credentialEncryptionKey)
      );

      const encryptString: CredentialCryptoShape["encryptString"] = Effect.fn(
        "CredentialCrypto.encryptString"
      )((plaintext) => encryptWithKey(key, plaintext));

      const decryptString: CredentialCryptoShape["decryptString"] = Effect.fn(
        "CredentialCrypto.decryptString"
      )((ciphertext) => decryptWithKey(key, ciphertext));

      const encryptCredential: CredentialCryptoShape["encryptCredential"] =
        Effect.fn("CredentialCrypto.encryptCredential")(function* (input) {
          const encryptedEmail = yield* encryptString(input.email);
          const encryptedPassword = yield* encryptString(input.password);
          const encryptedPin =
            input.pin === undefined || input.pin === null
              ? null
              : yield* encryptString(input.pin);

          return {
            encryptedEmail,
            encryptedPassword,
            encryptedPin,
          };
        });

      const decryptCredential: CredentialCryptoShape["decryptCredential"] =
        Effect.fn("CredentialCrypto.decryptCredential")(function* (row) {
          const email = yield* decryptString(row.encryptedEmail);
          const password = yield* decryptString(row.encryptedPassword);
          const pin =
            row.encryptedPin === null
              ? undefined
              : yield* decryptString(row.encryptedPin);

          return {
            email: Redacted.make(email),
            id: row.id,
            password: Redacted.make(password),
            ...(pin === undefined ? {} : { pin: Redacted.make(pin) }),
            userId: row.userId,
          };
        });

      return CredentialCrypto.of({
        decryptCredential,
        decryptString,
        encryptCredential,
        encryptString,
      });
    })
  );
}

const importAesKey = (
  keyMaterial: string
): Effect.Effect<CryptoKey, CredentialCryptoError> =>
  Effect.tryPromise({
    catch: (cause) =>
      new CredentialCryptoError({
        cause,
        message: "Failed to initialize credential encryption key",
      }),
    try: async () => {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(keyMaterial)
      );
      return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
        "encrypt",
        "decrypt",
      ]);
    },
  });

const encryptWithKey = (
  key: CryptoKey,
  plaintext: string
): Effect.Effect<string, CredentialCryptoError> =>
  Effect.tryPromise({
    catch: (cause) =>
      new CredentialCryptoError({
        cause,
        message: "Failed to encrypt credential material",
      }),
    try: async () => {
      const iv = crypto.getRandomValues(new Uint8Array(AesGcmIvBytes));
      const ciphertext = await crypto.subtle.encrypt(
        { iv, name: "AES-GCM" },
        key,
        new TextEncoder().encode(plaintext)
      );

      return [
        CipherVersion,
        bytesToBase64Url(iv),
        bytesToBase64Url(new Uint8Array(ciphertext)),
      ].join(".");
    },
  });

const decryptWithKey = (
  key: CryptoKey,
  encoded: string
): Effect.Effect<string, CredentialCryptoError> =>
  Effect.tryPromise({
    catch: (cause) =>
      new CredentialCryptoError({
        cause,
        message: "Failed to decrypt credential material",
      }),
    try: async () => {
      const [version, encodedIv, encodedCiphertext] = encoded.split(".");
      if (
        version !== CipherVersion ||
        encodedIv === undefined ||
        encodedCiphertext === undefined
      ) {
        throw new Error("Unsupported credential ciphertext format");
      }

      const iv = base64UrlToBytes(encodedIv);
      const ciphertext = base64UrlToBytes(encodedCiphertext);
      const plaintext = await crypto.subtle.decrypt(
        { iv, name: "AES-GCM" },
        key,
        ciphertext
      );

      return new TextDecoder().decode(plaintext);
    },
  });

const bytesToBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCodePoint(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

const base64UrlToBytes = (value: string): Uint8Array<ArrayBuffer> => {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "="
  );
  const binary = atob(padded);
  const bytes: Uint8Array<ArrayBuffer> = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.codePointAt(index) ?? 0;
  }
  return bytes;
};
