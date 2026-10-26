"use client";

import { useCallback, useEffect, useState } from "react";
import { useData } from "./data";
import { PRIVATE_BUCKET, PUBLIC_BUCKET, extOf, type CertKind, type Certificate } from "./certificates";
import { getSupabase } from "./supabase/client";

const COLS = "id,kind,status,private_path,redacted_path,public_path,consent_at,consent_note,sort_order,published_at,created_at";

function msg(e: unknown): string {
  return e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "Noma'lum xatolik";
}

/** Admin-side certificate management (owner-only by RLS; storage folders are `<owner id>/...`). */
export function useCertificates() {
  const { notify } = useData();
  const [items, setItems] = useState<Certificate[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const { data, error: err } = await getSupabase().from("certificates").select(COLS).order("created_at", { ascending: false });
    if (err) {
      setError(msg(err));
      setStatus("error");
      return;
    }
    setItems(((data ?? []) as Certificate[]).sort((a, b) => b.created_at.localeCompare(a.created_at)));
    setError(null);
    setStatus("ready");
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const fail = useCallback(
    (e: unknown, what: string) => {
      notify(`${what}: ${msg(e)}`, { kind: "error" });
      return false as const;
    },
    [notify],
  );

  const ownerId = useCallback(async (): Promise<string | null> => {
    const { data } = await getSupabase().auth.getUser();
    return data.user?.id ?? null;
  }, []);

  const signedUrl = useCallback(async (path: string): Promise<string | null> => {
    const { data, error: err } = await getSupabase().storage.from(PRIVATE_BUCKET).createSignedUrl(path, 3600);
    return err || !data ? null : data.signedUrl;
  }, []);

  /** New draft: original (private) + flattened redacted copy (private). Nothing is public yet. */
  const create = useCallback(
    async (kind: CertKind, original: File, redacted: Blob) => {
      const uid = await ownerId();
      if (!uid) return fail({ message: "Kirish talab qilinadi" }, "Sertifikat saqlanmadi");
      const sb = getSupabase();
      const ins = await sb.from("certificates").insert({ kind }).select("id").single();
      const id = (ins.data as { id: string } | null)?.id;
      if (ins.error || !id) return fail(ins.error, "Sertifikat saqlanmadi");
      const priv = `${uid}/${id}/original.${extOf(original)}`;
      const red = `${uid}/${id}/redacted.jpg`;
      const up1 = await sb.storage.from(PRIVATE_BUCKET).upload(priv, original, { contentType: original.type, upsert: true });
      const up2 = up1.error ? null : await sb.storage.from(PRIVATE_BUCKET).upload(red, redacted, { contentType: "image/jpeg", upsert: true });
      const upd = up1.error || !up2 || up2.error ? null : await sb.from("certificates").update({ private_path: priv, redacted_path: red, updated_at: new Date().toISOString() }).eq("id", id);
      if (!upd || upd.error) {
        // roll back what was written so no orphan files / empty rows stay behind
        await sb.storage.from(PRIVATE_BUCKET).remove([priv, red]);
        await sb.from("certificates").delete().eq("id", id);
        return fail(up1.error ?? up2?.error ?? upd?.error, "Sertifikat saqlanmadi");
      }
      await reload();
      return true;
    },
    [ownerId, fail, reload],
  );

  const setKind = useCallback(
    async (id: string, kind: CertKind) => {
      const { error: err } = await getSupabase().from("certificates").update({ kind, updated_at: new Date().toISOString() }).eq("id", id);
      if (err) return fail(err, "Tur o'zgarmadi");
      await reload();
      return true;
    },
    [fail, reload],
  );

  /** Replace the redacted copy (only while not published, so the public image never changes silently). */
  const replaceRedacted = useCallback(
    async (c: Certificate, redacted: Blob) => {
      if (c.status === "published") return fail({ message: "Avval e'londan olib qo'ying" }, "Yashirish o'zgarmadi");
      const uid = await ownerId();
      if (!uid) return fail({ message: "Kirish talab qilinadi" }, "Yashirish o'zgarmadi");
      const red = `${uid}/${c.id}/redacted.jpg`;
      const up = await getSupabase().storage.from(PRIVATE_BUCKET).upload(red, redacted, { contentType: "image/jpeg", upsert: true });
      if (up.error) return fail(up.error, "Yashirish o'zgarmadi");
      const { error: err } = await getSupabase().from("certificates").update({ redacted_path: red, updated_at: new Date().toISOString() }).eq("id", c.id);
      if (err) return fail(err, "Yashirish o'zgarmadi");
      await reload();
      return true;
    },
    [ownerId, fail, reload],
  );

  const removePublicFile = useCallback(
    async (uid: string, id: string) => {
      const { error: err } = await getSupabase().storage.from(PUBLIC_BUCKET).remove([`${uid}/${id}.jpg`]);
      if (err) {
        notify("Ommaviy fayl o'chirilmadi. Qayta urinib ko'ring (fayl hali ochiq bo'lishi mumkin).", { kind: "error" });
        return false;
      }
      return true;
    },
    [notify],
  );

  const publish = useCallback(
    async (c: Certificate, consentNote: string) => {
      const uid = await ownerId();
      if (!uid || !c.redacted_path) return fail({ message: "Yashirilgan nusxa yo'q" }, "E'lon qilinmadi");
      const sb = getSupabase();
      const url = await signedUrl(c.redacted_path);
      if (!url) return fail({ message: "Yashirilgan nusxa topilmadi" }, "E'lon qilinmadi");
      let blob: Blob;
      try {
        blob = await (await fetch(url)).blob();
      } catch (e) {
        return fail(e, "E'lon qilinmadi");
      }
      const pub = `${uid}/${c.id}.jpg`;
      const up = await sb.storage.from(PUBLIC_BUCKET).upload(pub, blob, { contentType: "image/jpeg", upsert: true, cacheControl: "3600" });
      if (up.error) return fail(up.error, "E'lon qilinmadi");
      const now = new Date().toISOString();
      const { error: err } = await sb
        .from("certificates")
        .update({ status: "published", public_path: pub, consent_at: now, consent_note: consentNote.trim() || null, published_at: now, updated_at: now })
        .eq("id", c.id);
      if (err) {
        await removePublicFile(uid, c.id);
        return fail(err, "E'lon qilinmadi");
      }
      await reload();
      return true;
    },
    [ownerId, signedUrl, fail, removePublicFile, reload],
  );

  /** Row first (public RPC stops returning it at once), then the public file. The path is deterministic, so a retry always works. */
  const takeDown = useCallback(
    async (c: Certificate, next: "draft" | "archived") => {
      const uid = await ownerId();
      const { error: err } = await getSupabase()
        .from("certificates")
        .update({ status: next, public_path: null, updated_at: new Date().toISOString() })
        .eq("id", c.id);
      if (err) return fail(err, "Holat o'zgarmadi");
      if (uid && c.public_path) await removePublicFile(uid, c.id);
      await reload();
      return true;
    },
    [ownerId, fail, removePublicFile, reload],
  );

  const restore = useCallback(
    async (c: Certificate) => {
      const { error: err } = await getSupabase().from("certificates").update({ status: "draft", updated_at: new Date().toISOString() }).eq("id", c.id);
      if (err) return fail(err, "Qaytarilmadi");
      await reload();
      return true;
    },
    [fail, reload],
  );

  const remove = useCallback(
    async (c: Certificate) => {
      const uid = await ownerId();
      const { error: err } = await getSupabase().from("certificates").delete().eq("id", c.id);
      if (err) return fail(err, "O'chirilmadi");
      const sb = getSupabase();
      const priv = [c.private_path, c.redacted_path].filter((p): p is string => Boolean(p));
      if (priv.length) await sb.storage.from(PRIVATE_BUCKET).remove(priv);
      if (uid) await sb.storage.from(PUBLIC_BUCKET).remove([`${uid}/${c.id}.jpg`]);
      await reload();
      return true;
    },
    [ownerId, fail, reload],
  );

  return { items, status, error, reload, signedUrl, create, setKind, replaceRedacted, publish, takeDown, restore, remove };
}
