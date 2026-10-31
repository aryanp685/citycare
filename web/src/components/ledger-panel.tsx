"use client";
import { useEffect, useState } from "react";

type LedgerEntry = { seq: string; when: string; who: string | null; role: string | null; action: string; entityType: string; hash: string };
type Chain = { intact: boolean; entries: number; breaks: { seq: string; reason: string; expected: string; found: string }[] };

export function LedgerPanel() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [chain, setChain] = useState<Chain | null>(null);
  const [summary, setSummary] = useState<{ who: string; count: number }[]>([]);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);

  async function loadMore() {
    if (!nextBefore) return;
    setMoreBusy(true);
    const res = await fetch(`/api/patient/ledger?before=${encodeURIComponent(nextBefore)}`, { credentials: "same-origin" });
    const j = res.ok ? (await res.json()) as { entries: LedgerEntry[]; nextBefore: string | null } : { entries: [], nextBefore: null };
    setEntries((cur) => [...cur, ...j.entries]);
    setNextBefore(j.nextBefore);
    setMoreBusy(false);
  }

  async function load(quiet = true) {
    const res = await fetch("/api/patient/ledger", { credentials: "same-origin" });
    if (!res.ok) { setMsg("Sign in to view your ledger."); return; }
    const j = await res.json() as { entries: LedgerEntry[]; chain: Chain; summary: { who: string; count: number }[]; nextBefore: string | null };
    setEntries(j.entries);
    setNextBefore(j.nextBefore ?? null);
    setChain(j.chain);
    setSummary(j.summary);
    if (!quiet) {
      setMsg(
        j.chain.intact
          ? `All ${j.chain.entries} hashes re-walked from genesis: intact.`
          : `Integrity check FAILED at seq ${j.chain.breaks[0]?.seq} — ${j.chain.breaks[0]?.reason}`,
      );
    }
  }
  useEffect(() => {
    void (async () => { await load(); })();
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="text-sm">
          {chain ? (
            chain.intact ? (
              <span className="text-green-700 font-bold">✓ Chain intact — {chain.entries} ledger entries verified</span>
            ) : (
              <span className="text-red-700 font-bold">✗ TAMPERING DETECTED at seq {chain.breaks[0]?.seq}: {chain.breaks[0]?.reason}</span>
            )
          ) : (
            <span className="text-muted">loading ledger…</span>
          )}
          {summary.length > 0 && (
            <div className="text-xs text-muted mt-1">
              accesses by person: {summary.map((s) => `${s.who} ×${s.count}`).join(" · ")}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => void load()}>Refresh</button>
          <button
            className="btn btn-primary"
            disabled={verifyBusy}
            onClick={async () => {
              setVerifyBusy(true);
              await load(false);
              setVerifyBusy(false);
            }}
          >
            {verifyBusy ? "Verifying…" : "Verify chain now"}
          </button>
        </div>
      </div>
      {msg && <p className="text-xs text-muted mb-2">{msg}</p>}
      {entries.length === 0 ? (
        <p className="text-sm text-muted">Empty. Nothing has ever read or changed your record — which is exactly how it should start.</p>
      ) : (
        <div className="max-h-96 overflow-auto border border-line rounded-xl">
          <table className="data">
            <thead className="sticky top-0 bg-white">
              <tr><th>#</th><th>When</th><th>Who</th><th>What</th><th>About</th><th>Hash (sha-256, 1st 16)</th></tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.seq}>
                  <td className="text-muted">{e.seq}</td>
                  <td className="whitespace-nowrap">{new Date(e.when).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false })}</td>
                  <td>{e.who ?? "—"}{e.role ? <span className="text-[11px] text-muted"> ({e.role.toLowerCase()})</span> : ""}</td>
                  <td><span className={`kbd ${e.action.includes("DENIED") ? "text-red-700" : ""}`}>{e.action}</span></td>
                  <td className="text-xs text-muted">{e.entityType}</td>
                  <td className="font-mono text-[11px] text-muted">{e.hash}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {nextBefore && (
            <div className="p-2 border-t border-line text-center">
              <button className="btn btn-ghost" disabled={moreBusy} onClick={() => void loadMore()}>{moreBusy ? "Loading…" : "Load older entries"}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
