import type { PdfDocument } from "@reflowpress/core";

export interface PdfValidationResult {
  readonly valid: boolean;
  readonly issues: readonly string[];
}

/** PDF output validation policy is defined in a later phase. */
export interface PdfValidator {
  validate(document: PdfDocument): Promise<PdfValidationResult>;
}
