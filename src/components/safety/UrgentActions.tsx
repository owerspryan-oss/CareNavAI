import { ButtonLink } from "@/components/ui/Button";
import { ExternalLinkIcon, PhoneIcon } from "@/components/ui/icons";
import type { UrgentMessage } from "@/lib/content/schemas";

/**
 * Static call/web actions from the urgent-message file, as real links: tel: dials, https opens a new tab.
 * The first action is the primary (coral) one; the file orders actions by priority.
 */
export function UrgentActions({
  actions,
  className,
  compact = false,
}: {
  actions: UrgentMessage["actions"];
  className?: string;
  /** Banner use: every action is a muted pill, so nothing outshouts the result's own buttons. */
  compact?: boolean;
}) {
  return (
    <ul className={className} role="list">
      {actions.map((a, i) => {
        const web = a.href.startsWith("https://");
        return (
          <li key={a.id}>
            <ButtonLink
              href={a.href}
              prefetch={false}
              variant={!compact && i === 0 ? "primary" : "tertiary"}
              fullWidth
              data-action={a.id}
              leadingIcon={web ? <ExternalLinkIcon /> : <PhoneIcon />}
              {...(web ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
              {a.label}
            </ButtonLink>
          </li>
        );
      })}
    </ul>
  );
}
