import fs from "node:fs";
import path from "node:path";
import type { z } from "zod";
import type { SafetyLevel, UrgentMessageKey } from "@/lib/ai/schemas";
import { env } from "@/lib/config/env";
import { log } from "@/lib/log/logger";
import { urgentMessageKeyFor, type UrgentContent } from "@/lib/safety/urgent-content";
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
export { urgentMessageKeyFor };

// Static, pre-approved content (ADR-004). Files are read from content/<kind>/<lang>.json
// at run time and validated on first use, so adding a language needs only a content file,
// no code change (AC-28.4). English is the master and the fallback for any language
// without its own file (AC-05.8). Server-only: this module reads the file system; client
// components get urgent content as props built by getUrgentContent.

/** Content directory per kind, under <project root>/content. */
const CONTENT_DIRS = {
  urgentMessages: "urgent-messages",
  serviceRoutes: "service-routes",
  disclaimers: "disclaimers",
} as const;

type Kind = keyof typeof CONTENT_DIRS;
const contentDir = (kind: Kind) => path.join(process.cwd(), "content", CONTENT_DIRS[kind]);

const languagesCache = new Map<Kind, readonly string[]>();

/** Language codes that have a file of this kind (the <lang> in content/<kind>/<lang>.json). */
export function contentLanguages(kind: Kind): readonly string[] {
  let langs = languagesCache.get(kind);
  if (!langs) {
    langs = fs
      .readdirSync(contentDir(kind))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -".json".length))
      .sort();
    languagesCache.set(kind, langs);
  }
  return langs;
}

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

/** Read and validate one file. Throws if it is unreadable, malformed, or names another language. */
function parseFile<K extends Kind>(kind: K, lang: string): Parsed[K] {
  const raw: unknown = JSON.parse(fs.readFileSync(path.join(contentDir(kind), `${lang}.json`), "utf8"));
  const parsed = SCHEMAS[kind].parse(raw) as Parsed[K];
  if (parsed.language !== lang) throw new Error(`content file ${CONTENT_DIRS[kind]}/${lang}.json names language ${parsed.language}`);
  return parsed;
}

function load<K extends Kind>(kind: K, lang: string | null | undefined): Served<Parsed[K]> {
  const requested = contentLanguage(lang);
  const servedLanguage = contentLanguages(kind).includes(requested) ? requested : "en";
  const key = `${kind}:${servedLanguage}`;
  if (!cache.has(key)) {
    try {
      cache.set(key, parseFile(kind, servedLanguage));
    } catch (err) {
      // The English master must load: a broken master is a deploy bug, so it throws.
      if (servedLanguage === "en") throw err;
      // A broken translation must never stop the static message being shown: serve English
      // and say so (fellBack), and record it without any file content.
      log.error({ route: "content", step: kind, status: "invalid_content_file", languageCode: servedLanguage, errorType: "content_invalid" });
      cache.set(key, null);
    }
  }
  if (cache.get(key) === null) return { ...load(kind, "en"), fellBack: true };
  return { content: cache.get(key) as Parsed[K], servedLanguage, fellBack: servedLanguage !== requested };
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

/**
 * Serialisable urgent-screen content for one interface language (FR-05, FR-24, FR-29), built on the
 * server so client components never import server config. Pass it down as a prop.
 * Language seam: callers pass the interface language; unknown languages fall back to English.
 */
export function getUrgentContent(lang: string | null | undefined): UrgentContent {
  const { content, servedLanguage } = load("urgentMessages", lang);
  return {
    mode: env().URGENT_MODE,
    showDraftLabel: draftLabelEnabled(),
    draftLabel: getDisclaimers(lang).content.draftLabel,
    language: servedLanguage,
    messages: content.messages,
    labels: content.labels,
  };
}
