// src/lib/upload.ts
// NOTE:
// - Upload tetap langsung ke worker (VITE_UPLOAD_WORKER_URL).
// - Delete kini memanggil Supabase Edge Function `delete-attachment`
//   sebagai proxy supaya DELETE_TOKEN tidak terekspos ke client.

import { supabase } from "@/integrations/supabase/client";

const WORKER_URL = import.meta.env.VITE_UPLOAD_WORKER_URL;

// uploadFileToWorker: upload dari client -> worker (tetap dipakai)
export async function uploadFileToWorker(file: File, path?: string) {
  const workerUrl = WORKER_URL;
  if (!workerUrl) throw new Error("VITE_UPLOAD_WORKER_URL not set");

  const form = new FormData();
  form.append("file", file);
  if (path) form.append("path", path);

  const resp = await fetch(workerUrl.replace(/\/+$/, "") + "/upload", {
    method: "POST",
    body: form,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Upload failed: ${resp.status} ${text}`);
  }
  const body = await resp.json();
  return body as { ok?: boolean; key?: string; [k: string]: any };
}

/**
 * deleteFileFromWorker
 * - Memanggil Supabase Edge Function 'delete-attachment' sehingga token R2 tidak pernah di-bundle ke client.
 * - Menangani beberapa bentuk response yang mungkin dikembalikan supabase.functions.invoke.
 */
export async function deleteFileFromWorker(key: string) {
  if (!key) throw new Error("Missing key to delete");

  // NOTE: supabase.functions.invoke memiliki typing yang tidak menyediakan .ok/.text/.json,
  // jadi kita cast ke any dan periksa struktur yang umum: error / status / data
  const res = await supabase.functions.invoke("delete-attachment", {
    method: "POST",
    body: JSON.stringify({ key }),
  });

  const anyRes = res as any;

  // Jika supabase sdk mengembalikan object dengan .error
  if (anyRes?.error) {
    const errMsg =
      anyRes.error?.message ??
      (typeof anyRes.error === "string" ? anyRes.error : JSON.stringify(anyRes.error));
    throw new Error(`Server delete failed: ${errMsg}`);
  }

  // Jika supabase sdk mengembalikan status numeric (non-2xx)
  if (typeof anyRes?.status === "number" && (anyRes.status < 200 || anyRes.status >= 300)) {
    const payload = anyRes?.data ?? anyRes;
    throw new Error(`Server delete failed: status=${anyRes.status} detail=${JSON.stringify(payload)}`);
  }

  // Jika ada data ter-parse, kembalikan itu, atau kembalikan whole response sebagai fallback
  if (anyRes?.data !== undefined) return anyRes.data;
  return anyRes;
}
