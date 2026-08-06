"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  forgotPasswordAction,
  loginAction,
  signUpAction,
  updatePasswordAction,
} from "@/app/auth/actions";
import { Button, Input } from "@/components/ui/primitives";
import {
  INITIAL_AUTH_STATE,
  type AuthActionState,
} from "@/lib/auth/policy";

type AuthMode = "login" | "sign-up" | "forgot-password" | "update-password";
type AuthAction = (state: AuthActionState, formData: FormData) => Promise<AuthActionState>;

const ACTIONS: Record<AuthMode, AuthAction> = {
  login: loginAction,
  "sign-up": signUpAction,
  "forgot-password": forgotPasswordAction,
  "update-password": updatePasswordAction,
};

const COPY: Record<AuthMode, { eyebrow: string; title: string; description: string; submit: string }> = {
  login: {
    eyebrow: "Secure access",
    title: "Sign in",
    description: "Enter the verified email and password attached to your LUX account.",
    submit: "Sign in",
  },
  "sign-up": {
    eyebrow: "Adult account",
    title: "Create an account",
    description: "Create one account first. Adult access and optional workspaces are activated separately.",
    submit: "Create account",
  },
  "forgot-password": {
    eyebrow: "Account recovery",
    title: "Reset your password",
    description: "We send the same response whether or not an email is registered.",
    submit: "Send recovery link",
  },
  "update-password": {
    eyebrow: "Account recovery",
    title: "Choose a new password",
    description: "Use at least 12 characters with uppercase, lowercase, and a number.",
    submit: "Update password",
  },
};

export function AuthForm({ mode, next = "/workspace" }: { mode: AuthMode; next?: string }) {
  const [state, formAction, pending] = useActionState(ACTIONS[mode], INITIAL_AUTH_STATE);
  const [email, setEmail] = useState("");
  const copy = COPY[mode];
  const showsEmail = mode !== "update-password";
  const showsPassword = mode === "login" || mode === "sign-up" || mode === "update-password";

  return (
    <section className="auth-card" aria-labelledby="auth-title">
      <span className="eyebrow">{copy.eyebrow}</span>
      <h1 id="auth-title">{copy.title}</h1>
      <p className="muted-copy">{copy.description}</p>

      <form action={formAction} className="auth-form" noValidate>
        <input type="hidden" name="next" value={next} />
        {showsEmail ? (
          <Input
            id={`${mode}-email`}
            name="email"
            label="Email address"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
            error={state.fieldErrors?.email}
          />
        ) : null}
        {showsPassword ? (
          <Input
            id={`${mode}-password`}
            name="password"
            label={mode === "update-password" ? "New password" : "Password"}
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={12}
            maxLength={128}
            required
            error={state.fieldErrors?.password}
          />
        ) : null}

        {state.message ? (
          <div
            className={state.status === "success" ? "auth-message auth-message--success" : "auth-message auth-message--error"}
            role={state.status === "error" ? "alert" : "status"}
            aria-live="polite"
            data-testid="auth-form-message"
          >
            {state.message}
          </div>
        ) : null}

        <Button type="submit" size="large" loading={pending} className="auth-submit">
          {copy.submit}
        </Button>
      </form>

      <div className="auth-links">
        {mode === "login" ? (
          <>
            <Link href="/auth/forgot-password">Forgot password?</Link>
            <Link href="/auth/sign-up">Create account</Link>
          </>
        ) : null}
        {mode === "sign-up" ? <Link href="/auth/login">Already have an account?</Link> : null}
        {mode === "forgot-password" || mode === "update-password" ? (
          <Link href="/auth/login">Return to sign in</Link>
        ) : null}
      </div>
    </section>
  );
}
