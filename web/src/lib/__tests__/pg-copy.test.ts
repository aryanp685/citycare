import { describe, it, expect } from "vitest";
import { withCopySupport } from "../pg-copy.mjs";

// The COPY protocol is exercised against a real Postgres in the e2e suite (section 14) and
// in the restore drill. Here we test the adapter's mechanics with fakes: chunk queuing,
// ordering, completion, error propagation, bounded COPY FROM chunking, plain-query
// delegation, and the thenable-deadlock regression (see pg-copy.mjs header).

interface OutQ {
  handleCopyData(msg: { chunk: Buffer }): void;
  emit(ev: string, ...args: unknown[]): void;
  [Symbol.asyncIterator](): AsyncIterator<Buffer>;
  then?: unknown;
}

function makeOutQuery(): { q: OutQ; calls: unknown[] } {
  const calls: unknown[] = [];
  const base = {
    connect: async () => ({}),
    end: async () => ({}),
    query: (q: unknown) => {
      calls.push(q);
      return q;
    },
  };
  const wrapped = withCopySupport(base as never);
  const q = wrapped.query('COPY "T" TO STDOUT WITH (FORMAT text)') as unknown as OutQ;
  return { q, calls };
}

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("pg-copy — COPY TO STDOUT adapter", () => {
  it("yields every CopyData chunk in order and completes on end", async () => {
    const { q } = makeOutQuery();
    const seen: string[] = [];
    const t = (async () => {
      for await (const chunk of q) seen.push(chunk.toString("utf8"));
    })();
    await tick();
    q.handleCopyData({ chunk: Buffer.from("a\t1\n") });
    q.handleCopyData({ chunk: Buffer.from("b\t2\n") });
    await tick();
    q.handleCopyData({ chunk: Buffer.from("c\t3\n") });
    q.emit("end");
    await t;
    expect(seen).toEqual(["a\t1\n", "b\t2\n", "c\t3\n"]);
  });

  it("an empty table completes immediately with no chunks", async () => {
    const { q } = makeOutQuery();
    const seen: string[] = [];
    const t = (async () => {
      for await (const chunk of q) seen.push(chunk.toString("utf8"));
    })();
    q.emit("end");
    await t;
    expect(seen).toEqual([]);
  });

  it("an error mid-stream rejects the iteration", async () => {
    const { q } = makeOutQuery();
    const t = (async () => {
      for await (const _ of q) void _;
    })().catch((e) => e);
    q.emit("error", new Error("socket gone"));
    const e = await t;
    expect(String(e)).toContain("socket gone");
  });

  it("REGRESSION: chunks are COPIED, not aliased (pg reuses its parse buffer)", async () => {
    // pg-protocol hands out Buffer views into a reusable buffer (buffer-reader.bytes →
    // slice/subarray) and overwrites it on the next socket event. Holding the view must
    // not corrupt earlier chunks (restore-drill finding, 2026-11-01: NULs in UUIDs).
    const { q } = makeOutQuery();
    const backing = Buffer.from("aaaa\t1\nbbbb\t2\n");
    const seen: string[] = [];
    const t = (async () => {
      for await (const chunk of q) seen.push(chunk.toString("utf8"));
    })();
    await tick();
    q.handleCopyData({ chunk: backing.subarray(0, 6) }); // a VIEW, like pg sends
    // the parser reuses the backing buffer for the next message
    Buffer.from("ZZZZZZ").copy(backing);
    q.handleCopyData({ chunk: backing.subarray(6, 12) });
    q.emit("end");
    await t;
    expect(seen).toEqual(["aaaa\t1", "\nbbbb\t"]); // byte-exact, no Z's, no shift
  });

  it("REGRESSION: a pg server error during COPY TO rejects the iteration", async () => {
    // pg forwards ErrorResponse to the active query via handleError(err, connection);
    // with no callback it emits 'error' (header rule 3).
    const { q } = makeOutQuery();
    const t = (async () => {
      for await (const _ of q) void _;
    })().catch((e) => e);
    (q as unknown as { handleError(e: Error, c: unknown): void }).handleError(new Error("server said no"), null);
    const e = await t;
    expect(String(e)).toContain("server said no");
  });

  it("REGRESSION: the query object must NOT be thenable (self-unwrap deadlock)", () => {
    // resolve(query) on a promise whose value is thenable makes the promise machinery
    // call query.then(...) to unwrap it — if that then awaits the same promise, the
    // promise stays pending forever (found 2026-11-01). Pin the shape:
    const { q } = makeOutQuery();
    expect(typeof (q as { then?: unknown }).then).toBe("undefined");
    const wrapped = withCopySupport({ connect: async () => ({}), end: async () => ({}), query: (x: unknown) => x } as never);
    const from = wrapped.query('COPY "T" FROM STDIN WITH (FORMAT text)', ["x"]);
    // the FROM side returns a plain Promise (thenable) — and it is a different object
    expect(typeof (from as PromiseLike<unknown>).then).toBe("function");
  });
});

