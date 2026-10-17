/** Codes whose argument runs until the next ";" and is dropped. */
const ARGUMENT_CODES = new Set(["f", "F", "H", "C", "c", "T", "Q", "W", "A", "p"]);
/** Toggle codes without arguments (underline, overline, strike-through). */
const TOGGLE_CODES = new Set(["L", "l", "O", "o", "K", "k"]);

/**
 * Converts an MTEXT string with inline format codes into plain lines.
 * Formatting (fonts, colors, heights) is dropped; stacked fractions become
 * "a/b"; paragraph breaks (\P) split lines.
 */
export function mtextToLines(value: string): string[] {
  const lines: string[] = [];
  let current = "";
  let index = 0;
  while (index < value.length) {
    const char = value[index] as string;
    if (char === "{" || char === "}") {
      index++;
      continue;
    }
    if (char !== "\\") {
      current += char;
      index++;
      continue;
    }
    const code = value[index + 1] ?? "";
    index += 2;
    if (code === "P" || code === "n" || code === "N") {
      lines.push(current);
      current = "";
    } else if (code === "~") {
      current += "\u00a0";
    } else if (code === "\\" || code === "{" || code === "}") {
      current += code;
    } else if (code === "S") {
      const end = value.indexOf(";", index);
      const stacked = value.slice(index, end < 0 ? value.length : end);
      current += stacked.replace(/[\^#/]/, "/").trim();
      index = end < 0 ? value.length : end + 1;
    } else if (ARGUMENT_CODES.has(code)) {
      const end = value.indexOf(";", index);
      index = end < 0 ? value.length : end + 1;
    } else if (!TOGGLE_CODES.has(code)) {
      // Unknown code: drop it, keep going.
    }
  }
  lines.push(current);
  return lines;
}

/** Greedy word wrap of each line to `width`; width 0 disables wrapping. */
export function wrapLines(
  lines: readonly string[],
  width: number,
  measure: (text: string) => number,
): string[] {
  if (!(width > 0)) return [...lines];
  const wrapped: string[] = [];
  for (const line of lines) {
    let current = "";
    for (const word of line.split(" ")) {
      const candidate = current === "" ? word : `${current} ${word}`;
      if (current !== "" && measure(candidate) > width) {
        wrapped.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    wrapped.push(current);
  }
  return wrapped;
}
