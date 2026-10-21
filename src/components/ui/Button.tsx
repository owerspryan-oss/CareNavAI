import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { ChevronRightIcon } from "./icons";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "link";

interface CommonProps {
  /** primary = coral CTA, secondary = teal, tertiary = muted pill (Back), link = teal text (Start again). */
  variant?: ButtonVariant;
  /** Large two-line journey button (landing screen). */
  size?: "default" | "large";
  fullWidth?: boolean;
  /** Icon in a badge before the label. */
  leadingIcon?: ReactNode;
  /** Chevron after the label, for actions that move forward. */
  trailingChevron?: boolean;
  children: ReactNode;
}

function classes({ variant = "primary", size = "default", fullWidth }: CommonProps, extra?: string) {
  return [styles.button, styles[variant], size === "large" && styles.large, fullWidth && styles.fullWidth, extra]
    .filter(Boolean)
    .join(" ");
}

function Content({ leadingIcon, trailingChevron, children }: CommonProps) {
  return (
    <>
      {leadingIcon && <span className={styles.leadingIcon}>{leadingIcon}</span>}
      <span className={styles.label}>{children}</span>
      {trailingChevron && <ChevronRightIcon className={styles.chevron} />}
    </>
  );
}

export interface ButtonProps extends CommonProps, Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Shows a spinner in place of the label, same footprint (no layout shift), and blocks presses. */
  loading?: boolean;
  /** Announced to screen readers while loading. */
  loadingLabel?: string;
}

export function Button({
  variant,
  size,
  fullWidth,
  leadingIcon,
  trailingChevron,
  loading = false,
  loadingLabel = "Please wait",
  className,
  children,
  type = "button",
  disabled,
  onClick,
  ...rest
}: ButtonProps) {
  const common = { variant, size, fullWidth, leadingIcon, trailingChevron, children };
  return (
    <button
      {...rest}
      type={type}
      className={classes(common, className)}
      disabled={disabled}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      data-loading={loading || undefined}
      onClick={loading ? (e) => e.preventDefault() : onClick}
    >
      <span className={styles.content}>
        <Content {...common} />
      </span>
      {loading && (
        <span className={styles.spinnerWrap}>
          <span className={styles.spinner} aria-hidden="true" />
          <span className="sr-only">{loadingLabel}</span>
        </span>
      )}
    </button>
  );
}

export interface ButtonLinkProps extends CommonProps, Omit<ComponentProps<typeof Link>, "children"> {}

/** Same visuals as Button, for navigation. */
export function ButtonLink({
  variant,
  size,
  fullWidth,
  leadingIcon,
  trailingChevron,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  const common = { variant, size, fullWidth, leadingIcon, trailingChevron, children };
  return (
    <Link {...rest} className={classes(common, className)}>
      <span className={styles.content}>
        <Content {...common} />
      </span>
    </Link>
  );
}
