import { viewerError } from "../loaders/errors";

/** One DXF group: an integer group code and its raw string value. */
export interface DxfPair {
  code: number;
  value: string;
  /** 1-based line number of the group code, for error messages. */
  line: number;
}

const GROUP_CODE = /^-?\d+$/;

/**
 * Splits ASCII DXF text into group code/value pairs. Accepts LF, CRLF and CR
 * line endings, a leading BOM and padded group codes. Values are kept
 * verbatim: spaces are significant in texts (MTEXT chunks may end in one);
 * readers trim names and numbers where they use them.
 */
export function tokenize(text: string): DxfPair[] {
  const lines = text.split(/\r\n|\r|\n/);
  if (lines[0]?.charCodeAt(0) === 0xfeff) lines[0] = lines[0].slice(1);
  let end = lines.length;
  while (end > 0 && (lines[end - 1] ?? "").trim() === "") end--;

  const pairs: DxfPair[] = [];
  for (let index = 0; index < end; index += 2) {
    const raw = (lines[index] ?? "").trim();
    if (!GROUP_CODE.test(raw))
      throw viewerError("dxf-invalid-group-code", { value: raw, line: index + 1 });
    if (index + 1 >= end)
      throw viewerError("dxf-missing-value", { groupCode: Number(raw), line: index + 1 });
    pairs.push({ code: Number(raw), value: lines[index + 1] ?? "", line: index + 1 });
  }
  return pairs;
}
