// src/lib/storage.ts
export const R2_PUBLIC_BASE = import.meta.env.VITE_R2_BASE || "https://630e8a1fd147aedacd05270fc7c9ddcd.r2.cloudflarestorage.com";
export const R2_BUCKET = import.meta.env.VITE_R2_BUCKET || "report-files";

/**
 * FILE_SERVE_BASE should point to the Worker files endpoint, e.g.
 * VITE_FILE_SERVE_BASE=https://r2-upload-worker.<...>.workers.dev/files
 *
 * If not provided, we derive it from VITE_UPLOAD_WORKER_URL + /files
 */
const uploadWorker = import.meta.env.VITE_UPLOAD_WORKER_URL || "";
export const FILE_SERVE_BASE = import.meta.env.VITE_FILE_SERVE_BASE || (uploadWorker.replace(/\/+$/, "") + "/files");

/** Build the worker file-serv URL for a given storage key (encode segments only) */
export function fileServeUrl(storagePath?: string | null) {
  if (!storagePath) return "";
  const segments = String(storagePath).replace(/^\/+/, "").split("/");
  const encoded = segments.map((s) => encodeURIComponent(s)).join("/");
  return `${FILE_SERVE_BASE}/${encoded}`;
}
