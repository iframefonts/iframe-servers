import { describe, expect, it } from "vitest";
import { parsePlesk, planImport } from "../scripts/import-servers";

const host = "Γιωργος Χαλκίδης(381815601.linuxzone191.grserver.gr)";
const paste = [
  `airio.gr\n\t${host}\t516.1 MB\t618.3 MB/month\t\nActive\n\t\n\t`,
  `381815601.linuxzone191.grserver.gr\n\t${host}\t0.6 MB\t0 MB/month\t\nActive`,
  `yali.gr\n\t${host}\t987.1 MB\t0.9 MB/month\t\nDisabled`,
  `squareseed.gr\n\tsqseed_customer\t841.7 MB\t1040 MB/month\t\nActive`,
  `kafekadoi.gr\n\t\nActive\n\t0.3 MB\t111.6 MB/month`,
].join("\n");

describe("Plesk server list import", () => {
  it("reads domains, server and status, and drops the server's own hostname", () => {
    expect(parsePlesk(paste)).toEqual([
      { domain: "airio.gr", server: "381815601.linuxzone191.grserver.gr", disabled: false },
      { domain: "yali.gr", server: "381815601.linuxzone191.grserver.gr", disabled: true },
      { domain: "squareseed.gr", server: "381815601.linuxzone191.grserver.gr", disabled: false },
      { domain: "kafekadoi.gr", server: "381815601.linuxzone191.grserver.gr", disabled: false },
    ]);
    expect(parsePlesk("kafekadoi.gr\n\t\nActive")).toEqual([{ domain: "kafekadoi.gr", server: null, disabled: false }]);
  });

  it("renames, attaches second domains, creates the rest and skips disabled ones", () => {
    const e = (domain: string, disabled = false) => ({ domain, server: "s1", disabled });
    const existing = new Map<string, string | null>([
      ["airio.gr", null],
      ["12pyles", null],
      ["mareasuites.gr", null],
      ["kouvelas.gr", "s1"],
      ["ledadeco.com", null],
      ["praxisconstructions.com", null],
    ]);
    const actions = planImport(
      [
        e("airio.gr"),
        e("12pyles.gr"),
        e("marea-suites.gr"),
        e("kouvelas.gr"),
        e("kouvelas.com"),
        e("ledadecoshop.com"),
        e("hospitality.praxisconstructions.com"),
        e("new.gr"),
        e("new.gr"),
        e("gone.gr", true),
      ],
      existing,
    );
    expect(actions).toEqual([
      { kind: "skipDisabled", domain: "gone.gr" },
      { kind: "setServer", domain: "airio.gr", server: "s1" },
      { kind: "rename", from: "12pyles", to: "12pyles.gr", server: "s1" },
      { kind: "rename", from: "mareasuites.gr", to: "marea-suites.gr", server: "s1" },
      { kind: "attach", domain: "kouvelas.com", to: "kouvelas.gr", server: "s1" },
      { kind: "attach", domain: "ledadecoshop.com", to: "ledadeco.com", server: "s1" },
      { kind: "attach", domain: "hospitality.praxisconstructions.com", to: "praxisconstructions.com", server: "s1" },
      { kind: "create", domain: "new.gr", server: "s1" },
    ]);
    // Second run after applying: nothing left to do.
    const after = new Map<string, string | null>([...["airio.gr", "12pyles.gr", "marea-suites.gr", "kouvelas.gr", "kouvelas.com", "ledadeco.com", "ledadecoshop.com", "praxisconstructions.com", "hospitality.praxisconstructions.com", "new.gr"].map((d) => [d, "s1"] as const)]);
    expect(planImport([e("airio.gr"), e("12pyles.gr"), e("kouvelas.com"), e("new.gr")], after)).toEqual([]);
  });
});
