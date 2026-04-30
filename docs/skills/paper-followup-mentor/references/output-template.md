# Output Template

Use this structure unless the user asks for a narrower deliverable.

## Global Writing Rule

For every major bullet or claim in every section, use this pattern:

- short judgement or summary
- then a parenthetical expansion

The parenthetical expansion should normally explain:

- what the point concretely means
- what evidence from the papers supports it
- why it is insightful, non-obvious, or useful

If a section is too terse to teach a beginner something, it is underwritten.

## 1. Field Outlook

Start with a short explanation in plain language:

- what this field is trying to do
- why it matters
- what the frontier appears to be pushing toward
- why this folder is a meaningful slice of the area

Keep this section beginner-friendly.
Each key sentence should be followed by a parenthetical unpacking that explains the actual meaning and evidence.

## 2. Source Paper Anchor

Explicitly identify the source paper. If the root directory contains a markdown file whose filename matches the folder name, treat that file as the source paper.

Explain:

- what problem the source paper framed
- what mechanism it introduced
- why later papers followed it

Do not state these as bare labels only. After each point, add a parenthetical explanation with evidence and why it matters.

## 3. Per-Paper Challenge Table

Before drawing the map, add a compact table or bullet list for the important papers.

For each paper, include:

- paper title
- challenge
- target scenario
- technical move
- technical insight

This is mandatory. Later ideas should be grounded in this section.
Each row or bullet should include an explanatory parenthetical note, not just a compressed noun phrase.

## 4. Technical Progress

Summarize what the field has actually improved.

This section defines the structure, not the technical categories.
Infer the real dimensions of progress from the current corpus itself.

When writing this section:

- identify the areas where the papers genuinely moved the field
- distinguish substantive progress from relabeling, packaging, or system stacking
- make the "progress" concrete in terms of mechanism, capability boundary, evaluation scope, or engineering feasibility
- do not force the analysis into a preset list of topics

For each claimed area of progress, add a parenthetical explanation describing what exactly improved, what paper evidence supports it, and why it is a meaningful advance rather than superficial change.

## 5. Unsolved Problems

List the major problems that remain open after reading the corpus.

This section also defines structure rather than a fixed problem list.
Extract the unresolved problems from what the papers repeatedly fail to solve, leave underspecified, or quietly reveal as limitations.

When writing this section:

- keep only the unresolved problems that actually matter for this corpus
- prefer problems that recur across multiple papers or truly block progress
- explain why each problem is hard and why it matters
- do not fill the section with generic bottlenecks just because they are common in the field

For each unresolved problem, add a parenthetical explanation describing how it shows up in the corpus, what evidence suggests it remains unresolved, and why it blocks progress.

## 6. Reusable Insights

Extract the best technical insights from the papers.

Each insight should usually cover what the pattern is, which papers support it, and why it matters for future work, but the exact framing can be adapted to fit the corpus.
Make the "why it matters" legible to a beginner rather than leaving it as an expert shorthand.

## 7. Follow-up Map

Start with an Obsidian-compatible link map that uses `[[Wiki Links]]`, rooted in the source paper when available.

Example relation styles:

- `[[Source Paper]] -> [[Follow-up A]] : starts this branch`
- `[[Paper A]] -> [[Paper B]] : builds on`
- `[[Paper C]] -> [[Paper D]] : extension of`
- `[[Paper E]] -> [[Paper F]] : same bottleneck, different mechanism`
- `[[Paper G]] <-> [[Paper H]] : same scenario, different technical path`
- `[[Paper I]] <-> [[Paper J]] : complementary technical pieces`

This Obsidian-ready block should be the primary map format because the user can paste it directly into notes and keep the graph connected.
Do not output a star topology where every paper only links to the source paper. Add meaningful paper-to-paper links across branches when justified.

After the human-readable map, add a machine-readable relation manifest intended for `$PWD/.paper_followup_links.md`.
That manifest should contain only canonical relation lines, one per line, with no commentary between them.
This is the input to `scripts/update_obsidian_links.py`, which writes real backlinks into the paper notes themselves.

