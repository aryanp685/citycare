// NG-S09 — pg adapter for the backup core's COPY streaming.
//
// pg 8.23's Query does NOT implement the COPY protocol out of the box: handleCopyData is a
// no-op (COPY TO STDOUT data is silently dropped) and handleCopyInResponse fails with
// "No source stream defined". Verified at runtime, 2026-11-01. So we subclass pg.Query for
// both directions and expose a duck-typed client that matches what backup-core expects:
//
//   client.query("COPY … TO STDOUT …")           → async-iterable of Buffer chunks
//   client.query("COPY … FROM STDIN …", [text])  → Promise (resolves on CommandComplete)
//   anything else                                 → delegated to the underlying pg client
//
// CRITICAL (bugs found in review/drill, 2026-11-01):
//  1. The query objects must NOT define a `then` method. They may carry a promise that
//     resolves with the query object itself; if that object is thenable, the
//     promise-resolution procedure calls its `then` to "unwrap" it — which would await
//     the very promise being unwrapped: a silent deadlock (pending forever). The FROM
//     side returns a plain Promise instead of the query.
//  2. CopyDataMessage.chunk is a Buffer *view* into pg-protocol's reusable parse buffer
//     (buffer-reader `bytes()` → `this.buffer.slice(...)`, i.e. subarray — no copy).
//     The parser's mergeBuffer() overwrites that buffer on subsequent socket events,
//     so holding a chunk past the current event silently corrupts the data (the 2026-11-01
//     restore drill caught this: NUL bytes materialising inside UUIDs). COPY the bytes
//     in handleCopyData; never store msg.chunk.
//  3. Construct pg.Query WITHOUT a callback. pg.Query.handleError calls
//     `this.callback(err)` when a callback exists and never emits 'error' — a no-op
//     callback swallows server-side COPY errors, and the promise hangs instead of
//     rejecting.
//
// Only the backup path (cron route, CLI) uses this wrapper — the app pool is untouched.

import pg from "pg";

/** Max bytes per CopyData message on COPY FROM (keeps wire messages bounded). */
const COPY_CHUNK_BYTES = 1024 * 1024;

class CopyOutQuery extends pg.Query {
  constructor(text) {
    super({ text }); // NO callback — see header rule 3 (callback swallows 'error')
    this._queue = [];
    this._ended = false;
    this._error = null;
    this._waiter = null;
    // wire the terminal events to the iterator (data arrives via handleCopyData)
    this.on("end", () => {
      this._ended = true;
      this._wake();
    });
    this.on("error", (e) => {
      this._error = e;
      this._wake();
    });
  }
  _wake() {
    const w = this._waiter;
    this._waiter = null;
    if (w) w();
  }
  /** pg calls this for every CopyData message; msg.chunk is the raw COPY text as a Buffer. */
  handleCopyData(msg) {
    // COPY the bytes NOW — msg.chunk aliases the parser's reusable buffer (header rule 2)
    const raw = msg.chunk;
    this._queue.push(Buffer.isBuffer(raw) ? Buffer.from(raw) : Buffer.from(String(raw), "utf8"));
    this._wake();
  }
  [Symbol.asyncIterator]() {
    return {
      // arrow property captures `this` lexically — no aliasing (lint rule)
      next: () =>
        new Promise((resolve, reject) => {
          const pump = () => {
            if (this._error) return reject(this._error);
            if (this._queue.length) return resolve({ value: this._queue.shift(), done: false });
            if (this._ended) return resolve({ value: undefined, done: true });
            this._waiter = pump;
          };
          pump();
        }),
    };
  }
}

class CopyInQuery extends pg.Query {
  constructor(text, copyText) {
    super({ text }); // NO callback — see header rule 3 (callback swallows 'error')
    this._copyText = copyText;
  }
  /** Server is ready to receive COPY data: stream it out in bounded chunks, then end. */
  handleCopyInResponse(connection) {
    const buf = Buffer.isBuffer(this._copyText) ? this._copyText : Buffer.from(String(this._copyText ?? ""), "utf8");
    for (let off = 0; off < buf.length; off += COPY_CHUNK_BYTES) {
      connection.sendCopyFromChunk(buf.subarray(off, off + COPY_CHUNK_BYTES));
    }
    connection.endCopyFrom();
  }
}

const COPY_OUT_RE = /^COPY\s.+\sTO\sSTDOUT/i;
const COPY_IN_RE = /^COPY\s.+\sFROM\sSTDIN/i;

/** Wrap a pg Client/PoolClient so its query() supports the COPY protocol as described above.
 *  Pass a dedicated client WITHOUT the app pool's statement_timeout for backups. */
export function withCopySupport(client) {
  return {
    connect: () => client.connect(),
    end: () => client.end(),
    query(text, values) {
      if (COPY_OUT_RE.test(text)) {
        const q = new CopyOutQuery(text);
        client.query(q);
        return q; // async-iterable of Buffer chunks
      }
      if (COPY_IN_RE.test(text)) {
        const q = new CopyInQuery(text, values?.[0] ?? "");
        // a plain promise; resolves with the (deliberately NON-thenable) query object
        const done = new Promise((resolve, reject) => {
          q.on("end", () => resolve(q));
          q.on("error", reject);
        });
        client.query(q);
        return done;
      }
      return client.query(text, values);
    },
  };
}
