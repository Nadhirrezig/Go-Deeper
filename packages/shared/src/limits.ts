/**
 * Largest PDF accepted anywhere: the studio upload and the converter (library and CLI).
 * Fixed by decision for step 6 (no env var, no flag): it keeps conversions light and every
 * PDF download through goexperience.travel small.
 */
export const MAX_PDF_MB = 15;
export const MAX_PDF_BYTES = MAX_PDF_MB * 1024 * 1024;
