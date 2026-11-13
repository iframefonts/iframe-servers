import { Body, Button, Container, Head, Html, Preview, Section, Text } from "@react-email/components";

export type AdminEmailProps = {
  title: string;
  intro?: string;
  rows?: { label: string; value: string }[];
  sections?: { heading: string; items: string[]; empty?: string }[];
  actionUrl?: string;
  actionLabel?: string;
};

/** Team-only email: alerts, payment confirmations, the daily digest. */
export function AdminEmail({ title, intro, rows, sections, actionUrl, actionLabel }: AdminEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{intro ?? title}</Preview>
      <Body style={{ backgroundColor: "#f5f5f4", fontFamily: "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", padding: "24px 0" }}>
        <Container style={{ backgroundColor: "#fff", borderRadius: 12, padding: "28px", maxWidth: 560 }}>
          <Text style={{ fontSize: 13, color: "#57534e", margin: 0 }}>iFRAME Servers</Text>
          <Text style={{ fontSize: 20, fontWeight: 600, color: "#1c1917", margin: "12px 0" }}>{title}</Text>
          {intro && <Text style={{ fontSize: 15, color: "#292524" }}>{intro}</Text>}
          {rows && (
            <Section>
              {rows.map((r) => (
                <Text key={r.label} style={{ fontSize: 15, margin: "4px 0", color: "#292524" }}>
                  <span style={{ color: "#57534e" }}>{r.label}: </span>
                  {r.value}
                </Text>
              ))}
            </Section>
          )}
          {sections?.map((s) => (
            <Section key={s.heading} style={{ marginTop: 16 }}>
              <Text style={{ fontSize: 15, fontWeight: 600, margin: "0 0 4px" }}>{s.heading}</Text>
              {s.items.length === 0 ? (
                <Text style={{ fontSize: 14, color: "#57534e", margin: 0 }}>{s.empty ?? "None"}</Text>
              ) : (
                s.items.map((i) => (
                  <Text key={i} style={{ fontSize: 14, margin: "2px 0", color: "#292524" }}>
                    • {i}
                  </Text>
                ))
              )}
            </Section>
          ))}
          {actionUrl && (
            <Section style={{ marginTop: 20 }}>
              <Button href={actionUrl} style={{ backgroundColor: "#1c1917", color: "#fff", borderRadius: 8, padding: "10px 16px", fontSize: 14 }}>
                {actionLabel ?? "Open"}
              </Button>
            </Section>
          )}
        </Container>
      </Body>
    </Html>
  );
}

export default AdminEmail;
