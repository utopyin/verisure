import { expect, test } from "bun:test";
import { DomainPackage } from "./index.ts";

test("domain package scaffold is importable", () => {
  expect(DomainPackage).toBe("@verisure/domain");
});
