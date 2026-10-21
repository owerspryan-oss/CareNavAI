import Image from "next/image";

/**
 * CareNav icon mark (DESIGN_SYSTEM.md §1): the icon cropped from the transparent
 * `Brand/CareNav AI Heart Chat Logo.png`, served from `public/brand/logo-mark.png`.
 * Decorative: the wordmark next to it carries the name.
 */
export function LogoMark({ size = 44 }: { size?: number }) {
  return <Image src="/brand/logo-mark.png" width={size} height={size} alt="" priority />;
}
