import { PageHeader } from "@/components/producer/PageHeader";

type Rep = {
  name: string;
  email?: string;
  phone?: string;
};

type Carrier = {
  name: string;
  phone?: string;
  email?: string;
  reps: Rep[];
};

// Sourced from allstaragentinfo.com/carrier-contacts.
const CARRIERS: Carrier[] = [
  {
    name: "American Amicable",
    phone: "(800) 736-7311",
    email: "pos@aatx.com",
    reps: [
      { name: "Darren Sliva", email: "dsliva@aatx.com" },
      { name: "Michelle Hilliker", email: "mhilliker@aatx.com" },
      { name: "Roberto Silva", phone: "(484) 888-3215" },
    ],
  },
  {
    name: "Americo",
    phone: "800-231-0801",
    email: "agent.services@americo.com",
    reps: [
      { name: "Lindsay Autry", email: "lindsay.autry@americo.com", phone: "(818) 762-9059" },
      { name: "Brandon Wilson", email: "brandon.wilson@americo.com", phone: "(816) 698-9342" },
    ],
  },
  {
    name: "Aetna",
    phone: "(866) 272-6630",
    email: "AetSSINewBusiness@AETNA.com",
    reps: [{ name: "Justine Sawyers", email: "SawyersJ@aetna.com" }],
  },
  {
    name: "Ethos",
    phone: "(877) 913-8467",
    email: "agentops@getethos.com",
    reps: [
      { name: "Nick Taylor", email: "nick.taylor@getethos.com", phone: "(760) 927-2100" },
      { name: "Dylan Cummings", phone: "(402) 708-0518" },
    ],
  },
  {
    name: "CoreBridge Financial",
    phone: "(888) 201-9544",
    email: "SIGITeam@corebridgefinancial.com",
    reps: [
      { name: "Brendan Quinn", email: "brendan.quinn@corebridgefinancial.com" },
      {
        name: "Sam Philips",
        email: "samuel.philips@corebridgefinancial.com",
        phone: "(713) 201-0870",
      },
    ],
  },
  {
    name: "Mutual of Omaha",
    phone: "(800) 775-7896",
    email: "Liferequirements@mutualofomaha.com",
    reps: [
      { name: "Heather Larue", email: "heather.larue@mutualofomaha.com", phone: "(402) 660-5206" },
    ],
  },
  {
    name: "Transamerica",
    phone: "(877) 234-4848",
    email: "finalexpensenewbus@transamerica.com",
    reps: [{ name: "Steve Bouslog", email: "steve.bouslog@transamerica.com", phone: "(720) 614-3000" }],
  },
  {
    name: "Athene",
    phone: "(888) 266-8489",
    reps: [{ name: "Ellen Renner", email: "erenner@athene.com", phone: "(515) 342-6359" }],
  },
];

function ContactLine({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-[0.16em] text-mute">{label}</span>
      <a href={href} className="text-sm text-ink transition hover:text-accent">
        {value}
      </a>
    </div>
  );
}

export default function CarrierContactsPage() {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <PageHeader title="Carrier Contacts" backHref="/producer/menu/resources" />

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CARRIERS.map((c) => (
          <div
            key={c.name}
            className="flex flex-col rounded-2xl border border-hairline bg-card p-5"
          >
            <h2 className="text-base font-semibold text-ink">{c.name}</h2>

            <div className="mt-4 flex flex-col gap-3">
              {c.phone ? (
                <ContactLine
                  label="Phone"
                  value={c.phone}
                  href={`tel:${c.phone.replace(/[^0-9]/g, "")}`}
                />
              ) : null}
              {c.email ? (
                <ContactLine label="Email" value={c.email} href={`mailto:${c.email}`} />
              ) : null}
            </div>

            {c.reps.length ? (
              <div className="mt-4 border-t border-hairline pt-4">
                <span className="text-[10px] uppercase tracking-[0.16em] text-mute">
                  {c.reps.length > 1 ? "Representatives" : "Representative"}
                </span>
                <ul className="mt-2 flex flex-col gap-2.5">
                  {c.reps.map((rep) => (
                    <li key={rep.name} className="text-sm">
                      <span className="font-medium text-ink">{rep.name}</span>
                      <div className="mt-0.5 flex flex-col gap-0.5 text-subtle">
                        {rep.email ? (
                          <a
                            href={`mailto:${rep.email}`}
                            className="transition hover:text-accent"
                          >
                            {rep.email}
                          </a>
                        ) : null}
                        {rep.phone ? (
                          <a
                            href={`tel:${rep.phone.replace(/[^0-9]/g, "")}`}
                            className="transition hover:text-accent"
                          >
                            {rep.phone}
                          </a>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </main>
  );
}