Recommended command after writing the manifest:

```bash
python3 scripts/update_obsidian_links.py \
  --root "$PWD" \
  --relations "$PWD/.paper_followup_links.md"
```

If the user already has relation lines embedded in `Idea整理.md`, the script can parse those too, but the dedicated hidden manifest is cleaner and easier to rerun.

Then provide one `mermaid` diagram when it adds clarity.

After the map, explain the main branches and the most important relations revealed by the map.
The exact explanatory axes should come from the corpus rather than a fixed checklist.
Do not just restate the links. Explain what those links mean and why they matter, ideally with parenthetical evidence.

## 8. Paper Triage

Keep the source paper separate from the follow-up ranking unless the user explicitly asks to rank everything together.

Choose a grouping scheme for the follow-up papers that matches the signal structure of the corpus.
`High-signal`, `Medium-signal`, and `Low-signal` are a good default, but they are not mandatory if a different grouping is more faithful.

For each paper, give:

- 1 sentence on what it contributes
- 1 sentence on why it deserves that label
- if useful, 1 sentence on what a student should extract from it

Do not classify papers by vibes. Use evidence.
After each sentence-level judgement, add a parenthetical explanation with supporting evidence and why the judgement is insightful.

## 9. Twenty Candidate Ideas

Generate twenty ideas before filtering them.

For each idea, include:

- title
- what bottleneck it attacks
- what concrete scenario it targets
- core technical hypothesis
- what to change or build
- what model, module, objective, data, or signal it would use
- why it is interesting now
- minimal experiment that could validate it
- what effect it hopes to achieve

The twenty ideas should not all look the same.
Do not force them into fixed buckets or quotas.
Sample them from the actual insights, bottlenecks, and technical tensions in the paper set.
Allow some ideas to be conservative and some to be wild, as long as they are still traceable to the corpus.
Reject vague idea statements such as "improve planning" unless they specify the mechanism.
For each idea field, add parenthetical detail so the idea is understandable to a beginner and grounded in the corpus.

## 10. Second-pass Screening

Now revisit the twenty ideas and give them an explicit second-pass judgement.
`Credible`, `Borderline`, and `Weak` are acceptable default labels, but adapt the labels if a different scheme is sharper for this corpus.

For each idea, say:

- why it survived or failed
- what hidden dependency or weakness matters
- whether it is publishable, educational, or mostly noise

This section is where you stop being generous.
Each judgement should be followed by a parenthetical explanation that cites the relevant evidence or reasoning.

## 11. Top Recommendations

Pick a small number of best directions, often one to three.

For each recommended direction, provide:

- why it is promising
- what prior papers it should build on
- what first experiment to run
- what would constitute success
- what the biggest failure mode is
- what fallback path still produces useful learning

Do not leave these as headings with short fragments. Each point should be unpacked in parentheses with mechanism, evidence, and practical meaning.

## 12. User Idea Check

If the user provides a custom idea, including something like "Jingwen's idea," add a final assessment:

- what challenge it addresses
- which papers support it
- which papers make it doubtful
- what exact implementation path would test it
- whether it is credible, borderline, or weak

For each of these, add a parenthetical explanation that makes clear why the corpus supports the judgement.

If no custom idea was provided, say that this section is pending user input.

## 13. Mentor Advice

Close with actionable advice for a beginner:

- what to read first
- what to skim
- what to reproduce first
- what skills or background they are missing
- what not to over-invest in yet

Every piece of advice should include a parenthetical explanation of why that advice is being given.

## Writing Rules

- Name exact paper titles when making important claims.
- Explicitly identify the source paper before discussing follow-up branches.
- Distinguish between "the paper claims" and "my judgement."
- Avoid generic "future work includes..." filler.
- Prefer clear, slightly demanding advisor tone over hype.
- If evidence is weak because you only saw digest, abstract, and introduction, say that clearly.
- Make ideas concrete enough that a student could translate them into a first experiment.
- Prefer "claim + parenthetical unpacking" over compressed headline-only bullets.
