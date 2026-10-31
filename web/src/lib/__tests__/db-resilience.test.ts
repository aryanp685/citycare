import { describe, it, expect } from "vitest";
import { isTransientConnError } from "../db";

describe("transient connection errors (serverless Postgres) — retry policy", () => {
  it("retries server-went-away conditions", () => {
    expect(isTransientConnError(Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }))).toBe(true);
    expect(isTransientConnError(Object.assign(new Error("terminating connection due to administrator command"), { code: "57P01" }))).toBe(true);
    expect(isTransientConnError(new Error("Connection terminated unexpectedly"))).toBe(true);
    expect(isTransientConnError(Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT" }))).toBe(true);
  });
  it("NEVER retries real answers: constraint violations, syntax errors, statement timeouts, auth failures", () => {
    expect(isTransientConnError(Object.assign(new Error("duplicate key value"), { code: "23505" }))).toBe(false);
    expect(isTransientConnError(Object.assign(new Error("syntax error at or near"), { code: "42601" }))).toBe(false);
    expect(isTransientConnError(Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" }))).toBe(false);
    expect(isTransientConnError(Object.assign(new Error("password authentication failed"), { code: "28P01" }))).toBe(false);
    expect(isTransientConnError(null)).toBe(false);
    expect(isTransientConnError("ECONNRESET")).toBe(false);
  });
});
