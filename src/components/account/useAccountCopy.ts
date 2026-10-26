import { useMemo } from "react";
import { useUi } from "@/components/i18n/UiProvider";
import { format } from "@/lib/i18n/messages";

/** Account page copy (content/ui/<language>.json, FR-27) plus the formatted strings and error mapping. */
export function useAccountCopy() {
  const { messages } = useUi();
  return useMemo(() => {
    const m = messages.account;
    return {
      ...m,
      signedInAs: (email: string) => format(m.signedIn.as, { email }),
      /** Server error code -> static copy. Unknown codes get the generic line. */
      error: (code: string): string =>
        ({
          invalid_request: m.errors.emailInvalid,
          login_failed: m.signIn.failed,
          password_too_short: m.register.tooShort,
          register_failed: m.register.failed,
          invite_invalid: m.register.inviteInvalid,
          link_invalid: m.verify.invalid,
          rate_limited: m.errors.rateLimited,
          https_required: m.errors.httpsRequired,
        })[code] ?? m.errors.generic,
    };
  }, [messages]);
}
