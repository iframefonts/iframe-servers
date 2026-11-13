import { Body, Button, Container, Head, Hr, Html, Preview, Section, Text } from "@react-email/components";
import { t, type Locale } from "@/lib/i18n";

export type EmailKind = "d30" | "d7" | "d1" | "overdue";

export type ReminderEmailProps = {
  locale: Locale;
  kind: EmailKind;
  domain: string;
  expiryDate: string;
  amount: string;
  payUrl: string;
};

export function ReminderEmail({ locale, kind, domain, expiryDate, amount, payUrl }: ReminderEmailProps) {
  const s = t[locale];
  const lead = s.reminderLead[kind](domain, expiryDate, amount);
  return (
    <Html lang={locale}>
      <Head />
      <Preview>{lead}</Preview>
      <Body style={{ backgroundColor: "#f5f5f4", fontFamily: "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", margin: 0, padding: "24px 0" }}>
        <Container style={{ backgroundColor: "#ffffff", borderRadius: 12, padding: "32px 28px", maxWidth: 520 }}>
          <Text style={{ fontSize: 13, letterSpacing: 0.4, color: "#57534e", margin: 0 }}>iFRAME</Text>
          <Text style={{ fontSize: 22, lineHeight: "28px", fontWeight: 600, color: "#1c1917", margin: "16px 0 8px" }}>
            {s.renewalFor(domain)}
          </Text>
          <Text style={{ fontSize: 16, lineHeight: "24px", color: "#292524", margin: "0 0 24px" }}>{lead}</Text>
          <Section>
            <Button
              href={payUrl}
              style={{ backgroundColor: "#1d4ed8", color: "#ffffff", borderRadius: 10, padding: "14px 22px", fontSize: 16, fontWeight: 600 }}
            >
              {s.payButton(amount)}
            </Button>
          </Section>
          <Hr style={{ borderColor: "#e7e5e4", margin: "28px 0 16px" }} />
          <Text style={{ fontSize: 14, lineHeight: "20px", color: "#57534e", margin: 0 }}>{s.emailFooter}</Text>
        </Container>
      </Body>
    </Html>
  );
}

export default ReminderEmail;
