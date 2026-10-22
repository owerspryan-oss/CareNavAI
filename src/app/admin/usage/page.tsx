import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { usageReport, NON_CLEAR_LEVELS } from "@/lib/admin/usage";
import { env } from "@/lib/config/env";
import { db } from "@/lib/db";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Usage · CareNav AI", robots: { index: false, follow: false } };

/** Local-only (FR-25): served only to requests addressed to this machine. A guard, not authentication. */
const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

const gbp = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const LEVEL_LABEL: Record<(typeof NON_CLEAR_LEVELS)[number], string> = { emergency: "Emergency", crisis: "Crisis", urgent: "Urgent", uncertain: "Uncertain" };

/** Read at request time: the page is dynamic (it reads headers), so this runs once per request. */
function reportNow(capGbp: number) {
  return usageReport(db(), Date.now(), capGbp);
}

/** Admin usage page (FR-25, AC-15.3): spend against the cap, sessions, urgent events. Counts only (AC-25.2). */
export default async function UsagePage() {
  if (!LOCAL_HOSTS.test((await headers()).get("host") ?? "")) notFound();
  const e = env();
  const r = reportNow(e.MONTHLY_CAP_GBP);
  const pct = Math.min(100, Math.round(r.month.share * 100));

  return (
    <main className={styles.page} lang="en" dir="ltr">
      <h1 className={styles.title}>Usage</h1>
      <p className={styles.lead}>Counts and spend only. Nothing anyone typed, said or photographed is shown or stored here.</p>

      {r.month.alert && (
        <p className={styles.alert} role="alert" data-level={r.month.alert}>
          {r.month.alert === 100
            ? "The monthly cap is reached. New summaries and explanations are refused; the urgency check and urgent messages still work."
            : `Spend has passed ${r.month.alert}% of the monthly cap.`}
        </p>
      )}

      <section className={styles.card} aria-labelledby="month">
        <h2 id="month" className={styles.heading}>
          This month
        </h2>
        <p className={styles.big}>
          {gbp(r.month.spentGbp)} <span className={styles.muted}>of {gbp(r.month.capGbp)} cap</span>
        </p>
        <div className={styles.meter} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Share of the monthly cap used">
          <span style={{ width: `${pct}%` }} data-level={r.month.alert ?? undefined} />
        </div>
        <dl className={styles.stats}>
          <div>
            <dt>Sessions</dt>
            <dd>{r.month.sessions}</dd>
          </div>
          <div>
            <dt>Average cost per session</dt>
            <dd>{r.month.avgCostPerSessionGbp === null ? "–" : gbp(r.month.avgCostPerSessionGbp)}</dd>
          </div>
          <div>
            <dt>Daily session cap</dt>
            <dd>{e.DAILY_SESSION_CAP}</dd>
          </div>
        </dl>
        {r.byRole.length > 0 && (
          <table className={styles.table}>
            <caption>Spend by model role</caption>
            <thead>
              <tr>
                <th scope="col">Role</th>
                <th scope="col">Calls</th>
                <th scope="col">Spend</th>
              </tr>
            </thead>
            <tbody>
              {r.byRole.map((row) => (
                <tr key={row.role}>
                  <th scope="row">{row.role}</th>
                  <td>{row.calls}</td>
                  <td>{gbp(row.costGbp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className={styles.card} aria-labelledby="days">
        <h2 id="days" className={styles.heading}>
          Last {r.days.length} days (UTC)
        </h2>
        {/* Scrolls sideways on a phone: focusable so keyboard users can scroll it too. */}
        <div className={styles.scroll} tabIndex={0} role="region" aria-labelledby="days">
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Sessions</th>
                <th scope="col">Spend</th>
                {NON_CLEAR_LEVELS.map((l) => (
                  <th scope="col" key={l}>
                    {LEVEL_LABEL[l]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.days.map((d) => (
                <tr key={d.date}>
                  <th scope="row">{d.date}</th>
                  <td>{d.sessions}</td>
                  <td>{gbp(d.costGbp)}</td>
                  {NON_CLEAR_LEVELS.map((l) => (
                    <td key={l}>{d.urgentEvents[l]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.muted}>Emergency, crisis, urgent and uncertain are urgency-check results that showed the static urgent message.</p>
      </section>
    </main>
  );
}
