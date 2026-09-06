import { Router } from "express";
import {
  addPayment,
  ClaimStatus,
  createClaim,
  getClaim,
  getPayments,
  listClaims,
  setApprovedAmount,
  STATUS_LABELS,
  totalsByCurrency,
} from "../claims";
import { CURRENCIES, CURRENCY_CODES, parseAmountToMinor } from "../money";

export const claimsRouter = Router();

const STATUS_VALUES: ClaimStatus[] = ["reserved", "outstanding", "paid"];

function asStatus(value: unknown): ClaimStatus | undefined {
  return typeof value === "string" && (STATUS_VALUES as string[]).includes(value)
    ? (value as ClaimStatus)
    : undefined;
}

function asCurrency(value: unknown): string | undefined {
  return typeof value === "string" && CURRENCY_CODES.includes(value) ? value : undefined;
}

claimsRouter.get("/", (req, res) => {
  const filters = {
    from: typeof req.query.from === "string" && req.query.from ? req.query.from : undefined,
    to: typeof req.query.to === "string" && req.query.to ? req.query.to : undefined,
    status: asStatus(req.query.status),
    currency: asCurrency(req.query.currency),
  };

  const claims = listClaims(filters);
  const totals = totalsByCurrency(claims);

  res.render("index", {
    claims,
    totals,
    filters: req.query,
    currencies: CURRENCIES,
    statusValues: STATUS_VALUES,
    statusLabels: STATUS_LABELS,
  });
});

claimsRouter.get("/new", (_req, res) => {
  res.render("new", { currencies: CURRENCIES, error: null, form: {} });
});

claimsRouter.post("/", (req, res) => {
  const body = req.body as Record<string, string>;
  try {
    const currency = asCurrency(body.currency);
    if (!currency) throw new Error("Please choose a valid currency");

    const claimId = createClaim({
      policy_number: body.policy_number?.trim(),
      insured_name: body.insured_name?.trim(),
      loss_date: body.loss_date,
      date_notified: body.date_notified,
      loss_nature: body.loss_nature?.trim(),
      currency,
      estimated_minor: parseAmountToMinor(body.estimated_amount, currency),
    });
    res.redirect(`/claims/${claimId}`);
  } catch (err) {
    res.status(400).render("new", {
      currencies: CURRENCIES,
      error: (err as Error).message,
      form: body,
    });
  }
});

claimsRouter.get("/:id", (req, res) => {
  const claim = getClaim(Number(req.params.id));
  if (!claim) return res.status(404).render("error", { message: "Claim not found" });

  const payments = getPayments(claim.id);
  res.render("claim", {
    claim,
    payments,
    statusLabels: STATUS_LABELS,
    currencies: CURRENCIES,
    error: null,
  });
});

claimsRouter.post("/:id/approve", (req, res) => {
  const claim = getClaim(Number(req.params.id));
  if (!claim) return res.status(404).render("error", { message: "Claim not found" });

  try {
    const approvedMinor = parseAmountToMinor(req.body.approved_amount, claim.currency);
    setApprovedAmount(claim.id, approvedMinor);
    res.redirect(`/claims/${claim.id}`);
  } catch (err) {
    res.status(400).render("claim", {
      claim,
      payments: getPayments(claim.id),
      statusLabels: STATUS_LABELS,
      currencies: CURRENCIES,
      error: (err as Error).message,
    });
  }
});

claimsRouter.post("/:id/payments", (req, res) => {
  const claim = getClaim(Number(req.params.id));
  if (!claim) return res.status(404).render("error", { message: "Claim not found" });

  try {
    const currency = asCurrency(req.body.currency);
    if (!currency) throw new Error("Please choose a valid currency");

    addPayment({
      claim_id: claim.id,
      payment_date: req.body.payment_date,
      currency,
      amount_minor: parseAmountToMinor(req.body.amount, currency),
      fx_rate: currency === claim.currency ? null : req.body.fx_rate,
    });
    res.redirect(`/claims/${claim.id}`);
  } catch (err) {
    res.status(400).render("claim", {
      claim,
      payments: getPayments(claim.id),
      statusLabels: STATUS_LABELS,
      currencies: CURRENCIES,
      error: (err as Error).message,
    });
  }
});
