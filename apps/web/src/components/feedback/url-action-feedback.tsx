"use client";

import { useSearchParams } from "next/navigation";

type UrlActionFeedbackProps = {
  notices: Record<string, string>;
  errors?: Record<string, string>;
  genericError?: string;
};

export function UrlActionFeedback({ notices, errors = {}, genericError }: UrlActionFeedbackProps) {
  const searchParams = useSearchParams();
  const errorKey = searchParams.get("error");
  if (errorKey) {
    const message = errors[errorKey] ?? genericError;
    return message ? <p className="studio-error" role="alert">{message}</p> : null;
  }

  const noticeKey = searchParams.get("notice");
  const message = noticeKey ? notices[noticeKey] : undefined;
  return message ? <p className="studio-notice" role="status">{message}</p> : null;
}
