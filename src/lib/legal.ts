import { company } from "@/lib/company";
import type { Locale } from "@/lib/i18n";

/** Client-facing Terms and Privacy Policy. Plain text sections, rendered by LegalPage. */
export type LegalDoc = { title: string; updated: string; sections: { heading: string; body: string[] }[] };

const UPDATED = { el: "18 Νοεμβρίου 2026", en: "18 November 2026" };

const identity = (l: Locale) =>
  [
    `${company.legalName} (${company.name})`,
    company.address[l],
    l === "el" ? `ΑΦΜ ${company.vatNumber}` : `VAT no. ${company.vatNumber}`,
    l === "el" ? `Αρ. ΓΕΜΗ ${company.gemi}` : `GEMI no. ${company.gemi}`,
    `EUID ${company.euid}`,
    `${company.email} · ${company.phone.display}`,
  ].join(", ");

export const terms: Record<Locale, LegalDoc> = {
  el: {
    title: "Όροι χρήσης και πληρωμής",
    updated: UPDATED.el,
    sections: [
      {
        heading: "Ποιοι είμαστε",
        body: [`Η υπηρεσία παρέχεται από: ${identity("el")}.`],
      },
      {
        heading: "Η υπηρεσία",
        body: [
          "Παρέχουμε φιλοξενία ιστοσελίδων (hosting) και ανανέωση ονομάτων χώρου (domain names) για περίοδο 12 ή 24 μηνών. Τα .gr domains ανανεώνονται για 24 μήνες.",
          "Η σελίδα πληρωμής δείχνει, πριν πληρώσετε, τι περιλαμβάνει η ανανέωση, την περίοδο, την καθαρή αξία, τον ΦΠΑ και το συνολικό ποσό.",
        ],
      },
      {
        heading: "Τιμές και πληρωμή",
        body: [
          "Οι τιμές είναι σε ευρώ. Ο ΦΠΑ υπολογίζεται σύμφωνα με την ισχύουσα νομοθεσία (24% στην Ελλάδα, αντίστροφη χρέωση για επιχειρήσεις στην ΕΕ, εκτός πεδίου για πελάτες εκτός ΕΕ).",
          "Η πληρωμή γίνεται με κάρτα στην ασφαλή σελίδα της viva.com. Δεν βλέπουμε ούτε αποθηκεύουμε στοιχεία κάρτας.",
        ],
      },
      {
        heading: "Παράδοση",
        body: [
          "Η υπηρεσία είναι ψηφιακή και δεν αποστέλλεται κάποιο φυσικό προϊόν. Η ανανέωση ενεργοποιείται αμέσως μόλις ολοκληρωθεί η πληρωμή: η ημερομηνία λήξης παρατείνεται για την περίοδο που αναγράφεται.",
          "Το παραστατικό (τιμολόγιο ή απόδειξη) εκδίδεται ηλεκτρονικά, διαβιβάζεται στο myDATA της ΑΑΔΕ και σας αποστέλλεται με email.",
        ],
      },
      {
        heading: "Ακύρωση",
        body: [
          "Δεν υπάρχει αυτόματη χρέωση. Αν δεν θέλετε να ανανεώσετε, απλώς μην πληρώσετε: η υπηρεσία λήγει στην ημερομηνία λήξης. Μετά τη λήξη η ιστοσελίδα μπορεί να απενεργοποιηθεί και το domain να μην ανανεωθεί.",
          `Για να σταματήσουν οι υπενθυμίσεις, γράψτε μας στο ${company.email}.`,
        ],
      },
      {
        heading: "Επιστροφές χρημάτων",
        body: [
          "Επειδή πρόκειται για ψηφιακή υπηρεσία που ξεκινά αμέσως, δεν γίνονται επιστροφές χρημάτων μετά την πληρωμή.",
          "Με την πληρωμή ζητάτε ρητά να ξεκινήσει η υπηρεσία αμέσως και αποδέχεστε ότι χάνετε το δικαίωμα υπαναχώρησης 14 ημερών.",
          "Εξαίρεση: αν χρεωθείτε δύο φορές για την ίδια ανανέωση ή λάθος ποσό, επιστρέφουμε τη διαφορά στην ίδια κάρτα.",
        ],
      },
      {
        heading: "Εφαρμοστέο δίκαιο",
        body: ["Ισχύει το ελληνικό δίκαιο."],
      },
      {
        heading: "Επικοινωνία",
        body: [`Email ${company.email} · Τηλέφωνο ${company.phone.display}`],
      },
    ],
  },
  en: {
    title: "Terms of service and payment",
    updated: UPDATED.en,
    sections: [
      {
        heading: "Who we are",
        body: [`The service is provided by: ${identity("en")}.`],
      },
      {
        heading: "The service",
        body: [
          "We provide website hosting and domain name renewals for 12 or 24 months. .gr domains renew for 24 months.",
          "Before you pay, the payment page shows what the renewal includes, the period, the net amount, VAT and the total.",
        ],
      },
      {
        heading: "Prices and payment",
        body: [
          "Prices are in euros. VAT follows the law: 24% in Greece, reverse charge for EU businesses, outside the scope of VAT for clients outside the EU.",
          "You pay by card on viva.com's secure page. We never see or store card details.",
        ],
      },
      {
        heading: "Delivery",
        body: [
          "This is a digital service; nothing is shipped. The renewal takes effect as soon as payment completes: the expiry date moves forward by the period shown.",
          "The invoice or receipt is issued electronically, transmitted to AADE's myDATA, and emailed to you.",
        ],
      },
      {
        heading: "Cancellation",
        body: [
          "Nothing is charged automatically. If you don't want to renew, simply don't pay: the service ends on its expiry date. After that, the website may be taken offline and the domain may lapse.",
          `To stop reminders, write to ${company.email}.`,
        ],
      },
      {
        heading: "Refunds",
        body: [
          "Because this is a digital service that starts immediately, payments are not refunded.",
          "By paying, you expressly ask for the service to start immediately and accept that you lose the 14-day right of withdrawal.",
          "Exception: if you are charged twice for the same renewal, or the wrong amount, we refund the difference to the same card.",
        ],
      },
      {
        heading: "Governing law",
        body: ["Greek law applies."],
      },
      {
        heading: "Contact",
        body: [`Email ${company.email} · Phone ${company.phone.display}`],
      },
    ],
  },
};

