import { randomBytes } from "node:crypto";
import QRCode from "qrcode";

/** Random, unguessable export reference (AC-10.3): 128 bits, base64url, 22 characters. No patient information. */
export function newRef(): string {
  return randomBytes(16).toString("base64url");
}

export const REF_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/** The clinician feedback form for one export: `${PUBLIC_BASE_URL}/c/<ref>`. */
export function clinicianUrl(baseUrl: string, ref: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/c/${ref}`;
}

/** QR code as SVG markup, generated offline. */
export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0B1216", light: "#FFFFFF" } });
}
