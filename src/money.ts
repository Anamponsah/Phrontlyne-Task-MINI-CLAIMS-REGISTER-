/**
 * All money is stored and computed as integer "minor units" (e.g. cents) to
 * avoid floating point drift. Each currency has its own number of decimal
 * places (JPY has 0, KWD has 3, most others have 2), per ISO 4217.
 */

export interface Currency {
  code: string;
  name: string;
  decimals: number;
}

export const CURRENCIES: Currency[] = [
  { code: "USD", name: "US Dollar", decimals: 2 },
  { code: "GBP", name: "British Pound", decimals: 2 },
  { code: "EUR", name: "Euro", decimals: 2 },
  { code: "GHS", name: "Ghanaian Cedi", decimals: 2 },
  { code: "NGN", name: "Nigerian Naira", decimals: 2 },
  { code: "KES", name: "Kenyan Shilling", decimals: 2 },
  { code: "ZAR", name: "South African Rand", decimals: 2 },
  { code: "JPY", name: "Japanese Yen", decimals: 0 },
  { code: "KWD", name: "Kuwaiti Dinar", decimals: 3 },
];

export const CURRENCY_CODES = CURRENCIES.map((c) => c.code);

const DECIMALS_BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c.decimals]));

export function decimalsFor(currency: string): number {
  const d = DECIMALS_BY_CODE.get(currency);
  if (d === undefined) throw new Error(`Unknown currency: ${currency}`);
  return d;
}

/**
 * Parses a decimal amount typed by a user (e.g. "1234.5") into integer minor
 * units for the given currency (e.g. 123450 for a 2-decimal currency).
 * Parsed as a string, digit by digit, rather than via parseFloat, so the
 * result is exact regardless of binary floating point representation.
 */
export function parseAmountToMinor(input: string, currency: string): number {
  const decimals = decimalsFor(currency);
  const trimmed = input.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid amount: "${input}"`);
  }
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [wholePart, fractionPart = ""] = unsigned.split(".");
  if (fractionPart.length > decimals) {
    throw new Error(
      `${currency} only supports ${decimals} decimal place(s), got "${input}"`,
    );
  }
  const paddedFraction = fractionPart.padEnd(decimals, "0");
  const minor = BigInt(wholePart + paddedFraction || "0");
  const signed = negative ? -minor : minor;
  if (signed < 0n) throw new Error("Amounts must not be negative");
  return Number(signed);
}

/** Formats integer minor units back into a human decimal string, e.g. 123450 -> "1234.50". */
export function formatMinor(minor: number, currency: string): string {
  const decimals = decimalsFor(currency);
  const negative = minor < 0;
  const abs = Math.abs(minor).toString().padStart(decimals + 1, "0");
  const whole = abs.slice(0, abs.length - decimals) || "0";
  const fraction = decimals > 0 ? "." + abs.slice(abs.length - decimals) : "";
  return (negative ? "-" : "") + whole + fraction;
}

/**
 * Converts an amount in minor units of `fromCurrency` into minor units of
 * `toCurrency`, using `rate` = "how many units of toCurrency per 1 unit of
 * fromCurrency". Uses BigInt fixed-point math throughout (rate is captured
 * to 6 decimal places) and rounds half-up only once, at the very end, so a
 * payment made in a different currency than its claim converts exactly and
 * reproducibly instead of drifting through repeated float rounding.
 */
export function convertMinor(
  amountMinor: number,
  fromCurrency: string,
  toCurrency: string,
  rate: string,
): number {
  if (fromCurrency === toCurrency) {
    return amountMinor;
  }
  const fromDecimals = decimalsFor(fromCurrency);
  const toDecimals = decimalsFor(toCurrency);
  const RATE_SCALE = 1_000_000n; // rate captured to 6 decimal places
  const rateScaled = parseRateToScaled(rate, RATE_SCALE);

  const numerator =
    BigInt(amountMinor) * rateScaled * 10n ** BigInt(toDecimals);
  const denominator = RATE_SCALE * 10n ** BigInt(fromDecimals);

  return Number(roundHalfUpDiv(numerator, denominator));
}

function parseRateToScaled(rate: string, scale: bigint): bigint {
  const trimmed = rate.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed) || Number(trimmed) <= 0) {
    throw new Error(`Invalid exchange rate: "${rate}"`);
  }
  const [wholePart, fractionPart = ""] = trimmed.split(".");
  const scaleDigits = scale.toString().length - 1;
  if (fractionPart.length > scaleDigits) {
    // Round the extra precision away rather than reject it.
    const kept = fractionPart.slice(0, scaleDigits);
    const nextDigit = fractionPart[scaleDigits];
    let scaled = BigInt(wholePart + kept.padEnd(scaleDigits, "0"));
    if (nextDigit && Number(nextDigit) >= 5) scaled += 1n;
    return scaled;
  }
  return BigInt(wholePart + fractionPart.padEnd(scaleDigits, "0"));
}

function roundHalfUpDiv(numerator: bigint, denominator: bigint): bigint {
  const doubled = 2n * numerator + denominator;
  return doubled / (2n * denominator);
}
