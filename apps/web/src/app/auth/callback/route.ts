import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { normalizeNextPath } from "@/lib/auth/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const EMAIL_OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const nextPath = normalizeNextPath(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const rawType = url.searchParams.get("type");

  try {
    const supabase = await createServerSupabaseClient();
    let error: Error | null = null;

    if (code) {
      const exchange = await supabase.auth.exchangeCodeForSession(code);
      error = exchange.error;
    } else if (tokenHash && rawType && EMAIL_OTP_TYPES.has(rawType as EmailOtpType)) {
      const verification = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: rawType as EmailOtpType,
      });
      error = verification.error;
    } else {
      error = new Error("Missing authentication callback parameters.");
    }

    if (error) throw error;

    await supabase.rpc("record_auth_event", {
      auth_event_type: rawType === "recovery" ? "password_recovery_requested" : "email_verified",
      auth_outcome: "success",
    });

    return NextResponse.redirect(new URL(nextPath, request.url));
  } catch {
    const errorUrl = new URL("/auth/login", request.url);
    errorUrl.searchParams.set("error", "invalid-or-expired-link");
    return NextResponse.redirect(errorUrl);
  }
}
