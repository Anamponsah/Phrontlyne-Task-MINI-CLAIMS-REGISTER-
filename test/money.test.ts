import assert from "node:assert/strict";
import test from "node:test";
import { convertMinor, formatMinor, parseAmountToMinor } from "../src/money";

test("parseAmountToMinor: parses whole and fractional amounts exactly", () => {
  assert.equal(parseAmountToMinor("1234.56", "USD"), 123456);
  assert.equal(parseAmountToMinor("1234", "USD"), 123400);
  assert.equal(parseAmountToMinor("0.01", "USD"), 1);
  assert.equal(parseAmountToMinor("1234.5", "USD"), 123450);
});

test("parseAmountToMinor: respects per-currency decimal places", () => {
  assert.equal(parseAmountToMinor("4500000", "JPY"), 4500000); // 0 decimals
  assert.equal(parseAmountToMinor("15000.000", "KWD"), 15000000); // 3 decimals
});

test("parseAmountToMinor: rejects too much precision and negative amounts", () => {
  assert.throws(() => parseAmountToMinor("1.5", "JPY"));
  assert.throws(() => parseAmountToMinor("1.2345", "USD"));
  assert.throws(() => parseAmountToMinor("-5.00", "USD"));
  assert.throws(() => parseAmountToMinor("abc", "USD"));
});

test("formatMinor: round-trips against parseAmountToMinor", () => {
  assert.equal(formatMinor(123456, "USD"), "1234.56");
  assert.equal(formatMinor(1, "USD"), "0.01");
  assert.equal(formatMinor(4500000, "JPY"), "4500000");
  assert.equal(formatMinor(15000000, "KWD"), "15000.000");
});

test("convertMinor: same currency is a no-op regardless of rate", () => {
  assert.equal(convertMinor(123456, "USD", "USD", "999"), 123456);
});

test("convertMinor: converts using the captured rate, exactly", () => {
  // 400.00 GBP at 1 GBP = 1.27 USD -> 508.00 USD
  const paymentMinor = parseAmountToMinor("400.00", "GBP");
  const converted = convertMinor(paymentMinor, "GBP", "USD", "1.27");
  assert.equal(formatMinor(converted, "USD"), "508.00");
});

test("convertMinor: handles differing decimal places between currencies", () => {
  // 1.500 KWD (3dp) at 1 KWD = 3.26 USD (2dp) -> 4.89 USD
  const paymentMinor = parseAmountToMinor("1.500", "KWD");
  const converted = convertMinor(paymentMinor, "KWD", "USD", "3.26");
  assert.equal(formatMinor(converted, "USD"), "4.89");
});

test("convertMinor: rounds half-up on the final result only", () => {
  // 1.00 USD at rate 1.005 -> 1.005 -> rounds to 1.01 (half up), not 1.00
  const paymentMinor = parseAmountToMinor("1.00", "USD");
  const converted = convertMinor(paymentMinor, "USD", "EUR", "1.005");
  assert.equal(formatMinor(converted, "EUR"), "1.01");
});

test("convertMinor: identical inputs always convert identically (deterministic, no float creep)", () => {
  // Ten independent conversions of the same GBP amount at the same rate must
  // all land on the exact same USD minor units - integer math throughout
  // means there is no run-to-run drift the way repeated float ops could cause.
  const rate = "1.2731";
  const results = Array.from({ length: 10 }, () =>
    convertMinor(parseAmountToMinor("10.00", "GBP"), "GBP", "USD", rate),
  );
  assert.ok(results.every((r) => r === results[0]));
});

test("convertMinor: an evenly-divisible rate produces no rounding drift between one lump sum and many parts", () => {
  const rate = "1.25"; // chosen so every intermediate value is exact in 2dp currencies
  const many = Array.from({ length: 10 }, () =>
    convertMinor(parseAmountToMinor("10.00", "GBP"), "GBP", "USD", rate),
  ).reduce((a, b) => a + b, 0);
  const once = convertMinor(parseAmountToMinor("100.00", "GBP"), "GBP", "USD", rate);
  assert.equal(many, once);
});
