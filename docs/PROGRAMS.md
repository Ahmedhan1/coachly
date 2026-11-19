# Ready program templates — what they are and why

Code: `src/domain/programs/templates.ts` (first three) and `src/domain/programs/templateLibrary.ts` (the
library). Names: `training.programs.templates` / `dayNames` in `src/i18n/ar/training.ts` and
`src/i18n/en/training.ts`. Every exercise id is checked against the bundled pack by
`src/domain/programs/programs.test.ts`. A template is a starting point: the trainer edits it per client.

## Evidence used

| Rule in the templates | Source |
| --- | --- |
| Train every major muscle at least twice a week; frequency matters more than a clever program. Training to failure, equipment type and complex periodisation do not change results much for the average adult. | ACSM 2026 position stand, *Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults* (overview of 137 systematic reviews) — [ACSM summary](https://acsm.org/resistance-training-guidelines-update-2026/) |
| Strength: heavy loads (~80% 1RM), 2-3+ sets per exercise. Muscle gain: ~10 sets per muscle per week. Power: 30-70% 1RM moved fast. Bands and bodyweight work. | Same |
| Muscle gain rises with weekly volume up to roughly 10+ hard sets per muscle; 12-20 is a reasonable range for trained people, more is not clearly better. | Schoenfeld, Ogborn & Krieger 2017, *J Sports Sci* (dose-response meta-analysis) — [PDF](https://researchgate.net/profile/Brad-Schoenfeld/publication/305455324_Dose-response_relationship_between_weekly_resistance_training_volume_and_increases_in_muscle_mass_A_systematic_review_and_meta-analysis/links/59dc0269458515e9ab4527d6/Dose-response-relationship-between-weekly-resistance-training-volume-and-increases-in-muscle-mass-A-systematic-review-and-meta-analysis.pdf); moderate vs high volume — [PMC8884877](https://pmc.ncbi.nlm.nih.gov/articles/PMC8884877) |
| Rest more than 60 s between sets for muscle gain (small benefit); beyond ~90 s no clear extra gain. Strength sets get 2.5-4 min. | Singer et al. 2024, *Front Sports Act Living* (Bayesian meta-analysis) — [PubMed 39205815](https://pubmed.ncbi.nlm.nih.gov/39205815/) |
| Older adults: 2-3 days a week, 1-3 sets of 8-12 at moderate effort, machines are a good start for beginners and frail clients, add balance/function and power work. | NSCA position statement, Fragala et al. 2019, *J Strength Cond Res* — [PubMed 31343601](https://pubmed.ncbi.nlm.nih.gov/31343601/) |

## The templates

| id | Arabic name | Days | Who it is for | Prescription |
| --- | --- | --- | --- | --- |
| `ppl` | بوش / بول / ليجز | 3 (or 6 run twice) | Intermediate, muscle gain | 3-4 × 6-15, compounds first, one superset per day |
| `upper_lower` | أبر / لور | 2 (run twice = 4/week) | Intermediate, muscle + strength | 3-4 × 6-15 |
| `full_body` | فول بادي | 1 (2-3×/week) | Busy clients, any level | 2-3 × 10-15 |
| `beginner_ab` | مبتدئين A / B | 2, alternated 3×/week | New to the gym | Machines first, 2-3 × 10-12 at RPE 7, 60-120 s rest |
| `strength_ab` | سترينث A / B | 2, alternated 3×/week | Strength goal, can squat/bench/deadlift safely | 3-5 × 5 at RPE 8, 2.5-4 min rest |
| `bro_split` | سبليت 5 أيام | 5 | Advanced lifters who want a body-part split | Each muscle once a week with 12-16 sets that day. Below the twice-a-week rule — trainer's choice |
| `glutes_focus` | جلوتس فوكس | 4 | Clients (often women) with a lower-body / glute goal | Glutes twice a week (hip thrust, RDL, kickback, abductor / squat, split squat, pull-through), upper body twice |
| `home_dumbbells` | دامبل في البيت | 2 | Trains at home with a pair of dumbbells | 2-3 × 8-15, no machine, cable or barbell |
| `bodyweight` | بودي ويت | 2 | No equipment (a chair/bench and a suspension strap) | Progress by reps, tempo and harder variations |
| `fat_loss_circuit` | سيركيت تنشيف | 2 | Fat-loss phase | Paired moves (A/B/C supersets), 10-15 reps, 30 s between the pair, 60 s after. Weights keep muscle in a deficit; the diet does the fat loss |
| `older_adults` | ماشين لكبار السن | 2 | Older or deconditioned clients | Machines, 2 × 10-12 at RPE 6, step-up and loaded carry for balance; build to 3 sets |
| `kettlebell` | كيتل بيل | 1 (2-3×/week) | One kettlebell, home or outdoors | Swing, goblet squat, row, press, reverse lunge, Turkish get-up |

Sanity rules enforced by tests: 4-6 exercises per day, 2-5 sets, 30-240 s rest, unique day keys and labels,
home templates without machines/cables/barbells, glutes on two days of `glutes_focus`, every
`fat_loss_circuit` move in a superset, strength main lifts at ≤ 6 reps with ≥ 150 s rest, older-adult work
at 2 sets and RPE ≤ 7.

## Adding a template

1. Add it to `LIBRARY_TEMPLATES` (ids from `public/exercise-pack/exercises.json`; prefer ones with photos).
2. Add its id to `LibraryTemplateId`, a name under `templates` and each day key under `dayNames` in both
   languages (Arabic transliterated — run `npm run check:words`). Day labels must stay unique, and must not
   contain «فول بادي» (the e2e tests pick the Full Body card by that name).
3. Update the id list in `programs.test.ts` and run `npm run check`.
