# SUB: compatible substitutions

The active policy is `macros-portion-v1`. It supersedes calorie-only substitutions.
The conversation evaluates the food's role and preparation. The server then checks
energy, protein, available carbohydrate and total fat. A model's `compatible=true`
does not override this numerical gate. Patients see food/portion guidance and a
support button, never provider or reference metadata.

The deterministic calculation minimizes squared differences normalized by each
nutrient's tolerance, constrained to the intersection of all limits:

- Calories: within 10% of the prescribed portion.
- Protein/carbohydrate/fat: within 20%, with absolute rounding allowances of
  2 g / 3 g / 1.5 g respectively.
- Replacement weight: 50–300% of the original, with an absolute 0.1–5000 g bound.

These are conservative **product heuristics**, not a clinically validated universal
definition of equivalence. Weight is a proxy for portion size, not measured food
volume or a prediction of individual satiety. Messages use “pode alterar a
saciedade”; they do not promise harm or identical nutritional effects. Uncertain
or incompatible cases go to the nutritionist's support chat, with a draft only.

Original TACO protein/fat/total carbohydrate/fiber values are extracted from the
published PDF and independently checked against the official workbook. Available
carbohydrate is total minus fiber. `Tr` is approximately zero; unknown or
inapplicable values remain null. See `data/taco-provenance.json` and
`scripts/import-taco-macros.py`. TBCA uses the available-carbohydrate row, not the
total-carbohydrate or household-measure column. Model estimates remain marked
as estimates internally. Missing data never becomes zero or automatic approval.

Labels require calories, grams, protein, carbohydrate and total fat from the same
column. All readings must be confirmed, including corrected macros. Images are
not persisted; private label references stay scoped to their patient.

The service stores its reviewed proposal in `substitution_ai_turns.response`.
`save_reviewed_substitution` accepts only the review ID, operation ID, today's date
and expected previous swap ID. It checks ownership, approval, policy, a two-hour
expiry, unchanged prescription and nutrient data, and the numerical bounds again.
Patients cannot write reviews, supply arbitrary target grams or call the old
calorie-only save RPC. Clinical history and reusable bookmarks are retained.
Saved choices run through the current review again; complete saved labels can be
reused without a new photograph.

Validation: `npm test`, `tests/substitution-chat-browser-qa.cjs`,
`supabase/nutritional-swap-regression.sql`, `supabase/food-label-regression.sql`.
SQL/browser fixtures are synthetic; SQL fixtures roll back.
