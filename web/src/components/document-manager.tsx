"use client";
import { useEffect, useState } from "react";
import { useLocale } from "@/components/use-locale";
import { DOCUMENT_TYPES, documentDate, documentErrorKey, documentSize, documentTypeKey, interpolate } from "@/lib/document-i18n";
import type { Locale, MessageKey } from "@/lib/i18n";

type Doc = { id: string; title: string; type: string; mimeType: string; sizeBytes: number; issuedOn: string | null; createdAt: string; sha: string };
type Message = { key: MessageKey<"documents">; values?: Record<string, string>; error?: boolean };

/** Opens a 60-second signed link in a new tab (also used by doctors). */
export async function openDocument(id: string, onFailure?: (code: unknown) => void, locale?: Locale): Promise<string | null> {
  const r = await fetch(`/api/documents/${id}/link`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { onFailure?.(j.code); return j.error ?? "Could not open"; }
  if (locale) {
    const url = new URL(j.url, window.location.origin);
    url.searchParams.set("ui_lang", locale);
    window.open(url.toString(), "_blank", "noopener");
  } else {
    window.open(j.url, "_blank", "noopener");
  }
  return null;
}

/** Patient upload/list/open/delete; the server remains the authorization authority. */
export function DocumentManager() {
  const { locale, t } = useLocale();
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [quota, setQuota] = useState<{ usedBytes: number; maxBytes: number; maxFileBytes: number } | null>(null);
  const [f, setF] = useState({ title: "", type: "LAB_REPORT", issuedOn: "" });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Message | null>(null);
  const [loadError, setLoadError] = useState<MessageKey<"documents"> | null>(null);

  async function load() {
    try {
      const r = await fetch("/api/patient/documents");
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setLoadError(documentErrorKey(j.code)); return; }
      setDocs(j.documents ?? []); setQuota(j.quota ?? null); setLoadError(null);
    } catch { setLoadError("errorNetwork"); }
  }
  useEffect(() => { void (async () => { await load(); })(); }, []);

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) { setMsg({ key: "required", error: true }); return; }
    const form = e.currentTarget;
    setBusy(true); setMsg(null);
    const fd = new FormData();
    fd.set("file", file); fd.set("title", f.title || file.name); fd.set("type", f.type); if (f.issuedOn) fd.set("issuedOn", f.issuedOn);
    try {
      const r = await fetch("/api/patient/documents", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg({ key: documentErrorKey(j.code), error: true }); return; }
      setMsg({ key: "uploaded", values: { hash: String(j.sha256 ?? "").slice(0, 16) } });
      setF({ title: "", type: "LAB_REPORT", issuedOn: "" }); setFile(null); form.reset();
      await load();
    } catch { setMsg({ key: "errorNetwork", error: true }); }
    finally { setBusy(false); }
  }
  async function del(id: string) {
    if (!confirm(t("documents", "confirmDelete"))) return;
    setMsg(null);
    try {
      const r = await fetch(`/api/documents/${encodeURIComponent(id)}`, { method: "DELETE", headers: { "content-type": "application/json" } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg({ key: documentErrorKey(j.code), error: true }); return; }
      setMsg({ key: "deleted" }); await load();
    } catch { setMsg({ key: "errorNetwork", error: true }); }
  }
  async function open(id: string) {
    setMsg(null);
    try {
      let key: MessageKey<"documents"> = "errorGeneric";
      if (await openDocument(id, code => { key = documentErrorKey(code); }, locale)) setMsg({ key, error: true });
    }
    catch { setMsg({ key: "errorNetwork", error: true }); }
  }
  return (
    <section lang={locale} className="grid gap-3" aria-labelledby="patient-documents-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="patient-documents-heading" className="text-sm font-bold uppercase tracking-wide text-muted">{t("documents", "heading")}</h2>
        <span className="kbd">AES-256-GCM</span>
      </div>
      <form onSubmit={upload} className="grid gap-2">
        <div className="grid sm:grid-cols-[1fr_auto] gap-2">
          <label><span className="sr-only">{t("documents", "fileLabel")}</span><input className="max-sm:w-full max-sm:min-w-0 max-sm:max-w-full" type="file" accept="application/pdf,image/jpeg,image/png" required onInvalid={(e) => e.currentTarget.setCustomValidity(t("documents", "required"))} onChange={(e) => { e.currentTarget.setCustomValidity(""); setFile(e.target.files?.[0] ?? null); }} /></label>
          <label><span className="sr-only">{t("documents", "typeLabel")}</span><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{DOCUMENT_TYPES.map(({ value, label }) => <option key={value} value={value}>{t("documents", label)}</option>)}</select></label>
        </div>
        <div className="grid sm:grid-cols-[1fr_auto_auto] gap-2">
          <label><span className="sr-only">{t("documents", "titleLabel")}</span><input placeholder={t("documents", "titlePlaceholder")} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={140} /></label>
          <label><span className="sr-only">{t("documents", "dateLabel")}</span><input type="date" value={f.issuedOn} onChange={(e) => setF({ ...f, issuedOn: e.target.value })} title={t("documents", "dateLabel")} /></label>
          <button className="btn btn-primary" disabled={busy || !file}>{t("documents", busy ? "uploading" : "upload")}</button>
        </div>
        <p className="text-xs text-muted">
          {interpolate(t("documents", "description"), { size: documentSize(quota?.maxFileBytes ?? 3 * 1024 * 1024, locale) })}
          {quota && <> {interpolate(t("documents", "quota"), { used: documentSize(quota.usedBytes, locale), max: documentSize(quota.maxBytes, locale) })}</>}
        </p>
        {msg && <p role={msg.error ? "alert" : "status"} className={`text-sm ${msg.error ? "text-red-700" : "text-ink"}`}>{interpolate(t("documents", msg.key), msg.values ?? {})}</p>}
      </form>
      {loadError ? <div role="alert" className="text-sm text-red-700">{t("documents", loadError)} <button type="button" className="btn btn-ghost" onClick={() => void load()}>{t("documents", "retry")}</button></div>
        : docs === null ? <p role="status" className="text-sm text-muted">{t("documents", "loading")}</p>
        : docs.length === 0 ? <p className="text-sm text-muted">{t("documents", "empty")}</p> : (
        <ul className="divide-y divide-line text-sm">
          {docs.map((d) => (
            <li key={d.id} className="py-2 flex flex-wrap items-center gap-2">
              <span className="kbd">{t("documents", documentTypeKey(d.type))}</span>
              <span className="font-semibold break-all" dir="auto">{d.title}</span>
              <span className="text-xs text-muted">{documentDate(d.issuedOn ?? d.createdAt, locale)} · {documentSize(d.sizeBytes, locale)} · {d.mimeType.split("/")[1]} · sha {d.sha}…</span>
              <span className="ml-auto flex gap-2">
                <button type="button" className="btn btn-ghost" onClick={() => void open(d.id)} aria-label={`${t("documents", "open")}: ${d.title}`}>{t("documents", "open")}</button>
                <button type="button" className="btn btn-ghost text-red-700" onClick={() => void del(d.id)} aria-label={`${t("documents", "delete")}: ${d.title}`}>{t("documents", "delete")}</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
