import { db } from "./db";
import { addPayment, createClaim, setApprovedAmount } from "./claims";
import { parseAmountToMinor } from "./money";

interface SeedPayment {
  date: string;
  amount: string;
  currency?: string; // defaults to the claim's currency
  rate?: string; // required if currency differs from the claim's currency
}

interface SeedClaim {
  policy_number: string;
  insured_name: string;
  loss_date: string;
  date_notified: string;
  loss_nature: string;
  currency: string;
  estimated: string;
  approved?: string; // omit to leave the claim in "reserved" status
  payments?: SeedPayment[];
}

const claims: SeedClaim[] = [
  {
    policy_number: "MTR-2026-0011",
    insured_name: "Kwame Boateng",
    loss_date: "2026-01-05",
    date_notified: "2026-01-06",
    loss_nature: "Vehicle collision - rear end",
    currency: "GHS",
    estimated: "18500.00",
    approved: "16200.00",
    payments: [{ date: "2026-01-20", amount: "16200.00" }],
  },
  {
    policy_number: "MTR-2026-0012",
    insured_name: "Ama Serwaa",
    loss_date: "2026-01-12",
    date_notified: "2026-01-14",
    loss_nature: "Windscreen damage",
    currency: "GHS",
    estimated: "1200.00",
    approved: "1100.00",
    payments: [{ date: "2026-01-25", amount: "600.00" }],
  },
  {
    policy_number: "FIRE-2026-0044",
    insured_name: "Accra Trading Co Ltd",
    loss_date: "2025-12-02",
    date_notified: "2025-12-03",
    loss_nature: "Warehouse fire - stock damage",
    currency: "USD",
    estimated: "250000.00",
    // No approved amount yet - still under assessment.
  },
  {
    policy_number: "FIRE-2026-0045",
    insured_name: "Lagos Foods Ltd",
    loss_date: "2025-11-18",
    date_notified: "2025-11-20",
    loss_nature: "Electrical fire - office equipment",
    currency: "NGN",
    estimated: "8500000.00",
    approved: "7200000.00",
    payments: [
      { date: "2025-12-01", amount: "3000000.00" },
      { date: "2026-01-10", amount: "4200000.00" },
    ],
  },
  {
    policy_number: "MAR-2026-0007",
    insured_name: "West Coast Shipping",
    loss_date: "2026-02-01",
    date_notified: "2026-02-03",
    loss_nature: "Cargo water damage in transit",
    currency: "USD",
    estimated: "95000.00",
    approved: "80000.00",
    // Reserved in USD, but the underwriter settled part of it in GBP.
    payments: [{ date: "2026-02-15", amount: "40000.00", currency: "GBP", rate: "1.27" }],
  },
  {
    policy_number: "LIA-2026-0019",
    insured_name: "Nairobi Construction Ltd",
    loss_date: "2026-01-22",
    date_notified: "2026-01-23",
    loss_nature: "Third-party bodily injury on site",
    currency: "KES",
    estimated: "2200000.00",
    approved: "1800000.00",
    payments: [{ date: "2026-02-05", amount: "1800000.00" }],
  },
  {
    policy_number: "PRO-2026-0033",
    insured_name: "Tema Logistics",
    loss_date: "2026-02-10",
    date_notified: "2026-02-11",
    loss_nature: "Goods in transit - theft",
    currency: "GHS",
    estimated: "34000.00",
    // Not yet approved.
  },
  {
    policy_number: "MTR-2026-0020",
    insured_name: "Yaw Mensah",
    loss_date: "2025-10-30",
    date_notified: "2025-10-31",
    loss_nature: "Vehicle theft",
    currency: "GHS",
    estimated: "45000.00",
    approved: "42000.00",
    payments: [{ date: "2025-11-15", amount: "42000.00" }],
  },
  {
    policy_number: "HOM-2026-0002",
    insured_name: "Johannesburg Residential Trust",
    loss_date: "2026-01-28",
    date_notified: "2026-01-29",
    loss_nature: "Storm damage to roof",
    currency: "ZAR",
    estimated: "310000.00",
    approved: "275000.00",
    payments: [{ date: "2026-02-12", amount: "150000.00" }],
  },
  {
    policy_number: "MTR-2026-0025",
    insured_name: "Efua Owusu",
    loss_date: "2026-02-18",
    date_notified: "2026-02-19",
    loss_nature: "Minor collision - bumper damage",
    currency: "GHS",
    estimated: "3200.00",
    approved: "3200.00",
    payments: [{ date: "2026-03-01", amount: "3200.00" }],
  },
  {
    policy_number: "AVI-2026-0003",
    insured_name: "Skyline Charter Ltd",
    loss_date: "2025-09-14",
    date_notified: "2025-09-16",
    loss_nature: "Ground handling equipment damage",
    currency: "USD",
    estimated: "62000.00",
    approved: "62000.00",
    payments: [{ date: "2025-10-01", amount: "62000.00" }],
  },
  {
    policy_number: "PRO-2026-0040",
    insured_name: "Osaka Import Partners",
    loss_date: "2026-01-08",
    date_notified: "2026-01-09",
    loss_nature: "Damaged electronics shipment",
    currency: "JPY",
    estimated: "4500000",
    approved: "3900000",
    payments: [{ date: "2026-01-30", amount: "2000000" }],
  },
  {
    policy_number: "LIA-2026-0028",
    insured_name: "Cape Coast Manufacturing",
    loss_date: "2025-12-20",
    date_notified: "2025-12-22",
    loss_nature: "Product liability claim",
    currency: "GHS",
    estimated: "58000.00",
    // Under investigation, not approved.
  },
  {
    policy_number: "MTR-2026-0031",
    insured_name: "Kojo Antwi",
    loss_date: "2026-02-25",
    date_notified: "2026-02-26",
    loss_nature: "Hit and run - side panel damage",
    currency: "GHS",
    estimated: "7800.00",
    approved: "7000.00",
    // Approved but nothing paid out yet.
  },
  {
    policy_number: "FIRE-2026-0050",
    insured_name: "Kumasi Retail Group",
    loss_date: "2025-08-11",
    date_notified: "2025-08-12",
    loss_nature: "Kitchen fire - restaurant unit",
    currency: "GHS",
    estimated: "22000.00",
    approved: "19500.00",
    payments: [
      { date: "2025-09-01", amount: "10000.00" },
      { date: "2025-09-20", amount: "9500.00" },
    ],
  },
  {
    policy_number: "HOM-2026-0009",
    insured_name: "Adjoa Darko",
    loss_date: "2026-02-02",
    date_notified: "2026-02-04",
    loss_nature: "Burst pipe - water damage",
    currency: "GHS",
    estimated: "9600.00",
    approved: "9600.00",
    payments: [{ date: "2026-02-20", amount: "9600.00" }],
  },
  {
    policy_number: "MAR-2026-0012",
    insured_name: "Gulf Trade Partners",
    loss_date: "2025-07-19",
    date_notified: "2025-07-21",
    loss_nature: "Container lost overboard",
    currency: "KWD",
    estimated: "15000.000",
    approved: "15000.000",
    payments: [{ date: "2025-08-05", amount: "15000.000" }],
  },
  {
    policy_number: "LIA-2026-0035",
    insured_name: "Takoradi Port Services",
    loss_date: "2026-01-15",
    date_notified: "2026-01-16",
    loss_nature: "Crane operator injury claim",
    currency: "USD",
    estimated: "40000.00",
    approved: "36000.00",
    // Overpaid slightly in the settlement currency conversion - still counts as fully paid.
    payments: [{ date: "2026-02-01", amount: "32000.00", currency: "EUR", rate: "1.13" }],
  },
];

