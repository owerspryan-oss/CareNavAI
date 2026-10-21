import type { z } from "zod";
import type { SafetyLevel, UrgentMessageKey } from "@/lib/ai/schemas";
import { env } from "@/lib/config/env";
import disclaimersEn from "../../../content/disclaimers/en.json";
import serviceRoutesEn from "../../../content/service-routes/en.json";
import urgentEn from "../../../content/urgent-messages/en.json";
import urgentHi from "../../../content/urgent-messages/hi.json";
import urgentJam from "../../../content/urgent-messages/jam.json";
import urgentPcm from "../../../content/urgent-messages/pcm.json";
import urgentTw from "../../../content/urgent-messages/tw.json";
import {
  disclaimersFileSchema,
  serviceRoutesFileSchema,
  urgentMessagesFileSchema,
  type DisclaimersFile,
  type ServiceRoutesFile,
  type UrgentMessage,
  type UrgentMessagesFile,
} from "./schemas";

export * from "./schemas";

// Static, pre-approved content (ADR-004). Files are bundled at build time and
// validated on first use. English is the master and the fallback for any
// language without its own file (AC-05.8).

/** Raw file registry, keyed by language code. Add a language by adding its import here. */
export const CONTENT_FILES = {
  urgentMessages: { en: urgentEn, jam: urgentJam, pcm: urgentPcm, tw: urgentTw, hi: urgentHi },
  serviceRoutes: { en: serviceRoutesEn },
  disclaimers: { en: disclaimersEn },
} as const satisfies Record<string, { en: unknown } & Record<string, unknown>>;

type Kind = keyof typeof CONTENT_FILES;
const SCHEMAS = {
  urgentMessages: urgentMessagesFileSchema,
  serviceRoutes: serviceRoutesFileSchema,
  disclaimers: disclaimersFileSchema,
} satisfies Record<Kind, z.ZodType>;

type Parsed = { urgentMessages: UrgentMessagesFile; serviceRoutes: ServiceRoutesFile; disclaimers: DisclaimersFile };

const cache = new Map<string, unknown>();

/** "en-GB" -> "en", "PCM" -> "pcm". Unknown or empty input gives "en". */
export function contentLanguage(lang: string | null | undefined): string {
  const primary = (lang ?? "").trim().toLowerCase().split(/[-_]/)[0];
  return primary || "en";
}

export interface Served<T> {
  content: T;
  /** The language actually served; "en" when the requested language has no file. */
  servedLanguage: string;
  fellBack: boolean;
}

function load<K extends Kind>(kind: K, lang: string | null | undefined): Served<Parsed[K]> {
  const requested = contentLanguage(lang);
  const files: Record<string, unknown> = CONTENT_FILES[kind];
  const servedLanguage = Object.hasOwn(files, requested) ? requested : "en";
  const key = `${kind}:${servedLanguage}`;
  if (!cache.has(key)) cache.set(key, SCHEMAS[kind].parse(files[servedLanguage]));
  return { content: cache.get(key) as Parsed[K], servedLanguage, fellBack: servedLanguage !== requested };
}

/**
 * Which static message a gate level shows. `uncertain` uses the `urgent` message
 * (PRD 9.2). `clear` has no message.
 */
export function urgentMessageKeyFor(level: SafetyLevel): UrgentMessageKey | null {
  if (level === "clear") return null;
  if (level === "emergency" || level === "crisis") return level;
  return "urgent";
}

export interface ServedUrgentMessage {
  key: UrgentMessageKey;
  servedLanguage: string;
  fellBack: boolean;
  /** False until a native speaker and the clinical adviser have signed the file off. */
  reviewed: boolean;
  status: UrgentMessagesFile["status"];
  message: UrgentMessage;
  labels: UrgentMessagesFile["labels"];
}

/**
 * The static urgent message for a non-clear gate level, in `lang` if a file
 * exists, else English. Any level other than emergency/crisis gets the
 * `urgent` message, so an unexpected value still routes up.
 */
export function getUrgentMessage(level: Exclude<SafetyLevel, "clear">, lang: string | null | undefined): ServedUrgentMessage {
  const key = urgentMessageKeyFor(level) ?? "urgent";
  const { content, servedLanguage, fellBack } = load("urgentMessages", lang);
  return {
    key,
    servedLanguage,
    fellBack,
    reviewed: content.reviewed,
    status: content.status,
    message: content.messages[key],
    labels: content.labels,
  };
}

export function getServiceRoutes(lang: string | null | undefined): Served<ServiceRoutesFile> {
  return load("serviceRoutes", lang);
}

export function getDisclaimers(lang: string | null | undefined): Served<DisclaimersFile> {
  return load("disclaimers", lang);
}

/** FR-29 / v0.3 A10: the DRAFT label is on unless SHOW_DRAFT_LABEL=false. */
export function draftLabelEnabled(): boolean {
  return env().SHOW_DRAFT_LABEL;
}
