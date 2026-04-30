---
name: paper-followup-mentor
description: Use when the user wants an advisor-style survey from a folder of paper markdown notes, with source-paper anchoring, per-paper challenge analysis, Obsidian-compatible cross-paper link maps, paper quality triage, technically specific idea generation, and an optional evaluation of the user's own idea.
---

# Paper Follow-up Mentor

This skill turns a folder of paper notes into an advisor-style literature survey. It first runs a bundled script to collect each paper's ABO digest, abstract, and introduction, then organizes the corpus around the source paper, extracts per-paper challenges and technical insights, builds an Obsidian-friendly follow-up map, writes real backlinks back into the paper notes, and proposes concrete research directions.

## When To Use

Use this skill when the user has a folder of paper markdown files and wants any of the following:

- a structured survey of a research direction
- a source-paper-centered follow-up map
- a paper-by-paper analysis of challenges, scenarios, and technical moves
- a judgement of which papers are high-signal or low-signal
- technically specific research ideas rather than generic "future work"
- advisor-style guidance for a beginner entering the area
- an evaluation of a custom idea, such as "Jingwen's idea"

This skill assumes the folder often looks like:

- one root-level markdown file whose filename matches the folder name; treat this as the source paper or anchor paper
- one folder per follow-up paper
- one main markdown note per paper folder
- optional `paper.pdf`
- optional `<!-- ABO_DIGEST_START --> ... <!-- ABO_DIGEST_END -->`
- optional `Abstract` and `Introduction` sections

If the user asks about the newest papers beyond the local folder, do not assume the folder is complete. Verify newer papers before making "latest" claims.

## Workflow

### 1. Collect the corpus first

Before doing any synthesis, run `scripts/collect_paper_context.py` from this skill. Resolve the script path relative to the skill directory before executing it from the user's current working directory.

Preferred command:

```bash
python3 scripts/collect_paper_context.py --root "$PWD" --output "$PWD/.paper_followup_context.md"
```

If the folder is very large, cap the section length instead of manually sampling papers:

```bash
python3 scripts/collect_paper_context.py \
  --root "$PWD" \
  --output "$PWD/.paper_followup_context.md" \
  --max-abstract-chars 1800 \
  --max-intro-chars 3200
```

Rules:

- read the generated corpus file before opening many paper files one by one
- if a root-level markdown file matches the folder name, treat it as the source paper and read it first
- only fall back to individual paper markdowns when extraction failed or a specific paper needs deeper inspection
- prefer using the local corpus over vague prior knowledge

### 2. Materialize real Obsidian backlinks

After you draft the follow-up map, do not stop at a pretty overview note. You must also produce a machine-readable relation manifest and run the backlink updater so the paper notes themselves contain real `[[Wiki Links]]`.

Preferred workflow:

1. Write the human-readable survey note or `Idea整理.md`.
2. Save a clean relation manifest to `$PWD/.paper_followup_links.md`.
3. Run the bundled backlink script.

Preferred command:

```bash
python3 scripts/update_obsidian_links.py \
  --root "$PWD" \
  --relations "$PWD/.paper_followup_links.md"
```

The relation manifest should contain only canonical relation lines, one per line, for example:

```md
[[World Action Models are Zero-shot Policies]] -> [[Action Images End-to-End Policy Learning via Multiview Video Generation]] : opens the action-interface branch
[[Action Images End-to-End Policy Learning via Multiview Video Generation]] <-> [[AIM Intent-Aware Unified world action Modeling with Spatial Value Maps]] : same bottleneck, different interface choice
[[World-Value-Action Model Implicit Planning for Vision-Language-Action Systems]] <-> [[Goal2Skill Long-Horizon Manipulation with Adaptive Planning and Reflection]] : long-horizon planning branch
```

Rules:

- prefer storing the relation manifest in `.paper_followup_links.md` so the file is easy to regenerate and does not clutter the visible note list
- the script can fall back to parsing relation lines inside `Idea整理.md`, but the dedicated hidden manifest is the preferred path
- relation lines must use exact local note titles whenever possible so they resolve to the existing markdown filenames
- add enough cross-paper edges that important follow-up papers connect to multiple relevant neighbors, not only to the source paper
- do not hand-edit the managed backlink block inside each note; rerun the script when relations change
- the script writes reciprocal note-level links, which is what makes Obsidian backlinks actually work

### 3. Ground the analysis in paper challenges

Your job is not to "summarize some papers." Your job is to act like a careful advisor who can explain:

