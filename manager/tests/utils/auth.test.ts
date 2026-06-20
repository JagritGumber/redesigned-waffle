import { describe, it, expect } from "bun:test";
import { hashPassword, verifyPassword } from "@/utils/auth";

describe("hashPassword / verifyPassword", () => {
  it("verifies a correctly hashed password", async () => {
    const password = "my-secret-password-123";
    const hash = await hashPassword(password);
    expect(await verifyPassword(password, hash)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct-password");
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("produces different hashes for the same password", async () => {
    const password = "same-password";
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);
    expect(hash1).not.toBe(hash2);
  });

  it("rejects empty string verification", async () => {
    const hash = await hashPassword("some-password");
    expect(await verifyPassword("", hash)).toBe(false);
  });
});
