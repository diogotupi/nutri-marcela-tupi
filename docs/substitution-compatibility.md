# SUB: contextual substitution review

Active policy: `context-review-v2`, replacing fixed macro/weight cutoffs.

The conversation identifies the patient's requested source, target and preparation.
The server resolves the nutritional references and computes a candidate portion
that fits calories (within 10%) while minimizing normalized protein, carbohydrate
and fat differences. This candidate is never an approval.

GPT-6.1 Sol performs a separate final review with `medium` reasoning. It receives
the actual calculated portions/nutrients, differences, current conversation and
other foods in the SAME meal option. It evaluates role, macros, likely satiety,
preparation and practical portion. All five checks must be acceptable to approve.
The model can adjust grams within the calorie interval; the server recomputes all
values. Missing simple details lead to a clarification; consequential differences
or clinical uncertainty lead to nutritionist support with a draft only.

No universal gram ratio or macro-difference threshold decides nutritional
suitability. A substantially different weight can be reasonable for added fats;
a tiny protein bar replacing a whole fruit changes the meal's role and satiety
and is referred. Weight is not measured volume; no individual harm is asserted.
The assistant never presents itself as a licensed human professional or invents
clinical goals, fiber values, diagnoses or changes to the rest of the plan.

TACO remains preferred, then TBCA, then internally marked common-food estimates.
Incomplete nutrient profiles may use a complete secondary reference; a published
TACO row is never overwritten or filled with invented zeros. Private product
labels require all macros, calories and grams from the same confirmed column.
Patients see foods, portions and practical explanations, never reference metadata.

`save_reviewed_substitution` trusts only server-written, owned, approved reviews
with this policy and five acceptable expert checks. It verifies unchanged diet
and nutrient references, two-hour expiry, today's date, numeric/energy bounds,
concurrent-write expectation and idempotency. The calorie-only RPC is inaccessible.
Saved choices undergo the current review again; existing history is retained.

Validation: `npm test`, browser QA, `nutritional-swap-regression.sql`, label and
reference regressions with synthetic fixtures and rollback. Live model smoke
cases cover ordinary substitutions, large weight differences, fruit/bar referral,
source changes and attempted instruction overrides.
