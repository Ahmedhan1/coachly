# Starter data (food table, recipes, supplements)

- `ingredients.ar.json` — per 100 g: kcal, protein, carbs, fat, fibre, plus household measures (رغيف، بيضة، معلقة، كوباية، طبق).
  Source family: USDA FoodData Central (SR Legacy / Foundation) for raw and basic foods, and the FAO/INFOODS
  Egyptian / Middle-East food composition tables for local foods. Prepared Egyptian dishes and fast-food items are
  typical-home-recipe estimates. All values are rounded approximations entered by us (nothing copied wholesale);
  the trainer can edit any row. `icon` is a Twemoji file name in `public/food/`.
- `recipes.ar.json` — original recipes written for this app. Macros are never typed: they are computed from the
  ingredients. `since` marks the data version that introduced a recipe, so updates add only new ones.
- `supplements.ar.json` — names only. The app never suggests doses.
- Bump `version` in a file when its content grows; `NutritionStore` then merges the new rows into existing installs
  without touching the trainer's edits or deletions.
