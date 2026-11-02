// Type surface for backup-core.mjs (the JS implementation next door).
// Keep in sync with the JSDoc in backup-core.mjs.

export const FORMAT_MAGIC: string;
export const FORMAT_VERSION: number;
export const DEFAULT_RETENTION_DAYS: number;
export const DEFAULT_SOFT_LIMIT_MS: number;
export const BACKUP_STALE_MS: number;
/** Stable grep-able marker for the DB-down failure mode (failure row unwriteable). */
export const BACKUP_FATAL_MARKER: string;
/** Format the fatal log line (errorClass + context; no secrets). */
export declare function formatBackupFatalLog(code: string, context: string): string;

export type BackupErrorCode = "config" | "crypto" | "verify" | "store" | "db" | "time_budget";

export declare class BackupError extends Error {
  name: "BackupError";
  code: BackupErrorCode;
  cause?: unknown;
  constructor(code: BackupErrorCode, message: string, cause?: unknown);
}

type Env = Record<string, string | undefined>;

export declare function backupKey(env?: Env): Buffer | null;
export declare function storeKind(env?: Env): "blob" | "local" | null;
export declare function retentionDays(env?: Env): number;
export declare function dbFingerprintFromUrl(urlString: string): string;
export declare function schemaVersionFromDir(migrationsDir: string): string | null;

export declare const TABLES_SQL: string;
export declare const FK_EDGES_SQL: string;

export declare function quoteIdent(name: string): string;
export declare function topoTableOrder(
  tableNames: string[],
  edges: { child: string; parent: string }[],
): { order: string[]; warning: string | null };

export declare function encryptContainer(container: Buffer, key: Buffer): Buffer;
export declare function decryptContainer(file: Buffer, key: Buffer): Buffer;

export interface TableDump {
  name: string;
  rows: number;
  copyText: string;
}

export interface BackupManifestEntry {
  name: string;
  quoted: string;
  rows: number;
  bytes: number;
}

export interface BackupHeader {
  magic: string;
  version: number;
  createdAt: string;
  pgVersion: string;
  dbFingerprint: string;
  schemaVersion: string | null;
  tableCount: number;
  totalRows: number;
  payloadBytes: number;
  payloadSha256: string;
  warning?: string;
  tables: BackupManifestEntry[];
}

export interface BackupSection {
  name: string;
  quoted: string;
  rows: number;
  copyText: string;
}

export declare function buildContainer(opts: {
  createdAt: string;
  pgVersion: string;
  dbFingerprint: string;
  schemaVersion: string | null;
  tables: TableDump[];
  warning?: string | null;
}): { container: Buffer; header: BackupHeader; payloadBytes: number };

export declare function verifyContainer(container: Buffer): { header: BackupHeader; sections: BackupSection[] };

export declare function verifyBackupFile(file: Buffer | Uint8Array, key: Buffer): {
  header: BackupHeader;
  sections: BackupSection[];
  fileSha256: string;
};

export declare function backupFileName(createdAt: Date, fileSha256: string): string;

export declare function writeBackupFile(env: Env, objectName: string, file: Buffer): Promise<void>;
export declare function readBackupFile(env: Env, objectName: string): Promise<Buffer>;
export declare function listBackupFiles(env: Env): Promise<{ name: string; size: number; mtimeMs: number }[]>;
export declare function pruneBackups(env: Env, keepDays: number, nowMs?: number): Promise<string[]>;

/** Duck-typed pg client: query() returns an async iterable of text chunks for COPY TO. */
export interface CopyClientOut {
  query(text: string): AsyncIterable<unknown>;
}
/** Duck-typed pg client: query(text, [values]) with FROM STDIN pipes values as CopyData. */
export interface CopyClientIn {
  query(text: string, values?: unknown[]): unknown;
}

export declare function copyTableOut(client: CopyClientOut, name: string, onChunk: (c: Buffer) => void): Promise<void>;
export declare function copyTableIn(client: CopyClientIn, name: string, copyText: string): unknown;

export interface QueryRunner {
  (text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface CreateBackupOpts {
  env?: Env;
  query: QueryRunner;
  client: CopyClientOut & CopyClientIn;
  url: string;
  migrationsDir?: string | null;
  softLimitMs?: number;
  now?: Date;
}

export interface BackupResult {
  objectName: string;
  fileSize: number;
  sha256: string;
  storeKind: "local" | "blob";
  header: BackupHeader;
  durationMs: number;
  pruned: string[];
}

export declare function createBackup(opts: CreateBackupOpts): Promise<BackupResult>;

export declare const INSERT_BACKUP_META_SQL: string;
export declare const LATEST_GOOD_BACKUP_SQL: string;

export interface BackupMetaRow {
  status: "ok" | "failed" | "partial";
  dbFingerprint: string;
  schemaVersion: string | null;
  pgVersion: string | null;
  fileSize: number;
  sha256: string;
  storeKind: string;
  objectName: string;
  durationMs: number;
  errorClass: string | null;
  tableCount: number | null;
  /** per-table row counts, e.g. { User: 9, Patient: 5 } — counts only, no PHI */
  rowCounts?: Record<string, number> | null;
}

export declare function recordBackupMeta(query: QueryRunner, row: BackupMetaRow): Promise<{ id: string; createdAt: string }>;
export declare function backupStaleness(lastSuccessAt: string | null, nowMs?: number): {
  lastSuccessAt: string | null;
  ageMs: number | null;
  stale: boolean;
};
