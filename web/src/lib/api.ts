import { NextResponse } from "next/server";
import { ApiError } from "./db";
import { parseBody } from "./validate";

export { parseBody };

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function err(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, code, ...(extra ?? {}) }, { status });
}

/** Wrap an async handler: consistent JSON errors, no stack leaks, no 500 HTML. */
export function handler(fn: (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>) {
  return async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    try {
      return await fn(req, ctx ?? { params: Promise.resolve({}) });
    } catch (e) {
      if (e instanceof ApiError) {
        return err(e.status, e.code, e.message, e.extra);
      }
      const ve = e as Error & { status?: number; code?: string };
      if (ve.status) return err(ve.status, ve.code ?? "bad_request", ve.message);
      console.error("[api] unhandled:", e);
      return err(500, "internal", "Something broke on our side. Try again.");
    }
  };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    const e = new Error("body must be valid JSON") as Error & { status?: number; code?: string };
    e.status = 400;
    e.code = "bad_json";
    throw e;
  }
}
