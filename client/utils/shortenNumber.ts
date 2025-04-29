/**
 * Shortens a large number with k, M, B, T suffixes.
 * Rounds to one decimal place, removing the decimal if it's .0
 *
 * @param num The number to shorten.
 * @returns  The shortened number string (e.g., "1.4k", "24.2k", "1M").
 */
export function shortenNumber(num: number): string {
  // Handle 0 explicitly
  if (num === 0) {
    return '0';
  }

  // Handle negative numbers by processing the absolute value and adding the sign later
  const absNum = Math.abs(num);
  const sign = num < 0 ? '-' : '';

  // Define the suffixes for powers of 1000
  // ['', 'k', 'M', 'B', 'T'] correspond to 10^0, 10^3, 10^6, 10^9, 10^12
  const suffixes = ['', 'k', 'M', 'B', 'T'];

  // Determine the magnitude (power of 1000)
  // Math.log10(absNum) gives the base 10 logarithm. Dividing by 3 gives the base 1000 logarithm.
  // Math.floor gets the integer part, which is our magnitude index (0 for <1000, 1 for k, 2 for M, etc.)
  // Use Math.max(0, ...) to ensure magnitude is at least 0 for numbers between 0 and 1.
  let magnitude = Math.floor(Math.log10(absNum) / 3);

  // Clamp the magnitude to the available suffixes
  magnitude = Math.min(magnitude, suffixes.length - 1);

  // Calculate the divisor based on the magnitude
  const divisor = Math.pow(1000, magnitude);

  // Divide the number by the divisor
  let shortened = absNum / divisor; // e.g., 1429 / 1000 = 1.429; 999999 / 1000 = 999.999

  // Check if rounding `shortened` to 1 decimal place would push it to the next magnitude (e.g., 999.999 rounds to 1000.0)
  // This happens when `shortened` is 999.5 or greater, and we are not at the largest suffix already.
  // If it is, increment the magnitude and redo the division/formatting.
  // This correctly handles numbers like 999,500 (which should round to 1.0M) or 999,999 (rounds to 1.0M).
  if (shortened >= 999.5 && magnitude < suffixes.length - 1) {
    magnitude++; // Move to the next magnitude (e.g., k -> M)
    // Recalculate divisor and shortened number for the new magnitude
    const newDivisor = Math.pow(1000, magnitude);
    shortened = absNum / newDivisor; // e.g., 999999 / 1000000 = 0.999999
  }

  // Format the number to one decimal place
  let formatted = shortened.toFixed(1); // e.g., 1.429 -> "1.4"; 999.999 -> "1000.0"; 0.999999 -> "1.0"

  // Remove trailing ".0" if the decimal part is zero
  formatted = formatted.replace(/\.0$/, ''); // e.g., "1.4", "1000", "1"

  // Get the correct suffix for the *final* magnitude
  const suffix = suffixes[magnitude]; // e.g., "k", "k", "M"

  // Combine sign, formatted number, and suffix
  return sign + formatted + suffix;
}
