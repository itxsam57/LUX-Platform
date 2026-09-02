"use client";

import {
  useRef,
  useState,
  type FormEvent,
  type FormHTMLAttributes,
  type ReactNode,
} from "react";
import type { NavigationActionResult } from "@/lib/actions/navigation";

type NavigationAction = (formData: FormData) => Promise<NavigationActionResult>;
type NavigationActionFormProps = Omit<FormHTMLAttributes<HTMLFormElement>, "action" | "children" | "onSubmit"> & {
  action: NavigationAction;
  children: ReactNode;
};

function safeInternalDestination(destination: string) {
  return destination.startsWith("/") && !destination.startsWith("//");
}

export function NavigationActionForm({
  action,
  children,
  className,
  ...formAttributes
}: NavigationActionFormProps) {
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;

    const formData = new FormData(event.currentTarget);
    inFlight.current = true;
    setPending(true);
    setFailure("");

    try {
      const result = await action(formData);
      if (!safeInternalDestination(result.destination)) {
        throw new Error("Unsafe action destination");
      }
      window.location.replace(result.destination);
    } catch {
      inFlight.current = false;
      setPending(false);
      setFailure("The requested action could not be completed safely.");
    }
  }

  return (
    <form {...formAttributes} onSubmit={submit} className={className} aria-busy={pending}>
      {children}
      {failure ? <p className="studio-error" role="alert">{failure}</p> : null}
    </form>
  );
}
