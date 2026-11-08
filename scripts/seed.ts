/**
 * Demo data: invented US phone shops with 555-01xx numbers and example.com addresses.
 * Never put real customer data here.
 */
import bcrypt from "bcryptjs";
import postgres from "postgres";
import { timeZoneForState } from "../src/lib/us";
import { nextBusinessDayAt } from "../src/lib/time";

export const DEMO_USERS = [
  { email: "admin@example.com", password: "Admin123!demo", fullName: "Alex Morgan", role: "admin", tz: "America/Chicago" },
  { email: "sam@example.com", password: "Sales123!demo", fullName: "Sam Rivera", role: "salesperson", tz: "America/New_York" },
  { email: "riley@example.com", password: "Sales123!demo", fullName: "Riley Chen", role: "salesperson", tz: "America/Los_Angeles" },
] as const;

const CITIES = [
  { city: "Chicago", state: "IL", area: "312", zip: "60601" },
  { city: "Houston", state: "TX", area: "713", zip: "77002" },
  { city: "Phoenix", state: "AZ", area: "602", zip: "85004" },
  { city: "Atlanta", state: "GA", area: "404", zip: "30303" },
  { city: "Denver", state: "CO", area: "303", zip: "80202" },
  { city: "Seattle", state: "WA", area: "206", zip: "98101" },
  { city: "Miami", state: "FL", area: "305", zip: "33130" },
  { city: "Columbus", state: "OH", area: "614", zip: "43215" },
  { city: "Nashville", state: "TN", area: "615", zip: "37203" },
  { city: "Los Angeles", state: "CA", area: "213", zip: "90012" },
];

const PREFIX = ["Metro", "Quick", "Prime", "Urban", "Golden", "Liberty", "Summit", "Pioneer", "Bright", "Velocity", "Harbor", "Main Street"];
const SUFFIX = ["Wireless", "Cell Repair", "Phone Fix", "Mobile Hub", "Device Clinic", "Cellular", "Gadget Repair", "Phone Store"];
const FIRST = ["Jordan", "Taylor", "Casey", "Morgan", "Jamie", "Drew", "Avery", "Quinn", "Reese", "Skyler", "Parker", "Rowan"];
const LAST = ["Patel", "Nguyen", "Garcia", "Smith", "Kim", "Lopez", "Brown", "Ali", "Johnson", "Martinez", "Davis", "Khan"];
const STREETS = ["Main St", "Oak Ave", "Market St", "Elm St", "Broadway", "2nd Ave", "Park Blvd", "Lake St"];

// Small deterministic PRNG so every seed run produces the same data.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export const SCRIPTS = [
  {
    key: "both-opening", product: null, type: "opening", title: "Opening: both products",
    body: `Hi, is this the owner or manager? This is {{rep_name}} with 8staros and Star Cellular Wholesale.\n\nWe work with phone shops two ways: 8staros POS, shop software built for phone repair and retail, and wholesale phones and accessories at shop prices. Most shops use one or both.\n\nWhat's the bigger headache right now: running the counter and repair tickets, or getting good stock at the right price?\n\n[Listen, then go to the POS or wholesale part. Offer both before you hang up.]`,
  },
  {
    key: "pos-opening", product: "pos", type: "opening", title: "8staros POS opening",
    body: `Hi, is this the owner or manager? This is {{rep_name}} with 8staros POS.\n\nQuick reason for the call: we build point-of-sale software made for phone repair and phone retail shops — repair tickets, buyback with IMEI checks, layaway, and a till that keeps working when the internet drops.\n\nHow are you tracking repairs today: paper tickets, or something in your POS?\n\n[Listen. If they use Square/Clover: "Can it run a repair ticket from intake to pickup?"]\n\nWould a 15-minute demo this week be worth it? I can show it with your own repair flow.`,
  },
  {
    key: "pos-voicemail", product: "pos", type: "voicemail", title: "8staros POS voicemail",
    body: `Hi, this is {{rep_name}} from 8staros POS. We make shop software built for phone repair stores — repair tickets, IMEI buyback and an offline-ready till. I'll send a short note too. You can reach me at {{rep_phone}}. Thanks!`,
  },
  {
    key: "pos-objection-have-pos", product: "pos", type: "objection", title: "\"We already have a POS\"",
    body: `Totally fair — most shops we talk to do. What made you pick it? \n\n[Listen]\n\nThe two things owners tell us they miss are repair tickets that text the customer, and buyback with IMEI checks. If either of those is a headache today, a 15-minute look is worth it. If not, no problem at all.`,
  },
  {
    key: "wholesale-opening", product: "wholesale", type: "opening", title: "Star Cellular Wholesale opening",
    body: `Hi, this is {{rep_name}} with Star Cellular Wholesale. We supply graded, IMEI-clean iPhones and Samsungs to phone shops.\n\nDo you buy used or unlocked stock? What models move fastest for you right now?\n\n[Listen: models, grades, quantities, current supplier]\n\nCan I send you this week's price list? Email or WhatsApp — whichever you prefer.`,
  },
  {
    key: "wholesale-gatekeeper", product: "wholesale", type: "gatekeeper", title: "Wholesale gatekeeper",
    body: `Hi! Who usually handles buying stock for the store? I'm with Star Cellular Wholesale — we supply phones to shops. What's the best time to catch them?`,
  },
  {
    key: "wholesale-follow-up-email", product: "wholesale", type: "follow_up_email", title: "Price list follow-up email",
    body: `Subject: This week's price list — Star Cellular Wholesale\n\nHi {{contact_name}},\n\nThanks for taking my call today. As promised, this week's price list is attached. Everything is graded, IMEI-checked and ships within 1–2 business days.\n\nReply with the models and quantities you're interested in and I'll hold them for you.\n\nThanks,\n{{rep_name}}\nStar Cellular Wholesale\n\nNot interested? Reply "no thanks" and I won't email again.`,
  },
] as const;

