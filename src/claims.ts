import { db } from "./db";
import { convertMinor } from "./money";

export type ClaimStatus =
  | "reserved" // no approved amount set yet
  | "outstanding" // approved amount set, balance still above zero
  | "paid"; // approved amount set, balance is zero or below

export const STATUS_LABELS: Record<ClaimStatus, string> = {
  reserved: "Reserved, not yet settled",
  outstanding: "Settled, payment outstanding",
  paid: "Settled and paid",
};

export interface ClaimRow {
  id: number;
  policy_number: string;
  insured_name: string;
  loss_date: string;
  date_notified: string;
  loss_nature: string;
  currency: string;
  estimated_minor: number;
  approved_minor: number | null;
  created_at: string;
}

export interface PaymentRow {
  id: number;
  claim_id: number;
  payment_date: string;
  currency: string;
  amount_minor: number;
  fx_rate: string | null;
  converted_minor: number;
  created_at: string;
}

export interface ClaimWithTotals extends ClaimRow {
  total_paid_minor: number;
  balance_minor: number | null; // null when no approved amount has been set
  status: ClaimStatus;
}

function deriveStatusAndBalance(
  approved_minor: number | null,
  total_paid_minor: number,
): { status: ClaimStatus; balance_minor: number | null } {
  if (approved_minor === null) {
    return { status: "reserved", balance_minor: null };
  }
  const balance_minor = approved_minor - total_paid_minor;
  return {
    status: balance_minor > 0 ? "outstanding" : "paid",
    balance_minor,
  };
}

function withTotals(claim: ClaimRow): ClaimWithTotals {
  const { total: totalPaidMinor } = db
    .prepare(
      `SELECT COALESCE(SUM(converted_minor), 0) AS total FROM payments WHERE claim_id = ?`,
    )
    .get(claim.id) as { total: number };

  const { status, balance_minor } = deriveStatusAndBalance(
    claim.approved_minor,
    totalPaidMinor,
  );

  return {
    ...claim,
    total_paid_minor: totalPaidMinor,
    balance_minor,
    status,
  };
}

export function getClaim(id: number): ClaimWithTotals | undefined {
  const claim = db.prepare(`SELECT * FROM claims WHERE id = ?`).get(id) as
    | ClaimRow
    | undefined;
  return claim ? withTotals(claim) : undefined;
}

export function getPayments(claimId: number): PaymentRow[] {
  return db
    .prepare(`SELECT * FROM payments WHERE claim_id = ? ORDER BY payment_date, id`)
    .all(claimId) as PaymentRow[];
}

export interface ClaimFilters {
  from?: string;
  to?: string;
  status?: ClaimStatus;
  currency?: string;
}

/** Lists claims (with derived totals) matching the given filters, newest loss first. */
export function listClaims(filters: ClaimFilters): ClaimWithTotals[] {
  const clauses: string[] = [];
  const params: Record<string, string> = {};

  if (filters.from) {
    clauses.push("loss_date >= @from");
    params.from = filters.from;
  }
  if (filters.to) {
    clauses.push("loss_date <= @to");
    params.to = filters.to;
  }
  if (filters.currency) {
    clauses.push("currency = @currency");
    params.currency = filters.currency;
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .prepare(`SELECT * FROM claims ${where} ORDER BY loss_date DESC, id DESC`)
    .all(params) as ClaimRow[];

  let claims = rows.map(withTotals);
  if (filters.status) {
    claims = claims.filter((c) => c.status === filters.status);
  }
  return claims;
}

export interface CurrencyTotals {
  currency: string;
  estimated_minor: number;
  approved_minor: number;
  paid_minor: number;
  outstanding_minor: number;
  count: number;
}

/** Totals grouped by currency, for the footer row of the list view. */
export function totalsByCurrency(claims: ClaimWithTotals[]): CurrencyTotals[] {
  const byCurrency = new Map<string, CurrencyTotals>();
  for (const claim of claims) {
    let bucket = byCurrency.get(claim.currency);
    if (!bucket) {
      bucket = {
        currency: claim.currency,
        estimated_minor: 0,
        approved_minor: 0,
        paid_minor: 0,
        outstanding_minor: 0,
        count: 0,
      };
      byCurrency.set(claim.currency, bucket);
    }
    bucket.count += 1;
    bucket.estimated_minor += claim.estimated_minor;
    bucket.approved_minor += claim.approved_minor ?? 0;
    bucket.paid_minor += claim.total_paid_minor;
    // Outstanding only makes sense once a claim is approved; unapproved
    // (reserved) claims contribute nothing to the outstanding total.
    bucket.outstanding_minor += claim.balance_minor && claim.balance_minor > 0
      ? claim.balance_minor
      : 0;
  }
  return [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

export interface NewClaimInput {
  policy_number: string;
  insured_name: string;
  loss_date: string;
  date_notified: string;
  loss_nature: string;
  currency: string;
  estimated_minor: number;
}

export function createClaim(input: NewClaimInput): number {
  const result = db
    .prepare(
      `INSERT INTO claims (policy_number, insured_name, loss_date, date_notified, loss_nature, currency, estimated_minor)
       VALUES (@policy_number, @insured_name, @loss_date, @date_notified, @loss_nature, @currency, @estimated_minor)`,
    )
    .run(input);
  return Number(result.lastInsertRowid);
}

export function setApprovedAmount(claimId: number, approvedMinor: number): void {
  db.prepare(`UPDATE claims SET approved_minor = ? WHERE id = ?`).run(
    approvedMinor,
    claimId,
  );
}

export interface NewPaymentInput {
  claim_id: number;
  payment_date: string;
  currency: string;
  amount_minor: number;
  fx_rate: string | null; // required when currency differs from the claim's currency
}

export function addPayment(input: NewPaymentInput): number {
  const claim = db
    .prepare(`SELECT currency FROM claims WHERE id = ?`)
    .get(input.claim_id) as { currency: string } | undefined;
  if (!claim) throw new Error(`Claim ${input.claim_id} not found`);

  let convertedMinor: number;
  let fxRate: string | null = null;
  if (input.currency === claim.currency) {
    convertedMinor = input.amount_minor;
  } else {
    if (!input.fx_rate) {
      throw new Error(
        `An exchange rate is required: payment is in ${input.currency} but the claim is reserved in ${claim.currency}`,
      );
    }
    fxRate = input.fx_rate;
    convertedMinor = convertMinor(
      input.amount_minor,
      input.currency,
      claim.currency,
      input.fx_rate,
    );
  }

  const result = db
    .prepare(
      `INSERT INTO payments (claim_id, payment_date, currency, amount_minor, fx_rate, converted_minor)
       VALUES (@claim_id, @payment_date, @currency, @amount_minor, @fx_rate, @converted_minor)`,
    )
    .run({
      claim_id: input.claim_id,
      payment_date: input.payment_date,
      currency: input.currency,
      amount_minor: input.amount_minor,
      fx_rate: fxRate,
      converted_minor: convertedMinor,
    });
  return Number(result.lastInsertRowid);
}
