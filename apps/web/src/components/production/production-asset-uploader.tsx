"use client";

import { useRef, useState, type FormEvent } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type UploadSession = {
  providerKey: string;
  objectPath: string;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string,string>;
  expiresAt: string;
  protocol: "supabase_signed" | "put";
  token?: string;
};

async function sha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256",await file.arrayBuffer());
  return Array.from(new Uint8Array(digest),(byte)=>byte.toString(16).padStart(2,"0")).join("");
}

function validSession(value: unknown): value is UploadSession {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string,unknown>;
  return typeof row.providerKey === "string"
    && typeof row.objectPath === "string"
    && typeof row.uploadUrl === "string"
    && row.method === "PUT"
    && (row.protocol === "supabase_signed" || row.protocol === "put")
    && typeof row.expiresAt === "string"
    && row.headers !== null && typeof row.headers === "object" && !Array.isArray(row.headers)
    && (row.protocol !== "supabase_signed" || typeof row.token === "string");
}

export function ProductionAssetUploader({ projectPublicId }: { projectPublicId: string }) {
  const inFlight = useRef(false);
  const [message,setMessage] = useState("");
  const [error,setError] = useState("");

  async function cleanup(objectPath: string) {
    try {
      await fetch("/api/storage/production-upload/cleanup",{
        method:"DELETE",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({projectPublicId,objectPath}),
      });
    } catch {
      // Provider lifecycle cleanup remains a server-side concern if best-effort cleanup fails.
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const form=event.currentTarget,data=new FormData(form),file=data.get("file"),kind=String(data.get("kind")??"");
    if (!(file instanceof File) || file.size===0 || !["script","media","evidence"].includes(kind)) {
      setError("Choose a production file and asset type.");
      return;
    }

    inFlight.current=true; setError(""); setMessage("Preparing secure upload…");
    let objectPath: string | null = null;

    try {
      const hash=await sha256(file);
      const sessionResponse=await fetch("/api/storage/production-upload",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({
          projectPublicId,
          fileName:file.name,
          contentType:file.type||"application/octet-stream",
          contentLength:file.size,
        }),
      });
      if (!sessionResponse.ok) throw new Error("upload_session_failed");
      const sessionValue=await sessionResponse.json() as unknown;
      if (!validSession(sessionValue)) throw new Error("invalid_upload_session");
      const session=sessionValue; objectPath=session.objectPath;

      if (session.protocol==="supabase_signed") {
        const supabase=createBrowserSupabaseClient();
        const { error: uploadError }=await supabase.storage.from("production-assets").uploadToSignedUrl(
          session.objectPath,
          session.token!,
          file,
          { upsert:false,cacheControl:"0",contentType:file.type||"application/octet-stream" },
        );
        if (uploadError) throw new Error("upload_failed");
      } else {
        const response=await fetch(session.uploadUrl,{
          method:session.method,
          headers:{...session.headers,"content-type":file.type||"application/octet-stream"},
          body:file,
        });
        if (!response.ok) throw new Error("upload_failed");
      }

      const supabase=createBrowserSupabaseClient();
      const { error: registerError }=await supabase.rpc("register_production_asset",{
        requested_project_public_id:projectPublicId,
        requested_kind:kind,
        requested_object_path:session.objectPath,
        requested_sha256:hash,
      });
      if (registerError) {
        await cleanup(session.objectPath);
        throw new Error("register_failed");
      }

      setMessage(`Private production asset registered through ${session.providerKey} with its SHA-256 hash.`);
      form.reset();
      window.location.reload();
    } catch {
      if (objectPath) await cleanup(objectPath);
      setError("The production asset could not be stored safely.");
      setMessage("");
      inFlight.current=false;
    }
  }

  return (
    <form className="studio-form studio-form--compact" onSubmit={submit} aria-busy={inFlight.current}>
      <label>Asset type<select name="kind" defaultValue="media"><option value="media">Media</option><option value="script">Script</option><option value="evidence">Evidence</option></select></label>
      <label>Private file<input name="file" type="file" required /></label>
      <button className="studio-button studio-button--primary" type="submit">Upload private asset</button>
      {message ? <p className="studio-notice" role="status">{message}</p> : null}
      {error ? <p className="studio-error" role="alert">{error}</p> : null}
    </form>
  );
}
