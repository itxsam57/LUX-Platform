import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { normalizeNextPath } from "@/lib/auth/policy";
import { getPublicAppUrl, getPublicSupabaseConfig } from "@/lib/supabase/env";

const EMAIL_OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

type CookieMutation = {
  name: string;
  value: string;
  options: CookieOptions;
};

function redirectOrigin(request: NextRequest): string {
  const configured = new URL(getPublicAppUrl());
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host");
  const protocol = forwardedProtocol || request.nextUrl.protocol.replace(":", "");

  if (!host || (protocol !== "http" && protocol !== "https")) return configured.origin;

  try {
    const incoming = new URL(`${protocol}://${host}`);
    const loopback = incoming.hostname === "localhost"
      || incoming.hostname === "127.0.0.1"
      || incoming.hostname === "[::1]";
    const permittedDevelopmentOrigin = process.env.NODE_ENV !== "production"
      && loopback
      && incoming.port === configured.port;

    return incoming.host === configured.host || permittedDevelopmentOrigin
      ? incoming.origin
      : configured.origin;
  } catch {
    return configured.origin;
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const nextPath = normalizeNextPath(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const rawType = url.searchParams.get("type");
  const isRecovery = rawType === "recovery" || nextPath === "/auth/update-password";
  const origin = redirectOrigin(request);

  try {
    const pendingCookies = new Map<string, CookieMutation>();
    const { url: supabaseUrl, publishableKey } = getPublicSupabaseConfig();
    const supabase = createServerClient(supabaseUrl, publishableKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const cookie of cookiesToSet) pendingCookies.set(cookie.name, cookie);
        },
      },
    });

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
      auth_event_type: isRecovery ? "password_recovery_requested" : "email_verified",
      auth_outcome: "success",
    });

    const response = NextResponse.redirect(new URL(nextPath, origin));
    for (const { name, value, options } of pendingCookies.values()) {
      response.cookies.set(name, value, options);
    }
    return response;
  } catch {
    const errorUrl = new URL("/auth/login", origin);
    errorUrl.searchParams.set("error", "invalid-or-expired-link");
    return NextResponse.redirect(errorUrl);
  }
}
