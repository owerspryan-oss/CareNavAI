import { LanguagePicker, UnreviewedNotice } from "@/components/i18n/LanguagePicker";
import { ButtonLink } from "@/components/ui/Button";
import { CalendarIcon, DocumentIcon, LockIcon } from "@/components/ui/icons";
import { LogoMark } from "@/components/ui/LogoMark";
import { requestUiLocale } from "@/lib/i18n/request";
import styles from "./page.module.css";

/** Landing screen (agreed mockup, screen 1): the two journeys, the language picker, then the guest-mode caption. */
export default async function Home() {
  const t = (await requestUiLocale()).messages.common.landing;
  return (
    <main className={styles.landing}>
      <div className={styles.top}>
        <p className={styles.brand}>
          <LogoMark />
          <span>
            CareNav <span className={styles.brandAi}>AI</span>
          </span>
        </p>
        <h1 className={styles.headline}>{t.headline}</h1>
        <p className={styles.lead}>{t.lead}</p>
      </div>

      <div className={styles.bottom}>
        <nav aria-label={t.navLabel} className={styles.actions}>
          <ButtonLink href="/prepare" variant="primary" size="large" fullWidth trailingChevron leadingIcon={<CalendarIcon />}>
            {t.prepare}
          </ButtonLink>
          <ButtonLink
            href="/understand"
            variant="secondary"
            size="large"
            fullWidth
            trailingChevron
            leadingIcon={<DocumentIcon />}
          >
            {t.understand}
          </ButtonLink>
        </nav>

        <div className={styles.language}>
          <LanguagePicker variant="full" />
          <UnreviewedNotice />
        </div>

        <p className={styles.guest}>
          <LockIcon className={styles.guestIcon} />
          {t.guest}
        </p>
      </div>
    </main>
  );
}
