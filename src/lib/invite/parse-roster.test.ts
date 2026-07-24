import { describe, it, expect } from "vitest";
import { parseRoster, parseInviteRows } from "./parse-roster";

describe("parseRoster", () => {
  it("parses 'Name, email' lines", () => {
    const rows = parseRoster("Bob Smith, bob@x.com\nJane Doe, jane@y.com");
    expect(rows).toEqual([
      { name: "Bob Smith", email: "bob@x.com" },
      { name: "Jane Doe", email: "jane@y.com" },
    ]);
  });

  it("parses 'Name <email>' lines", () => {
    expect(parseRoster("Bob Smith <bob@x.com>")).toEqual([
      { name: "Bob Smith", email: "bob@x.com" },
    ]);
  });

  it("does not swap name and email when the email is in the first column", () => {
    // email,name order — the @ detection must keep them straight, not blindly
    // trust column position.
    expect(parseRoster("bob@x.com, Bob Smith")).toEqual([
      { name: "Bob Smith", email: "bob@x.com" },
    ]);
  });

  it("falls back to the email prefix when no name is given", () => {
    expect(parseRoster("bob@x.com")).toEqual([{ name: "bob", email: "bob@x.com" }]);
  });

  it("lowercases the email", () => {
    expect(parseRoster("Bob, Bob@X.COM")[0].email).toBe("bob@x.com");
  });

  it("drops blank lines and rows without a valid email", () => {
    const rows = parseRoster("\nBob Smith, bob@x.com\n\nnot-an-email\nJane, \n");
    expect(rows).toEqual([{ name: "Bob Smith", email: "bob@x.com" }]);
  });

  it("drops a CSV header row (no valid email in it)", () => {
    const rows = parseRoster("name,email\nBob Smith, bob@x.com");
    expect(rows).toEqual([{ name: "Bob Smith", email: "bob@x.com" }]);
    expect(rows).toHaveLength(1);
  });
});

describe("parseInviteRows (role-aware)", () => {
  it("defaults a bare email to the recruit role", () => {
    expect(parseInviteRows("bob@x.com")).toEqual([
      { name: "bob", email: "bob@x.com", role: "recruit" },
    ]);
  });

  it("reads the role word regardless of column order", () => {
    expect(parseInviteRows("bob@x.com, producer")).toEqual([
      { name: "bob", email: "bob@x.com", role: "producer" },
    ]);
    expect(parseInviteRows("builder, jane@y.com")).toEqual([
      { name: "jane", email: "jane@y.com", role: "builder" },
    ]);
  });

  it("reads name, email, and role together", () => {
    expect(parseInviteRows("Cal Team, cal@z.com, builder")).toEqual([
      { name: "Cal Team", email: "cal@z.com", role: "builder" },
    ]);
  });

  it("is case-insensitive on the role and lowercases the email", () => {
    expect(parseInviteRows("Bob, BOB@X.COM, Producer")).toEqual([
      { name: "Bob", email: "bob@x.com", role: "producer" },
    ]);
  });

  it("handles the Name <email> form with a trailing role", () => {
    expect(parseInviteRows("Bob Smith <bob@x.com>, builder")).toEqual([
      { name: "Bob Smith", email: "bob@x.com", role: "builder" },
    ]);
  });

  it("drops a header row and blank lines, and defaults to recruit when no role word is present", () => {
    const rows = parseInviteRows("email,role\n\nCarol, carol@x.com\n");
    expect(rows).toEqual([{ name: "Carol", email: "carol@x.com", role: "recruit" }]);
  });
});
