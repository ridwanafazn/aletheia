export function toMinorUnits(value: string): bigint {
  const [whole = "0", fraction = ""] = value.split(".");
  const normalizedFraction = (fraction + "00").slice(0, 2);
  return BigInt(whole) * 100n + BigInt(normalizedFraction);
}

export function compareMoney(left: string, right: string): number {
  const leftMinor = toMinorUnits(left);
  const rightMinor = toMinorUnits(right);
  if (leftMinor === rightMinor) {
    return 0;
  }
  return leftMinor > rightMinor ? 1 : -1;
}

export function isPositiveMoney(value: string): boolean {
  return toMinorUnits(value) > 0n;
}
