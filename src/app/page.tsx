import { ButtonLink } from "@/components/ui/Button";
import { CalendarIcon, DocumentIcon, LockIcon } from "@/components/ui/icons";
import { LogoMark } from "@/components/ui/LogoMark";
import styles from "./page.module.css";

/** Landing screen (agreed mockup, screen 1): the two journeys, then the guest-mode caption. */
export default function Home() {
  return (
    <main className={styles.landing}>
      <div className={styles.top}>
        <p className={styles.brand}>
          <LogoMark />
          <span>
            CareNav <span className={styles.brandAi}>AI</span>
          </span>
        </p>
        <h1 className={styles.headline}>Let&rsquo;s get ready for your appointment.</h1>
        <p className={styles.lead}>Clear information. Better conversations. You&rsquo;ve got this.</p>
      </div>

      <div className={styles.bottom}>
        <nav aria-label="Choose what you need" className={styles.actions}>
          <ButtonLink href="/prepare" variant="primary" size="large" fullWidth trailingChevron leadingIcon={<CalendarIcon />}>
            Prepare for my appointment
          </ButtonLink>
          <ButtonLink
            href="/understand"
            variant="secondary"
            size="large"
            fullWidth
            trailingChevron
            leadingIcon={<DocumentIcon />}
          >
            Understand what I was told
          </ButtonLink>
        </nav>

        {/* Language picker slot — epic-language (FR-27) renders its picker here, between the journeys and the caption. */}

        <p className={styles.guest}>
          <LockIcon className={styles.guestIcon} />
          Guest mode — nothing is saved.
        </p>
      </div>
    </main>
  );
}