- what problem family this line of work is actually trying to solve
- what the source paper established as the initial framing or mechanism
- what concrete challenge each paper is trying to solve
- in what scenario that challenge actually matters
- what technical move each paper makes
- what technical insight each paper contributes that is worth carrying forward
- how later papers extend, refine, critique, or diverge from the source paper
- which papers move the field forward versus which mainly repackage existing patterns
- which open problems are real bottlenecks
- what a newcomer can realistically attack next

Every important judgement should be tied to specific paper titles from the local corpus.

### 4. Read the rubric and template before writing

Use these reference files:

- `references/analysis-rubric.md`
- `references/output-template.md`

The rubric defines how to judge papers and ideas. The template defines the default response structure.

## Non-Negotiable Behavior

- Be concrete. Name paper titles instead of saying "some recent work."
- Match the user's language. If the user writes in Chinese, keep the analysis in Chinese while preserving paper titles in their original language.
- Separate source-grounded synthesis from your own judgement when that distinction matters.
- Do not write in a terse outline style that leaves a beginner guessing what each point really means.
- For every major point, add a parenthetical expansion that explains the concrete meaning, the supporting evidence, and why the point is insightful or decision-relevant.
- If a claim would be hard for a beginner to understand, unpack the mechanism in plain language before moving on.
- When writing the map, include cross-paper links between follow-up papers, not just links from the source paper.
- Avoid star-shaped maps where everything only points back to the source paper.
- When you finish the map, emit a machine-readable relation manifest and run the backlink updater.
- Treat "good paper" and "bad paper" as signal-quality judgements, not moral judgements.
- Avoid empty praise. If a paper is strong, say why. If it is weak, say what is missing.
- Do not overclaim from abstracts alone. If the evidence is thin, say so explicitly.
- Do not stop at high-level idea slogans such as "improve representation" or "use better planning."
- Every serious idea must specify what to change, what to use, how to test it, and what effect is expected.
- Generate twenty ideas before narrowing down. Do not jump straight to one favorite idea.
- After generating ideas, run a second-pass filter and clearly mark which ideas are credible, borderline, or weak.
- Keep the beginner in mind. Explain the field in plain language before getting ambitious.

## Explanation Density

The default unit of writing should be:

- a short judgement or claim
- followed by a parenthetical expansion

The parenthetical expansion should usually cover:

- what this point concretely means
- what evidence or paper evidence supports it
- why this is insightful, non-obvious, or important for future work

Example pattern:

- `Paper X is a strong follow-up because it makes execution more faithful. (Concretely, it narrows the gap between imagined futures and executable robot actions rather than only improving visual prediction; this is supported by its inverse-dynamics alignment or downstream control results; the reason this matters is that many world-model papers look good visually but fail when actions must actually be carried out.)`

Do not over-compress this parenthetical explanation into a few vague adjectives.

## Default Output Contract

Unless the user asks for a narrower deliverable, produce the following:

1. A short field outlook for a beginner: why the area matters and where the frontier is moving
2. A clear identification of the source paper and why it is the anchor for the folder
3. A paper-by-paper challenge table: target scenario, bottleneck, technical move, and technical insight
4. A synthesis of technical progress across the corpus
5. The major unsolved problems that remain open
6. A reusable insight section: design patterns and technical lessons worth carrying forward
7. An Obsidian-compatible follow-up map using `[[Wiki Links]]`, plus a machine-readable relation manifest and a mermaid view when helpful
8. A paper triage section using a grouping scheme that fits the corpus; high-signal, medium-signal, and low-signal are only defaults
9. Twenty candidate research ideas
10. A second-pass screening of those twenty ideas
11. Top recommended directions with rationale, risks, and a plausible path to first results
12. If the user provides a custom idea, a final evaluation of that idea
13. Practical advice: what to read first, what to reproduce first, and what to ignore for now

## Judgement Style

Adopt the voice of a demanding but helpful advisor:

- rigorous
- explicit about uncertainty
- willing to say a direction is weak
- focused on mechanism and evidence
- useful to a newcomer who wants to do real work

Do not write as a hype machine. Do not write as a detached encyclopedia. Write as someone trying to help a student choose a direction responsibly.

## Handling The Research Map

When building the follow-up map:

