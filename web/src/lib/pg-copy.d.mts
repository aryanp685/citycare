// Type surface for pg-copy.mjs (the JS implementation next door).

/** Result of a COPY … TO STDOUT query: async-iterable of Buffer chunks.
 *  Deliberately NOT thenable (self-unwrap deadlock — see pg-copy.mjs header). */
export type CopyOutResult = AsyncIterable<Buffer>;

/** Result of a COPY … FROM STDIN query: settles on CommandComplete / error. */
export type CopyInResult = Promise<unknown>;

/** A pg client whose query() has been upgraded for the COPY protocol. */
export interface CopyCapableClient {
  connect(): Promise<unknown>;
  end(): Promise<unknown>;
  query(text: string, values?: unknown[]): CopyOutResult | CopyInResult | Promise<unknown>;
}

/** Wrap a pg Client/PoolClient so its query() supports COPY TO/FROM.
 *  Pass a dedicated client WITHOUT the app pool's statement_timeout for backups. */
export declare function withCopySupport(client: {
  connect(): Promise<unknown>;
  end(): Promise<unknown>;
  query(text: string, values?: unknown[]): unknown;
}): CopyCapableClient;