export async function seed(databaseUrl: string, { log = console.log } = {}) {
  // Fake shops only ever go into a local database (dev, tests); never into Supabase.
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(new URL(databaseUrl).hostname)) {
    throw new Error("Refusing to seed demo data into a database that isn't on this machine.");
  }
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  const rand = rng(20261024);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];

  try {
    const existing = await sql`select count(*)::int as n from public.profiles`;
    if (existing[0].n > 0) {
      log("seed skipped: profiles already exist (run db:reset for a fresh database)");
      return;
    }

    await sql.begin(async (tx) => {
      const ids: Record<string, string> = {};
      for (const u of DEMO_USERS) {
        const hash = bcrypt.hashSync(u.password, 10);
        const [row] = await tx`insert into auth.users (email, encrypted_password, raw_user_meta_data)
          values (${u.email}, ${hash}, ${tx.json({ full_name: u.fullName })}) returning id`;
        ids[u.email] = row.id;
        await tx`insert into public.profiles (id, email, full_name, role, time_zone)
          values (${row.id}, ${u.email}, ${u.fullName}, ${u.role}, ${u.tz})`;
      }
      const admin = ids["admin@example.com"];
      const reps = [ids["sam@example.com"], ids["riley@example.com"]];

      for (const s of SCRIPTS) {
        await tx`insert into public.scripts (script_key, version, product, script_type, title, body, created_by)
          values (${s.key}, 1, ${s.product}, ${s.type}, ${s.title}, ${s.body}, ${admin})`;
      }

      const usedNames = new Set<string>();
      let n = 0;
      for (const c of CITIES) {
        for (let i = 0; i < 4; i++) {
          let name = "";
          do name = `${pick(PREFIX)} ${pick(SUFFIX)}`; while (usedNames.has(`${name}|${c.city}`));
          usedNames.add(`${name}|${c.city}`);
          const slug = `${name}-${c.city}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
          const line = String(100 + (n % 50)).padStart(4, "0"); // 555-0100…0149: main lines
          const phone = `+1${c.area}555${line}`;
          const tz = timeZoneForState(c.state);
          const [company] = await tx`insert into public.companies
            (name, website, website_domain, address, city, state, postal_code, time_zone, phones, emails, created_by)
            values (${name}, ${`https://${slug}.example.com`}, ${`${slug}.example.com`},
              ${`${100 + Math.floor(rand() * 900)} ${pick(STREETS)}`}, ${c.city}, ${c.state}, ${c.zip}, ${tz},
              ${tx.json([{ e164: phone, raw: `(${c.area}) 555-${line}`, label: "main" }])},
              ${tx.json([{ address: `info@${slug}.example.com`, label: "general" }])}, ${admin})
            returning id`;
          const first = pick(FIRST);
          const last = pick(LAST);
          const mobileLine = String(150 + (n % 50)).padStart(4, "0"); // 555-0150…0199: mobiles
          const [contact] = await tx`insert into public.contacts (company_id, full_name, title, phones, emails, is_primary, created_by)
            values (${company.id}, ${`${first} ${last}`}, ${pick(["Owner", "Manager", "Store Manager", "Buyer"])},
              ${tx.json([{ e164: `+1${c.area}555${mobileLine}`, raw: `${c.area}-555-${mobileLine}`, label: "mobile" }])},
              ${tx.json([{ address: `${first.toLowerCase()}@${slug}.example.com`, label: "work" }])}, true, ${admin})
            returning id`;

          // Every shop is offered both products; some have said which they want.
          const wants: ("pos" | "wholesale")[] = n % 3 === 0 ? ["pos", "wholesale"] : [n % 2 ? "pos" : "wholesale"];
          {
            const owner = n % 10 === 9 ? null : reps[n % 2];
            const [lead] = await tx`insert into public.leads (company_id, primary_contact_id, owner_id, source, created_by)
              values (${company.id}, ${contact.id}, ${owner}, 'seed', ${admin}) returning id`;
            if (owner) {
              // Some history so the dashboard and reports have something to show.
              const stage = n % 5;
              const daysAgo = 1 + (n % 6);
              if (stage >= 1) {
                await tx`insert into public.call_activities (lead_id, contact_id, user_id, phone_e164, outcome, notes, occurred_at)
                  values (${lead.id}, ${contact.id}, ${owner}, ${phone}, 'no_answer', 'Rang out, no voicemail.',
                    now() - make_interval(days => ${daysAgo + 2}))`;
              }
              if (stage >= 2) {
                const outcome = stage === 4 ? "interested" : stage === 3 ? "callback_requested" : "voicemail";
                await tx`insert into public.call_activities (lead_id, contact_id, user_id, phone_e164, outcome, interest, notes, occurred_at, interested_in)
                  values (${lead.id}, ${contact.id}, ${owner}, ${phone}, ${outcome},
                    ${stage === 4 ? "interested" : null},
                    ${stage === 4 ? "Owner wants pricing. Uses paper tickets today." : stage === 3 ? "Manager asked for a callback after lunch." : "Left voicemail with callback number."},
                    now() - make_interval(days => ${daysAgo}), ${stage === 4 ? wants : []}::product[])`;
                const due = n % 4 === 0
                  ? new Date(Date.now() - 3600_000) // overdue
                  : nextBusinessDayAt(tz ?? "America/New_York", 10 + (n % 5));
                await tx`insert into public.followups (lead_id, assigned_to, created_by, kind, due_at, time_zone, notes)
                  values (${lead.id}, ${owner}, ${owner}, 'call', ${due}, ${tz}, 'Follow up on last call')`;
              }
              if (stage === 4) {
                await tx`insert into public.email_activities (lead_id, user_id, to_address, status, subject, notes)
                  values (${lead.id}, ${owner}, ${`${first.toLowerCase()}@${slug}.example.com`}, 'pending',
                    ${wants.includes("pos") ? "8staros demo times" : "This week's price list"}, 'Promised on the call.')`;
                for (const product of wants) {
                  await tx`insert into public.sales_opportunities (lead_id, product, owner_id, title, stage, value_cents)
                    values (${lead.id}, ${product}, ${owner}, ${`${name} – ${product === "pos" ? "POS subscription" : "First stock order"}`},
                      ${n % 8 === 4 && product === wants[0] ? "won" : "proposal"}, ${product === "pos" ? 89_00 * 12 : 4_500_00})`;
                }
              }
            }
          }
          n++;
        }
      }
      // One shop already on the internal do-not-call list.
      await tx`update public.companies set suppression = 'do_not_call', suppression_reason = 'Asked not to be called (seed example)'
        where id = (select id from public.companies order by created_at, name limit 1 offset 5)`;
      log(`seeded ${DEMO_USERS.length} users, ${n} companies, ${SCRIPTS.length} scripts`);
    });
  } finally {
    await sql.end();
  }
}
