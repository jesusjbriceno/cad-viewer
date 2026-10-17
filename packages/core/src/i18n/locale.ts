/** Languages with built-in texts. */
export type CadLocale = "es-ES" | "en";

export const SUPPORTED_LOCALES: readonly CadLocale[] = ["es-ES", "en"];

/** Language used when no locale is given. */
export const DEFAULT_LOCALE: CadLocale = "es-ES";

/** Language used when the requested locale is not supported. */
export const FALLBACK_LOCALE: CadLocale = "en";

/**
 * Maps any BCP 47 tag to a supported locale by its language: no tag gives
 * `es-ES`, any Spanish tag gives `es-ES`, anything else gives `en`.
 */
export function resolveLocale(locale?: string | null): CadLocale {
  if (!locale) return DEFAULT_LOCALE;
  const language = locale.trim().split(/[-_]/)[0]?.toLowerCase();
  if (language === "es") return "es-ES";
  return FALLBACK_LOCALE;
}
