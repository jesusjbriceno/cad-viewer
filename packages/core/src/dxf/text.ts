const CONTROL_CODES: Record<string, string> = { d: "°", c: "⌀", p: "±", "%": "%", u: "", o: "" };

/** Decodes `\U+XXXX` escapes used by DXF/DWG for characters outside the code page. */
export function decodeUnicodeEscapes(value: string): string {
  return value.replace(/\\U\+([0-9a-fA-F]{4})/g, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

/**
 * Decodes single-line TEXT/ATTRIB values: `\U+XXXX` escapes and the `%%`
 * control codes (degree, diameter, plus/minus, literal percent, character by
 * decimal code). Underline/overline toggles are dropped.
 */
export function decodeTextValue(value: string): string {
  return decodeUnicodeEscapes(value).replace(/%%(\d{3}|[dDcCpPuUoO%])/g, (_, code: string) => {
    if (/^\d{3}$/.test(code)) return String.fromCharCode(Number(code));
    return CONTROL_CODES[code.toLowerCase()] ?? "";
  });
}

const CODEPAGE = /\$DWGCODEPAGE\s*\r?\n\s*3\s*\r?\n\s*(\S+)/;

/** TextDecoder label for a DXF code page name such as "ANSI_1251". */
function codePageLabel(name: string | undefined): string {
  const match = /^ANSI_(125\d)$/i.exec(name ?? "");
  return match ? `windows-${match[1]}` : "windows-1252";
}

/**
 * Decodes DXF bytes. R2007+ files are UTF-8; older files use the ANSI code
 * page named by `$DWGCODEPAGE`, which is used whenever the bytes are not
 * valid UTF-8.
 */
export function decodeDxfBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    const head = new TextDecoder("latin1").decode(bytes.subarray(0, 64 * 1024));
    return new TextDecoder(codePageLabel(CODEPAGE.exec(head)?.[1])).decode(bytes);
  }
}
