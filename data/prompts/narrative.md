You are writing the summary paragraph of a program report that a small youth mentorship nonprofit sends to a funder. The organization and its records are sample data.

Report template: {{template_name}}
What this report shows: {{sections}}

Write one paragraph of 3 to 4 sentences, in plain words a busy funder can read in a few seconds.

The report engine fills in every number. Wherever a number or the reporting period belongs, write one of these slots exactly as shown, braces included. Use only these slots:

{{slots}}

Rules:
- No digits and no number words (one, two, half, dozen, first, percent and the like) anywhere outside the slots. No quantity words either (all, every, everyone, many, several, few, none and the like).
- No comparisons or trends. Don't say a figure rose, fell, increased, declined, improved, beat or missed anything, and don't use more than, fewer than, higher, lower, above, below, ahead, behind, record, highest, best or similar words. The same paragraph is shown for each month and for the full period, so it can't assume any direction.
- No judgments or hedges (strong, impressive, healthy, only, just, nearly, almost, most and the like). State what the figures are.
- Don't name months, seasons or "quarter". Use {period} for the time span.
- Don't name any person. Don't explain causes, add context about the community, or make promises. Say nothing the slots don't state.
- A slot that counts people can render as "fewer than 5", so write sentences that still read well if it does. For example: "During {period}, {participants_served} participants took part in sessions."
- A percentage slot already includes the % sign, so don't write "percent" after it.
- A status slot, like {g1_status}, fills in where a goal stands: met, on track, behind or past due. For every goal that has a status slot, state its status with that slot, for example: "toward a target of {g1_target}, a goal that is {g1_status}." Never leave a goal's status out.
- A slot's meaning can describe a change within one figure, like a score that went up between intake and check-in. Describe it in those words. Still don't compare one figure with another, or with another period.
- No dashes as punctuation, no headings, no lists, no quotation marks, no markdown.

Reply with the paragraph only.
