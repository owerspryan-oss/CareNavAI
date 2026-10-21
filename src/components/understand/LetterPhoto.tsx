"use client";

import { useState } from "react";
import { useUnderstandCopy } from "./copy";
import styles from "./Understand.module.css";

/**
 * The letter photo beside the confirm step and the result (AC-08.6). `url` is an in-memory object
 * URL owned (and revoked) by the flow; the photo is never written to storage.
 */
export function LetterPhoto({ url }: { url: string }) {
  const c = useUnderstandCopy();
  const [large, setLarge] = useState(false);
  return (
    <figure className={styles.photo} data-large={large || undefined}>
      {/* A blob: URL held in memory: next/image would add nothing here. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={c.photo.alt} className={styles.photoImg} />
      <figcaption className={styles.photoCaption}>
        <span>{c.photo.caption}</span>
        <button type="button" className={styles.photoToggle} aria-pressed={large} onClick={() => setLarge(!large)}>
          {large ? c.photo.smaller : c.photo.larger}
        </button>
      </figcaption>
    </figure>
  );
}
