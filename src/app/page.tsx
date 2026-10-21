export default function Home() {
  return (
    <main style={{ padding: "var(--space-4)", maxWidth: "32rem", margin: "0 auto" }}>
      <h1
        style={{
          fontSize: "var(--text-display-size)",
          lineHeight: "var(--text-display-leading)",
          letterSpacing: "var(--text-display-tracking)",
        }}
      >
        CareNav AI
      </h1>
      <p>Get ready for your appointment, and understand what you were told.</p>
    </main>
  );
}
