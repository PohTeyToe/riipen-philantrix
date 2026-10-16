Here is the text of a funder's reporting form, extracted from its PDF. Table cells can run into each other, and some punctuation is lost.

<form title="{{title}}" funder="{{funder}}">
{{text}}
</form>

List every question or measure the grantee has to answer. Skip contact details, addresses, signatures, attachments to upload, and instructions about how or when to submit. Keep every other question, including ones about money, partners and plans.

For each question:
- id: "q" plus its number on the form if it has one (q6), otherwise q1, q2 and so on, in the form's order.
- number: as printed, or null.
- title: a short label of at most 8 words, in the form's own words.
- quote: the question as printed, copied word for word from the text above. You may stop at the end of a sentence, but don't change, add or reorder any word.
- fields: what the grantee enters.
  - A measure with lettered data items (A, B, C) has one field per letter, with ids like "q6.A".
  - A question with one answer has one field, with an id like "q3.1".
  - A question that asks for a number and an explanation, or for a count in several groups, has one field for each.
  - label: short, in the form's words.
  - quote: the words of the form that ask for this field, copied word for word, at least three words long. For one group in a list, quote from the start of the question through that group.
  - wants: count (a number of people or things), percent, hours, money, text (a written answer), choice (pick from options), or date.