export function seed(): void {
  const existing = db.prepare(`SELECT COUNT(*) AS n FROM claims`).get() as { n: number };
  if (existing.n > 0) {
    console.log(`Database already has ${existing.n} claim(s); skipping seed.`);
    return;
  }

  for (const c of claims) {
    const claimId = createClaim({
      policy_number: c.policy_number,
      insured_name: c.insured_name,
      loss_date: c.loss_date,
      date_notified: c.date_notified,
      loss_nature: c.loss_nature,
      currency: c.currency,
      estimated_minor: parseAmountToMinor(c.estimated, c.currency),
    });

    if (c.approved) {
      setApprovedAmount(claimId, parseAmountToMinor(c.approved, c.currency));
    }

    for (const p of c.payments ?? []) {
      const paymentCurrency = p.currency ?? c.currency;
      addPayment({
        claim_id: claimId,
        payment_date: p.date,
        currency: paymentCurrency,
        amount_minor: parseAmountToMinor(p.amount, paymentCurrency),
        fx_rate: p.rate ?? null,
      });
    }
  }

  console.log(`Seeded ${claims.length} claims.`);
}

// Allow `npm run seed` (or `tsx src/seed.ts`) to run this directly, while
// server.ts can also import { seed } and call it once at startup.
if (require.main === module) {
  seed();
}
