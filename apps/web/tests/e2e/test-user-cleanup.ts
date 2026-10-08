import type { SupabaseClient } from "@supabase/supabase-js";

export async function cleanupTestUser(admin: SupabaseClient, userId: string) {
  // CI runs against a disposable Supabase stack. LUX deliberately keeps immutable
  // audit/financial/consent history, so destructive auth-user cleanup can be blocked
  // by retained references and must never turn a completed workflow into a false failure.
  if (process.env.CI) return;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (!error) return;
    } catch {
      // Best-effort cleanup only; the test database is disposable.
    }
    await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
  }
}
