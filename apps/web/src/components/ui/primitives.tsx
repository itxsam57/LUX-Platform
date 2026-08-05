import Link from "next/link";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
type ButtonSize = "small" | "medium" | "large";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function Button({
  variant = "primary",
  size = "medium",
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}) {
  return (
    <button
      className={cx("ui-button", `ui-button--${variant}`, `ui-button--${size}`, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <span className="ui-spinner" aria-hidden="true" /> : null}
      <span>{children}</span>
    </button>
  );
}

export function IconButton({
  label,
  icon,
  variant = "secondary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon: ReactNode;
  variant?: ButtonVariant;
}) {
  return (
    <button
      className={cx("ui-icon-button", `ui-button--${variant}`, className)}
      aria-label={label}
      title={props.title ?? label}
      {...props}
    >
      {icon}
    </button>
  );
}

export function LinkButton({
  href,
  children,
  variant = "primary",
  size = "medium",
  className,
}: {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  return (
    <Link
      className={cx("ui-button", `ui-button--${variant}`, `ui-button--${size}`, className)}
      href={href}
    >
      {children}
    </Link>
  );
}

function FieldFrame({
  id,
  label,
  description,
  error,
  required,
  children,
}: {
  id: string;
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {description ? (
        <p className="ui-field__description" id={descriptionId}>
          {description}
        </p>
      ) : null}
      {children}
      {error ? (
        <p className="ui-field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Input({
  id,
  label,
  description,
  error,
  required,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  description?: string;
  error?: string;
}) {
  const describedBy = [description ? `${id}-description` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <FieldFrame
      id={id}
      label={label}
      description={description}
      error={error}
      required={required}
    >
      <input
        id={id}
        className={cx("ui-input", error && "ui-input--error", className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        required={required}
        {...props}
      />
    </FieldFrame>
  );
}

export function Select({
  id,
  label,
  description,
  error,
  required,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  id: string;
  label: string;
  description?: string;
  error?: string;
}) {
  const describedBy = [description ? `${id}-description` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <FieldFrame
      id={id}
      label={label}
      description={description}
      error={error}
      required={required}
    >
      <select
        id={id}
        className={cx("ui-input", "ui-select", error && "ui-input--error", className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        required={required}
        {...props}
      >
        {children}
      </select>
    </FieldFrame>
  );
}

export function Textarea({
  id,
  label,
  description,
  error,
  required,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  id: string;
  label: string;
  description?: string;
  error?: string;
}) {
  const describedBy = [description ? `${id}-description` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <FieldFrame
      id={id}
      label={label}
      description={description}
      error={error}
      required={required}
    >
      <textarea
        id={id}
        className={cx("ui-input", "ui-textarea", error && "ui-input--error", className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        required={required}
        {...props}
      />
    </FieldFrame>
  );
}

export function Checkbox({
  id,
  label,
  description,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  description?: string;
}) {
  return (
    <label className="ui-choice" htmlFor={id}>
      <input id={id} type="checkbox" {...props} />
      <span className="ui-choice__control" aria-hidden="true" />
      <span>
        <span className="ui-choice__label">{label}</span>
        {description ? <span className="ui-choice__description">{description}</span> : null}
      </span>
    </label>
  );
}

export function Radio({
  id,
  label,
  description,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  description?: string;
}) {
  return (
    <label className="ui-choice" htmlFor={id}>
      <input id={id} type="radio" {...props} />
      <span className="ui-choice__control ui-choice__control--radio" aria-hidden="true" />
      <span>
        <span className="ui-choice__label">{label}</span>
        {description ? <span className="ui-choice__description">{description}</span> : null}
      </span>
    </label>
  );
}

export function Switch({
  id,
  label,
  description,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  description?: string;
}) {
  return (
    <label className="ui-switch" htmlFor={id}>
      <span>
        <span className="ui-choice__label">{label}</span>
        {description ? <span className="ui-choice__description">{description}</span> : null}
      </span>
      <input id={id} type="checkbox" role="switch" {...props} />
      <span className="ui-switch__track" aria-hidden="true">
        <span className="ui-switch__thumb" />
      </span>
    </label>
  );
}

export function FilePicker({
  id,
  label,
  description,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  description?: string;
}) {
  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={id}>
        {label}
      </label>
      {description ? (
        <p className="ui-field__description" id={`${id}-description`}>
          {description}
        </p>
      ) : null}
      <label className="ui-file-picker" htmlFor={id}>
        <span className="ui-file-picker__icon" aria-hidden="true">↑</span>
        <span>
          <strong>Choose a file</strong>
          <small>Selection stays attached only to this field.</small>
        </span>
        <input
          id={id}
          type="file"
          aria-describedby={description ? `${id}-description` : undefined}
          {...props}
        />
      </label>
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "success" | "warning" | "danger" | "info";
}) {
  return <span className={`ui-badge ui-badge--${tone}`}>{children}</span>;
}

export function Status({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "accent" | "success" | "warning" | "danger" | "info";
}) {
  return (
    <span className={`ui-status ui-status--${tone}`}>
      <span className="ui-status__dot" aria-hidden="true" />
      {label}
    </span>
  );
}

export function Avatar({
  initials,
  label,
  size = "medium",
}: {
  initials: string;
  label: string;
  size?: "small" | "medium" | "large";
}) {
  return (
    <span className={`ui-avatar ui-avatar--${size}`} role="img" aria-label={label}>
      {initials.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function Card({
  children,
  className,
  as: Component = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "article" | "div";
}) {
  return <Component className={cx("ui-card", className)}>{children}</Component>;
}

export function Table({
  caption,
  children,
}: {
  caption: string;
  children: ReactNode;
}) {
  return (
    <div className="ui-table-wrap" tabIndex={0} aria-label={`${caption}. Scroll horizontally if needed.`}>
      <table className="ui-table">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange?: (page: number) => void;
}) {
  return (
    <nav className="ui-pagination" aria-label="Pagination">
      <Button
        variant="quiet"
        size="small"
        disabled={currentPage <= 1}
        title={currentPage <= 1 ? "Already on the first page" : "Go to previous page"}
        onClick={() => onPageChange?.(currentPage - 1)}
      >
        Previous
      </Button>
      <span aria-live="polite">
        Page {currentPage} of {totalPages}
      </span>
      <Button
        variant="quiet"
        size="small"
        disabled={currentPage >= totalPages}
        title={currentPage >= totalPages ? "Already on the last page" : "Go to next page"}
        onClick={() => onPageChange?.(currentPage + 1)}
      >
        Next
      </Button>
    </nav>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="ui-state-card">
      <span className="ui-state-card__icon" aria-hidden="true">◇</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function ErrorState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="ui-state-card ui-state-card--error" role="alert">
      <span className="ui-state-card__icon" aria-hidden="true">!</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function Skeleton({ width = "100%", height = 16 }: { width?: string; height?: number }) {
  return <span className="ui-skeleton" style={{ width, height }} aria-hidden="true" />;
}

export function Tooltip({
  id,
  content,
  children,
}: {
  id: string;
  content: string;
  children: ReactNode;
}) {
  return (
    <span className="ui-tooltip" tabIndex={0} aria-describedby={id}>
      {children}
      <span
        className="ui-tooltip__content"
        id={id}
        role="tooltip"
        style={{
          right: 0,
          left: "auto",
          width: "min(240px, calc(100vw - 32px))",
          transform: "translateY(0)",
        }}
      >
        {content}
      </span>
    </span>
  );
}

export function Breadcrumb({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="ui-breadcrumb">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            {item.href ? <Link href={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Stepper({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <ol className="ui-stepper" aria-label="Progress">
      {steps.map((step, index) => {
        const state = index < current ? "complete" : index === current ? "current" : "upcoming";
        return (
          <li className={`ui-stepper__item ui-stepper__item--${state}`} key={step}>
            <span className="ui-stepper__number" aria-hidden="true">
              {index < current ? "✓" : index + 1}
            </span>
            <span aria-current={index === current ? "step" : undefined}>{step}</span>
          </li>
        );
      })}
    </ol>
  );
}
