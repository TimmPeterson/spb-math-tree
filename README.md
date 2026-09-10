# St. Petersburg mathematics — MCS and PDMI

A responsive, framework-free academic genealogy explorer. Open `index.html` directly in a browser, or serve this directory with `python3 -m http.server 8000`.

- Interactive tree with pan, zoom, fit, expanded view, and connected-lineage exploration.
- Search English or Russian names and research interests; filter by field, institution, or career stage.
- Connected families are ordered by size in every field view, largest first, with isolated people at the end. Wrapping preserves this order.
- Current faculty, researchers, and doctoral students have full-size cards. Advisors needed to connect the filtered people remain visible as small, muted context cards. “Show all history & alumni” includes the remaining historical and alumni records.
- Doctoral cohorts and graduate-fellowship lists broaden coverage, with programme fields used when narrower research topics are unavailable.
- Click any researcher for interests, degree and affiliation context, supervision relationships, and references.
- An accessible people directory provides an alternative to the spatial tree.
- Six research-field colors. Solid edges are doctoral supervision; dashed edges are other research supervision, including bachelor’s, master’s and postdoctoral work. The relationship label identifies the documented level and date.

MCS is the official English abbreviation used throughout for the Faculty of Mathematics and Computer Science.

The collection is curated, not exhaustive. Dated sources are retained, and historical affiliations are explicitly described in profiles. A dated postgraduate record is not a claim of confirmed present enrollment. No supervision relationship is inferred solely from coauthorship, shared institutions, or a common research area.

## Files

- `index.html`: page structure; opens without a build or server.
- `styles.css`: responsive visual design.
- `app.js`: explorer, directory, profile, and source interactions.
- `data.js`: generated, source-linked people and relationships.
- `research/`: auxiliary JSON research records used to assemble the collection.
- `scripts/build-data.py`: reads the records in `research/` and generates `data.js` in the project root; run `python3 scripts/build-data.py` after editing them. Later `research/research-expanded-*.json` and `research/research-connections-*.json` entries update existing records by ID and merge their references. The builder checks missing endpoints, references and cycles. Only documented supervision links are drawn; people without any documented connection remain searchable individual nodes.

The directory and result count include the people matching the filters. In the tree, their supervisors are retained for context even when outside the selected field, institution or career stage. A text search shows only matching people; “Explore this lineage” opens their whole connected family. Earlier degree supervision is never treated as evidence of the current doctoral advisor.

The page has no JavaScript dependencies. Google Fonts is optional; local sans-serif fonts are used when offline. No analytics or remote data loading is included.

## Keyboard

Press `/` to focus search. Tab to a person and press Enter to open their profile; Escape closes it. With the graph canvas focused, use arrow keys to pan, `+` / `-` to zoom, and `0` to fit the graph. All explorer actions also have labeled buttons.
