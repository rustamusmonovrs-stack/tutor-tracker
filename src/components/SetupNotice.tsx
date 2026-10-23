export function SetupNotice() {
  return (
    <div className="center-screen">
      <div className="setup">
        <h1 className="page-title" style={{ marginBottom: 10 }}>
          Supabase is not connected
        </h1>
        <p className="hint" style={{ marginBottom: 12 }}>
          Supabase ulanmagan. Add these two environment variables (in <code>.env.local</code>{" "}
          locally, or Vercel → Settings → Environment Variables), then restart or redeploy:
        </p>
        <p>
          <code>NEXT_PUBLIC_SUPABASE_URL</code>
          <br />
          <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>
        </p>
        <p className="hint" style={{ marginTop: 12 }}>
          Values are in Supabase → Project Settings → API. Use the publishable (anon) key only.
        </p>
      </div>
    </div>
  );
}
