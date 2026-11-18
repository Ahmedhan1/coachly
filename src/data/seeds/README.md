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
- Foods carry an optional `nameEn`, `unitG` (+ `unitHalf`) for counted foods (eggs, loaves, slices) and English
  portion labels (`labelEn`). Names say raw or cooked (ني / مطبوخ). `renamed` (id → former Arabic name) lets an
  install rename an untouched row; a name the trainer changed is kept.
- Recipes carry `nameEn` and `instructionsEn`, and every recipe has at least one meal-slot tag (فطار، غدا، عشا، سناك).
  Untouched starter recipes on existing installs get new tags / English on the next data version (see
  `NutritionStore.refreshStarterRecipes`).
- Recipes also carry `prepMin` (minutes), `cuisine` (egyptian / levantine / gulf / mediterranean / asian /
  international) and, like foods, an optional `photo`: the file stem of a bundled Wikimedia Commons photo in
  `public/food-img/photos/` (sources and licenses in `docs/FOOD_PHOTOS.md`). Photos are cached at run time; the
  icon shows when a photo is missing or fails to load. Data versions: foods v5, recipes v4 (`since: 4`).
