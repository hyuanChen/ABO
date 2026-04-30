# Analysis Rubric

Use this rubric when turning a local paper folder into a research judgement.

## 0. Minimum Explanation Standard

A judgement is not complete if it only names a category.

For each important judgement, explanation should make three things legible:

- what the point concretely means
- what evidence in the corpus supports it
- why the point is insightful, non-obvious, or practically important

If a beginner could not explain the point back after reading it, the explanation is still too compressed.

## 1. What The Corpus Map Should Capture

A useful follow-up map does not just list papers by time. It should capture:

- which paper is the source or anchor paper for the folder
- the bottleneck each paper attacks
- the concrete scenario where that bottleneck matters
- the mechanism each paper introduces
- the technical insight that can be reused later
- the tradeoff the paper makes
- whether the paper is foundational, incremental, or orthogonal
- which unresolved bottlenecks keep recurring

If the root directory contains a markdown file with the same name as the folder, treat that file as the source paper and organize the rest of the papers relative to it.

Choose clustering axes from the corpus itself rather than forcing a preset taxonomy.
If examples are helpful, they may come from mechanism, scenario, evaluation style, data source, system role, or failure mode, but these are examples rather than required buckets.

## 2. How To Judge Paper Quality

When asked which papers are "good" or "bad," use signal quality.
Do not stop at the label. The explanation must say what mechanism or evidence earned that label.

### High-signal papers

These usually have at least two of the following:

- a crisp problem statement tied to a real bottleneck
- a mechanism that changes what the model can do, not just how large it is
- evidence that the mechanism matters, not just a better backbone
- strong evaluation on settings that match the claim
- reusable abstractions that later work can build on

### Medium-signal papers

These are still useful, but typically:

- extend an existing pattern
- improve a subsystem without changing the overall capability frontier
- show gains with narrower evidence
- are mainly valuable as implementation references or baselines

### Low-signal papers

These often suffer from one or more of the following:

- novelty is mostly recombination or prompt dressing
- the claimed bottleneck is vague or overstated
- the evidence does not match the ambition of the claim
- ablations are too weak to explain why it works
- the paper depends on scale or data advantages without isolating the real contribution

These labels are a useful default, not a mandatory taxonomy.
If the corpus supports a sharper grouping scheme, use that instead and explain it clearly.

Say this explicitly when relevant:

- "useful engineering paper, but weak research leverage"
- "interesting framing, but the mechanism is not yet convincing"
- "benchmark gain is real, but insight density is low"

## 3. How To Judge Research Ideas

Score ideas against these questions:

### A. Is it attacking a real bottleneck?

- Does the corpus repeatedly expose this weakness?
- Is the problem still open after the stronger papers?

### B. Is there a mechanism, not just a slogan?

- What changes in the model, objective, representation, or training loop?
- Why should that change address the bottleneck?

### C. Is it feasible for the likely operator?

- data access
- compute burden
- robotics hardware burden
- reproduction difficulty
- evaluation clarity

### D. Does it create publishable signal?

- Can it produce a clean ablation story?
- Can it show a capability or understanding gain?
- Is the win likely to survive comparison against strong baselines?

### E. Does it have long-term headroom?

- Could it become a thesis direction or platform?
- Or is it a one-off patch?

### F. Is it concrete enough to build?

- Does the idea specify what is being changed?
- Does it say what model, module, loss, signal, or data would be used?
- Does it define a minimal experiment?
- Does it describe the expected effect rather than just the theme?

For every score or judgement, explain the reasoning in enough detail that a newcomer could understand why the idea passed or failed.

## 4. Idea Labels

After generating twenty ideas, give them an explicit second-pass judgement.
You may use labels such as `Credible`, `Borderline`, and `Weak`, but the exact labels can be adapted if the corpus suggests a better scheme.
Do not leave weaker ideas ambiguous.

## 5. What Beginners Usually Need

A newcomer usually needs help on several layers.
In practice, this often includes field basics, the source paper's role, the challenge map, the concept map, and an executable first step, but adapt the emphasis to the actual corpus and user need.

So your final answer should not stop at judgement. It should also say:

- what to read first
- what to reproduce first
- what not to spend two weeks on
- what kind of first result would count as progress

Those recommendations should be explained, not merely listed.

## 6. Graph Quality

A useful Obsidian graph is not a star centered only on the source paper.

Prefer graphs where important relations become visible.
In practice this often means source-to-follow-up links, follow-up-to-follow-up links, disagreements, alternative mechanisms, shared bottlenecks, and cross-branch relations, but the graph should reflect the corpus rather than a fixed checklist.

## 7. Healthy Skepticism

Keep the following failure modes in mind:

- abstract-only optimism
- benchmark overfitting
- paper titles sounding more important than the mechanism
- frontier-model dependence hiding the real contribution
- new datasets or infrastructure doing most of the work
- high-level ideas that sound plausible but do not specify a buildable mechanism

If the corpus is not enough to support a strong conclusion, say so and reduce confidence.
When reducing confidence, explain why the evidence is limited.
