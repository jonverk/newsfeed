export const RULE_CATEGORY_NAMES: Record<string, string> = {
  rules: "Core Rules",
  org: "Organization & Structure",
  logging: "Logging & Observability",
  verification: "Verification & Quality Gates",
  process: "Operational Processes",
  other: "Miscellaneous Policies",
};

// Existing entries keep their stored identifiers; the former FAQ section is
// presented alongside the other core rules, without a separate topic or button.
export function displayRuleCategory(category: string): string {
  return category === "faq" ? "rules" : category;
}
