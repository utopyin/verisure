import { expect, test, describe } from "vitest";

import { DomainPackage } from ".";

describe("domain package", () => {
  test("scaffold is importable", () => {
    expect(DomainPackage).toBe("@verisure/domain");
  });
});
