/** Client-facing copy (emails and pay page). Admin UI is English. "Renewal" is the client-facing word. */
export type Locale = "el" | "en";

export const t = {
  el: {
    renewal: "Ανανέωση φιλοξενίας",
    renewalFor: (domain: string) => `Ανανέωση φιλοξενίας για ${domain}`,
    reminderSubject: {
      d30: (d: string, date: string) => `Η φιλοξενία του ${d} ανανεώνεται στις ${date}`,
      d7: (d: string, date: string) => `Υπενθύμιση: η φιλοξενία του ${d} λήγει στις ${date}`,
      d1: (d: string) => `Η φιλοξενία του ${d} λήγει αύριο`,
      overdue: (d: string) => `Η φιλοξενία του ${d} έχει λήξει`,
    },
    reminderLead: {
      d30: (d: string, date: string, amt: string) =>
        `Η φιλοξενία του ${d} ανανεώνεται στις ${date}. Το ποσό ανανέωσης είναι ${amt} με ΦΠΑ.`,
      d7: (d: string, date: string, amt: string) =>
        `Σε μία εβδομάδα, στις ${date}, λήγει η φιλοξενία του ${d}. Ανανεώστε τώρα με ${amt} με ΦΠΑ.`,
      d1: (d: string, _date: string, amt: string) =>
        `Η φιλοξενία του ${d} λήγει αύριο. Ανανεώστε σήμερα με ${amt} με ΦΠΑ για να μη διακοπεί τίποτα.`,
      overdue: (d: string, date: string, amt: string) =>
        `Η φιλοξενία του ${d} έληξε στις ${date}. Ανανεώστε με ${amt} με ΦΠΑ.`,
    },
    includesDomain: (d: string, months: number) => `Περιλαμβάνει και την ανανέωση του domain ${d} για ${months === 24 ? "2 έτη" : "1 έτος"}.`,
    hostingLine: (plan: string) => `Φιλοξενία ${plan}`,
    domainLine: (d: string) => `Domain ${d}`,
    payButton: (amt: string) => `Πληρωμή ${amt}`,
    payByCard: (amt: string) => `Πληρωμή ${amt} με κάρτα`,
    emailFooter: "Το παραστατικό θα σας σταλεί αυτόματα μόλις ολοκληρωθεί η πληρωμή. Για απορίες, απαντήστε σε αυτό το email.",
    plan: "Πακέτο",
    period: "Περίοδος",
    net: "Καθαρή αξία",
    vat: (r: number) => `ΦΠΑ ${r}%`,
    vatReverse: "ΦΠΑ: αντίστροφη χρέωση",
    vatOutside: "Εκτός πεδίου ΦΠΑ",
    total: "Σύνολο",
    invoiceTo: "Το παραστατικό θα εκδοθεί σε",
    detailsWrong: "Λάθος στοιχεία; Απαντήστε στο email ανανέωσης ή γράψτε στο info@iframe.gr.",
    secure: "Η πληρωμή γίνεται στην ασφαλή σελίδα του παρόχου. Δεν αποθηκεύουμε στοιχεία κάρτας.",
    paidTitle: "Η ανανέωση έχει πληρωθεί",
    paidBody: (date: string) => `Ευχαριστούμε! Η φιλοξενία είναι ενεργή έως ${date}. Το παραστατικό στάλθηκε στο email σας.`,
    expiredTitle: "Ο σύνδεσμος έχει λήξει",
    expiredBody: "Αυτός ο σύνδεσμος πληρωμής δεν ισχύει πλέον. Γράψτε μας στο info@iframe.gr και θα σας στείλουμε νέο.",
    cancelledTitle: "Η ανανέωση ακυρώθηκε",
    cancelledBody: "Αυτή η ανανέωση δεν είναι πλέον ενεργή. Για απορίες γράψτε στο info@iframe.gr.",
    successTitle: "Ευχαριστούμε για την πληρωμή",
    successBody: "Η πληρωμή σας καταχωρήθηκε. Θα λάβετε το παραστατικό με email σε λίγα λεπτά.",
    successPending: "Επιβεβαιώνουμε την πληρωμή με τον πάροχο. Μπορείτε να κλείσετε αυτή τη σελίδα· θα λάβετε email.",
    cancelTitle: "Η πληρωμή δεν ολοκληρώθηκε",
    cancelBody: "Δεν έγινε καμία χρέωση. Μπορείτε να δοκιμάσετε ξανά όποτε θέλετε.",
    tryAgain: "Δοκιμάστε ξανά",
    providerError: "Δεν ήταν δυνατή η σύνδεση με τον πάροχο πληρωμών. Δοκιμάστε ξανά ή επιλέξτε άλλο τρόπο.",
    notFound: "Δεν βρέθηκε αυτή η ανανέωση. Ελέγξτε τον σύνδεσμο στο email σας.",
    expires: "Λήξη",
    until: "έως",
    months: (n: number) => (n === 12 ? "1 έτος" : n === 24 ? "2 έτη" : `${n} μήνες`),
  },
  en: {
    renewal: "Hosting renewal",
    renewalFor: (domain: string) => `Hosting renewal for ${domain}`,
    reminderSubject: {
      d30: (d: string, date: string) => `Hosting for ${d} renews on ${date}`,
      d7: (d: string, date: string) => `Reminder: hosting for ${d} expires on ${date}`,
      d1: (d: string) => `Hosting for ${d} expires tomorrow`,
      overdue: (d: string) => `Hosting for ${d} has expired`,
    },
    reminderLead: {
      d30: (d: string, date: string, amt: string) =>
        `Your hosting for ${d} renews on ${date}. The renewal is ${amt} including VAT.`,
      d7: (d: string, date: string, amt: string) =>
        `Hosting for ${d} expires in one week, on ${date}. Renew now for ${amt} including VAT.`,
      d1: (d: string, _date: string, amt: string) =>
        `Hosting for ${d} expires tomorrow. Renew today for ${amt} including VAT so nothing is interrupted.`,
      overdue: (d: string, date: string, amt: string) =>
        `Hosting for ${d} expired on ${date}. Renew now for ${amt} including VAT.`,
    },
    includesDomain: (d: string, months: number) => `Includes the renewal of the domain ${d} for ${months === 24 ? "2 years" : "1 year"}.`,
    hostingLine: (plan: string) => `Hosting ${plan}`,
    domainLine: (d: string) => `Domain ${d}`,
    payButton: (amt: string) => `Pay ${amt}`,
    payByCard: (amt: string) => `Pay ${amt} by card`,
    emailFooter: "Your invoice is emailed automatically once payment is complete. Questions? Just reply to this email.",
    plan: "Plan",
    period: "Period",
    net: "Net",
    vat: (r: number) => `VAT ${r}%`,
    vatReverse: "VAT: reverse charge",
    vatOutside: "Outside the scope of VAT",
    total: "Total",
    invoiceTo: "Invoice will be issued to",
    detailsWrong: "Details wrong? Reply to the renewal email or write to info@iframe.gr.",
    secure: "You pay on the provider's secure page. We never store card details.",
    paidTitle: "This renewal is paid",
    paidBody: (date: string) => `Thank you! Hosting is active until ${date}. Your invoice was emailed to you.`,
    expiredTitle: "This link has expired",
    expiredBody: "This payment link is no longer valid. Write to info@iframe.gr and we'll send you a new one.",
    cancelledTitle: "This renewal was cancelled",
    cancelledBody: "This renewal is no longer active. Questions? Write to info@iframe.gr.",
    successTitle: "Thank you for your payment",
    successBody: "Your payment is recorded. Your invoice will arrive by email in a few minutes.",
    successPending: "We're confirming the payment with the provider. You can close this page; you'll get an email.",
    cancelTitle: "Payment not completed",
    cancelBody: "You were not charged. You can try again whenever you're ready.",
    tryAgain: "Try again",
    providerError: "We couldn't reach the payment provider. Try again, or use the other option.",
    notFound: "We couldn't find this renewal. Check the link in your email.",
    expires: "Expires",
    until: "until",
    months: (n: number) => (n === 12 ? "1 year" : n === 24 ? "2 years" : `${n} months`),
  },
} as const;

export function pickLocale(v: string | null | undefined, fallback: Locale = "el"): Locale {
  return v === "en" || v === "el" ? v : fallback;
}