export const privacy: Record<Locale, LegalDoc> = {
  el: {
    title: "Πολιτική απορρήτου",
    updated: UPDATED.el,
    sections: [
      {
        heading: "Υπεύθυνος επεξεργασίας",
        body: [identity("el")],
      },
      {
        heading: "Ποια στοιχεία έχουμε",
        body: [
          "Στοιχεία τιμολόγησης (επωνυμία, ΑΦΜ, ΔΟΥ, διεύθυνση), email και τηλέφωνο επικοινωνίας, τα domains και τα πακέτα σας, και το ιστορικό πληρωμών και παραστατικών.",
          "Στοιχεία κάρτας δεν τα βλέπουμε ούτε τα αποθηκεύουμε: τα επεξεργάζεται μόνο η viva.com.",
        ],
      },
      {
        heading: "Γιατί τα χρησιμοποιούμε",
        body: [
          "Για να παρέχουμε την υπηρεσία που αγοράσατε, να σας στέλνουμε υπενθυμίσεις ανανέωσης (εκτέλεση σύμβασης), και για να εκδίδουμε και να διαβιβάζουμε παραστατικά (νομική υποχρέωση).",
        ],
      },
      {
        heading: "Με ποιους τα μοιραζόμαστε",
        body: [
          "viva.com (πληρωμές με κάρτα), Elorus (έκδοση παραστατικών και διαβίβαση στο myDATA της ΑΑΔΕ), Resend (αποστολή email), Vercel και Neon (φιλοξενία της εφαρμογής και της βάσης δεδομένων, στη Φρανκφούρτη). Δεν πουλάμε ούτε δίνουμε στοιχεία για διαφήμιση.",
        ],
      },
      {
        heading: "Πόσο καιρό τα κρατάμε",
        body: [
          "Όσο είστε πελάτης. Τα παραστατικά και τα στοιχεία πληρωμών τα κρατάμε όσο ορίζει η φορολογική νομοθεσία.",
        ],
      },
      {
        heading: "Cookies",
        body: ["Οι σελίδες πληρωμής δεν χρησιμοποιούν cookies παρακολούθησης ή διαφήμισης."],
      },
      {
        heading: "Τα δικαιώματά σας",
        body: [
          `Έχετε δικαίωμα πρόσβασης, διόρθωσης, διαγραφής, περιορισμού, εναντίωσης και φορητότητας. Γράψτε μας στο ${company.email}.`,
          "Μπορείτε επίσης να υποβάλετε καταγγελία στην Αρχή Προστασίας Δεδομένων Προσωπικού Χαρακτήρα (www.dpa.gr).",
        ],
      },
    ],
  },
  en: {
    title: "Privacy policy",
    updated: UPDATED.en,
    sections: [
      {
        heading: "Data controller",
        body: [identity("en")],
      },
      {
        heading: "What we hold",
        body: [
          "Billing details (company name, VAT number, tax office, address), contact email and phone, your domains and plans, and your payment and invoice history.",
          "We never see or store card details: only viva.com processes them.",
        ],
      },
      {
        heading: "Why we use it",
        body: [
          "To provide the service you bought and send renewal reminders (performance of a contract), and to issue and transmit invoices (legal obligation).",
        ],
      },
      {
        heading: "Who we share it with",
        body: [
          "viva.com (card payments), Elorus (invoicing and transmission to AADE's myDATA), Resend (email delivery), Vercel and Neon (hosting of the app and its database, in Frankfurt). We never sell data or share it for advertising.",
        ],
      },
      {
        heading: "How long we keep it",
        body: ["For as long as you are a client. Invoices and payment records are kept as long as tax law requires."],
      },
      {
        heading: "Cookies",
        body: ["Payment pages use no tracking or advertising cookies."],
      },
      {
        heading: "Your rights",
        body: [
          `You have the right to access, correct, erase, restrict, object to and port your data. Write to ${company.email}.`,
          "You can also complain to the Hellenic Data Protection Authority (www.dpa.gr).",
        ],
      },
    ],
  },
};