- if a root-level markdown file matches the folder name, use it as the root or anchor node of the map
- cluster papers by mechanism, not by publication date alone
- show which papers are foundational, which are extensions, and which are orthogonal side branches
- identify bottlenecks that recur across branches
- prefer an Obsidian-ready representation that uses `[[Paper Title]]` wiki links so the user can paste it into notes and preserve graph connectivity
- use `mermaid` as a secondary visualization when it helps, not as the only map format
- explain the map in words after the diagram
- create cross-links among follow-up papers whenever they share a bottleneck, a mechanism, an evaluation setting, or a disagreement

For the Obsidian-friendly version, prefer relation lines such as:

- `[[Source Paper]] -> [[Follow-up Paper]] : source of this branch`
- `[[Paper A]] -> [[Paper B]] : extends`
- `[[Paper C]] -> [[Paper D]] : criticizes`
- `[[Paper E]] -> [[Paper F]] : shares bottleneck`
- `[[Paper G]] <-> [[Paper H]] : same scenario, different technical path`
- `[[Paper I]] <-> [[Paper J]] : complementary modules`

Treat these as example relation styles, not a required vocabulary.

For strong follow-up papers, aim to connect each one to multiple other papers when justified, not just to the source paper.

After drafting the map, materialize those relation lines into `.paper_followup_links.md` and run:

```bash
python3 scripts/update_obsidian_links.py \
  --root "$PWD" \
  --relations "$PWD/.paper_followup_links.md"
```

That step is required if the user wants the map to become real Obsidian backlinks instead of a standalone summary note.

## Handling Per-Paper Challenges And Insights

For each important paper, explicitly state:

- the challenge it targets
- the scenario where that challenge matters
- the technical move the paper makes
- the insight worth carrying forward

For each of these points, add a parenthetical explanation that spells out:

- what the term means in this paper's context
- what in the digest, abstract, introduction, or comparison supports the claim
- why this point is insightful rather than just descriptive

Do not collapse this into generic summaries. This layer should feed the later idea generation.

## Handling Idea Generation

Always do idea generation in two stages.

### Stage A. Diverge

Propose twenty ideas by sampling freely from the insights you extracted from the papers.

Rules for divergence:

- do not force the ideas into a fixed set of categories
- let the ideas come from the actual bottlenecks, scenarios, mechanisms, and tensions in the corpus
- allow the set to include both grounded ideas and more speculative or wild ideas
- avoid quota thinking such as "one benchmark idea, one representation idea"
- the point is coverage of possibility space, not compliance with a taxonomy

### Stage B. Converge

Filter the twenty ideas and explain:

- which are actually worth doing
- which are fake-novelty ideas
- which depend on unavailable data or unrealistic infrastructure
- which can produce a publishable signal quickly
- which can become a deeper long-term direction

Do not keep all twenty ideas equally alive.

For each idea that survives, make it concrete:

- the precise challenge it attacks
- the technical hypothesis
- the modules, objectives, data, or signals it would use
- the minimum experiment to run
- the effect it is supposed to achieve if it works

For each of these fields, prefer a one-line claim plus a parenthetical explanation that makes the idea buildable and understandable for a newcomer.

## Handling A User's Own Idea

If the user gives a custom idea, including something like "Jingwen's idea," append a final section that judges:

- whether the idea is actually grounded in the corpus
- which papers support or contradict it
- what is novel versus already covered
- what the cheapest validation path is
- whether it is credible, borderline, or weak

Do not stop at the label. Explain in parentheses why the idea got that judgement and which evidence in the corpus drove it.

## Practical Notes

- The bundled script prefers `ABO_DIGEST` markers and falls back to markdown sections.
- The bundled script detects a root-level markdown file whose filename matches the folder name and labels it as `source-paper`.
- The bundled `scripts/update_obsidian_links.py` script writes a managed backlink block into each paper note using real `[[Wiki Links]]`.
- The backlink script prefers `.paper_followup_links.md` and can fall back to `Idea整理.md` if it already contains clean relation lines.
- Hidden files are skipped.
- Output files generated by the script are hidden by default so they do not pollute the paper folder.
- If extraction misses important papers, inspect those paper files manually and continue.

## Example Requests

- "Use `$paper-followup-mentor` to map this follow-up folder and explain the source paper, later branches, and cross-paper relations."
- "Use `$paper-followup-mentor` to tell me the challenge each paper is solving, the scenario it cares about, and the technical insight."
- "Use `$paper-followup-mentor` to propose 20 technically concrete ideas sampled from the paper insights, then filter out the weak ones."
- "Use `$paper-followup-mentor` to evaluate Jingwen's idea against the papers in this folder."
