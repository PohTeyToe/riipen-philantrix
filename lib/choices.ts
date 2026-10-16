// The options a choice question prints on the funder's form, so staff answer
// it in one click. pdftotext runs a checkbox list into one line ("Cash only
// In-kind ... only Both") and the recorded runs keep the question, not its
// options, so they're copied here from each form's text by hand.
// tests/forms.test.ts checks every option is on its form, word for word.

export interface Choice {
  options: string[];
  /** The form asks for every option that applies. */
  many?: boolean;
}

const CHOICES: Record<string, Record<string, Choice>> = {
  'grey-highlands': {
    'q1.1': { options: ['Cash only', 'In-kind (including venue rental waivers) only', 'Both'] },
    'q4.1': { options: ['Economic Prosperity and Innovation', 'Cultural Enhancement, Environment and Diversity', 'General Social Enrichment'] },
    'q10.3': { options: ['Municipal Resources', 'Project Partner'] },
  },
  'geist-foster-youth': {
    'q4.1': { options: ['permanence', 'education', 'employment', 'housing', 'physical and mental health', 'personal and community engagement'], many: true },
  },
};

export const choiceFor = (formId: string, fieldId: string): Choice | null => CHOICES[formId]?.[fieldId] ?? null;

export const allChoices = (): { formId: string; fieldId: string; choice: Choice }[] =>
  Object.entries(CHOICES).flatMap(([formId, fields]) => Object.entries(fields).map(([fieldId, choice]) => ({ formId, fieldId, choice })));

/** Many answers are kept as one string, "education; housing". */
export const SEP = '; ';

/** The form's question without the run-together options pdftotext left on the end of it. */
export function withoutOptions(quote: string, options: string[]): string {
  let t = quote.trimEnd();
  for (const o of [...options].reverse()) if (t.endsWith(o)) t = t.slice(0, -o.length).trimEnd();
  return t === quote.trimEnd() ? quote : t.replace(/:$/, '');
}