describe("pg-copy — COPY FROM STDIN adapter", () => {
  interface FromQ {
    handleCopyInResponse(c: { sendCopyFromChunk: (c: Buffer) => void; endCopyFrom: () => void }): void;
    emit(ev: string, ...a: unknown[]): void;
  }
  // The wrapper returns a Promise for FROM, but the base client's query() receives the
  // underlying CopyInQuery — capture it there to drive handleCopyInResponse / events.
  function makeFromQuery(data: string): { q: FromQ; promise: Promise<unknown> } {
    let captured: unknown = null;
    const base = {
      connect: async () => ({}),
      end: async () => ({}),
      query: (x: unknown) => {
        captured = x;
        return x;
      },
    };
    const wrapped = withCopySupport(base as never);
    const promise = wrapped.query('COPY "T" FROM STDIN WITH (FORMAT text)', [data]) as Promise<unknown>;
    return { q: captured as FromQ, promise };
  }

  it("streams data in bounded chunks then ends; the returned promise settles on end", async () => {
    const { q, promise } = makeFromQuery("x".repeat(3 * 1024 * 1024 + 123));
    const sent: number[] = [];
    let ended = false;
    const p = promise.then(() => "ok");
    q.handleCopyInResponse({
      sendCopyFromChunk: (c) => sent.push(c.length),
      endCopyFrom: () => (ended = true),
    });
    expect(sent.length).toBe(4); // 3 × 1 MB + 123 B tail
    for (const n of sent) expect(n).toBeLessThanOrEqual(1024 * 1024);
    expect(sent.reduce((a, b) => a + b, 0)).toBe(3 * 1024 * 1024 + 123);
    expect(ended).toBe(true);
    q.emit("end");
    expect(await p).toBe("ok");
  });

  it("empty data sends no chunks but still ends; a stream error rejects the promise", async () => {
    const { q, promise } = makeFromQuery("");
    let ended = false;
    const p = promise.catch((e) => e);
    q.handleCopyInResponse({ sendCopyFromChunk: () => { throw new Error("should not be called"); }, endCopyFrom: () => (ended = true) });
    expect(ended).toBe(true);
    q.emit("error", new Error("boom"));
    expect(String(await p)).toContain("boom");
  });

  it("REGRESSION: a pg server error during COPY FROM rejects the promise (no callback swallowing)", async () => {
    // pg.Query.handleError: `if (this.callback) return this.callback(err); this.emit('error')`
    // — a no-op callback swallows the error silently and the promise hangs. The query
    // must be constructed WITHOUT a callback (header rule 3).
    const { q, promise } = makeFromQuery("x\ty\n");
    const p = promise.catch((e) => e);
    q.handleCopyInResponse({ sendCopyFromChunk: () => {}, endCopyFrom: () => {} });
    (q as unknown as { handleError(e: Error, c: unknown): void }).handleError(new Error("invalid byte sequence for encoding"), null);
    expect(String(await p)).toContain("invalid byte sequence");
  });
});

describe("pg-copy — delegation", () => {
  it("plain queries delegate untouched; only COPY statements get the adapter", () => {
    const calls: unknown[] = [];
    const sentinel = { delegated: true };
    const base = {
      connect: async () => ({}),
      end: async () => ({}),
      query: (t: unknown) => {
        calls.push(t);
        return sentinel;
      },
    };
    const wrapped = withCopySupport(base as never);
    expect(wrapped.query("SELECT 1")).toBe(sentinel);
    // a SELECT that merely MENTIONS COPY in a string literal must NOT be treated as COPY
    expect(wrapped.query(`SELECT 'COPY x TO STDOUT' AS s`)).toBe(sentinel);
    const cq = wrapped.query('COPY "T" TO STDOUT WITH (FORMAT text)');
    expect(cq).not.toBe(sentinel);
    expect((cq as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator]).toBeTypeOf("function");
    expect(calls).toHaveLength(3); // both SELECTs + the COPY query instance reached the base client
  });
});
