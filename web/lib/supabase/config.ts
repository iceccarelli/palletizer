// True only when Supabase auth env vars are present. Used to degrade gracefully
// (never crash) before Supabase is configured in the deployment environment.
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
