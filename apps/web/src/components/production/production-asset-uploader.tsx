"use client";

import { useRef, useState, type FormEvent } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

function safeFileName(name: string) {
  const cleaned = name.normalize("NFKC").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-120);
  return cleaned || "production-file.bin";
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function ProductionAssetUploader({ projectPublicId }: { projectPublicId: string }) {
  const inFlight = useRef(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (inFlight.current) return;
    const form = event.currentTarget, data = new FormData(form), file = data.get("file"), kind = String(data.get("kind") ?? "");
    if (!(file instanceof File) || file.size === 0 || !["script", "media", "evidence"].includes(kind)) { setError("Choose a production file and asset type."); return; }
    inFlight.current = true; setError(""); setMessage("Preparing secure upload…");
    const objectPath = `${projectPublicId}/${crypto.randomUUID()}/${safeFileName(file.name)}`;
    try {
      const hash = await sha256(file); const supabase = createBrowserSupabaseClient();
      const { error: uploadError } = await supabase.storage.from("production-assets").upload(objectPath, file, { upsert: false, cacheControl: "0", contentType: file.type || "application/octet-stream" });
      if (uploadError) throw new Error("upload_failed");
      const { error: registerError } = await supabase.rpc("register_production_asset", { requested_project_public_id: projectPublicId, requested_kind: kind, requested_object_path: objectPath, requested_sha256: hash });
      if (registerError) { await supabase.storage.from("production-assets").remove([objectPath]); throw new Error("register_failed"); }
      setMessage("Private production asset registered with its SHA-256 hash."); form.reset(); window.location.reload();
    } catch { setError("The production asset could not be stored safely."); setMessage(""); inFlight.current = false; }
  }
  return <form className="studio-form studio-form--compact" onSubmit={submit} aria-busy={inFlight.current}>
    <label>Asset type<select name="kind" defaultValue="media"><option value="media">Media</option><option value="script">Script</option><option value="evidence">Evidence</option></select></label>
    <label>Private file<input name="file" type="file" required/></label>
    <button className="studio-button studio-button--primary" type="submit">Upload private asset</button>
    {message ? <p className="studio-notice" role="status">{message}</p> : null}{error ? <p className="studio-error" role="alert">{error}</p> : null}
  </form>;
}
