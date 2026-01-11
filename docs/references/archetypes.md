# Slide Archetypes Reference

Detailed specifications for each archetype. Use these constraints strictly—they exist to prevent the most common failure modes.

## Title

**Use for**: Opening slide, major section starts

**Layout**:
- Headline: centered, large
- Subline: centered, below headline, smaller

**Constraints**:
- Headline: ≤8 words
- Subline: ≤15 words (optional)
- No bullets, no body text

**Common failure**: Trying to cram the whole thesis here. The title slide's job is to orient, not persuade.

---

## Section Divider

**Use for**: Breaking the deck into parts, signaling a shift

**Layout**:
- Single phrase, centered, large

**Constraints**:
- ≤5 words
- No subline, no explanation

**Common failure**: Making these too wordy. "Part 2: Analysis of Market Conditions and Competitive Landscape" → "Market Reality"

---

## Big Idea

**Use for**: The turn moment, key insight, memorable statement

**Layout**:
- Headline: large, dominant
- Subline: supporting context, smaller

**Constraints**:
- Headline: ≤12 words
- Subline: ≤20 words
- This is where the "hallway sentence" often lives

**Common failure**: Burying the insight in a paragraph. If it's a big idea, it gets a big slide.

---

## Bullets

**Use for**: Supporting points, lists that need to be scanned

**Layout**:
- Headline: top
- 3 bullets below

**Constraints**:
- Headline: ≤8 words
- Bullets: exactly 3 (not 4, not 5)
- Each bullet: ≤10 words
- Total slide text: ≤50 words

**Common failure**: The "wall of bullets" slide. If you need more than 3, you need more than 1 slide.

---

## Two-Column

**Use for**: Comparison, text alongside image, before/after

**Layout**:
- Headline: top, spanning both columns
- Left column: text or image
- Right column: text or image

**Constraints**:
- Headline: ≤8 words
- Each column: ≤40 words or 1 image
- Columns should be meaningfully parallel

**Common failure**: Asymmetric columns where one is dense and one is sparse. Balance them.

---

## Quote

**Use for**: Testimonial, expert evidence, memorable statement from source

**Layout**:
- Quote: centered, large, in quotation marks
- Attribution: below, smaller

**Constraints**:
- Quote: ≤30 words
- Attribution: name + role/source

**Common failure**: Long quotes that lose impact. Edit ruthlessly. The best quotes are ≤15 words.

---

## Chart

**Use for**: Data evidence, trends, comparisons

**Layout**:
- Headline: top (this is the *takeaway*, not a description)
- Chart: center
- Takeaway sentence: bottom (optional, reinforces headline)

**Constraints**:
- Headline: ≤10 words, states the insight ("Costs doubled" not "Cost chart")
- One chart per slide
- Takeaway: ≤15 words

**Common failure**: Headline that describes instead of concludes. "Q3 Revenue by Region" → "APAC now drives 40% of revenue"

---

## Timeline / Roadmap

**Use for**: Process steps, project phases, historical sequence

**Layout**:
- Headline: top
- 3-5 stages in horizontal or vertical flow

**Constraints**:
- Headline: ≤8 words
- Stages: 3-5 (not more)
- Each stage label: ≤5 words
- Optional: one sentence per stage (≤10 words)

**Common failure**: Cramming 12 steps onto one slide. If the process has more than 5 meaningful stages, either group them or use multiple slides.

---

## Comparison Table

**Use for**: Feature comparison, options analysis, scoring

**Layout**:
- Headline: top
- Table: 2-4 columns, 3-5 rows

**Constraints**:
- Headline: ≤8 words
- Columns: 2-4 max
- Rows: 3-5 max
- Cell content: ≤5 words or checkmark/icon

**Common failure**: The spreadsheet slide. If it looks like Excel, it's too dense.

---

## Summary / Next Steps

**Use for**: Closing slide, action items, key takeaways

**Layout**:
- Headline: top ("Next Steps" or "Key Takeaways" or the hallway sentence)
- 3 bullets or action items

**Constraints**:
- Headline: ≤8 words
- Items: exactly 3
- Each item: ≤12 words
- If there's an ask, make it concrete (who does what by when)

**Common failure**: Vague next steps. "Continue discussion" → "Schedule pilot kickoff by March 15"

---

## Position Cards (Keycard-style)

**Use for**: Strategic positioning, product pillars, multi-pillar frameworks

**Layout**:
- Eyebrow label (cyan, small caps)
- Headline + subline (large, white)
- 3 cards in a row, each with: label, title, body, badge
- Optional feature row with icons

**Constraints**:
- Eyebrow: ≤4 words
- Headline: ≤15 words
- Subline: ≤10 words
- Cards: exactly 3
- Each card badge_color: green | cyan | orange

**Common failure**: Trying to fit too much into card bodies. Keep descriptions to 2 lines max.

**Example**:
```json
{
  "archetype": "position-cards",
  "content": {
    "eyebrow": "OUR POSITION",
    "headline": "Identity is the pillar. ACP is north.",
    "subline": "The wedge shows us what's next.",
    "cards": [
      {
        "label": "THE FOUNDATION",
        "title": "Identity", 
        "body": "Who, on whose behalf, delegation chains.",
        "badge": "✓ Built",
        "badge_color": "green"
      }
    ],
    "features": [
      { "label": "Hooks", "description": "block/allow at runtime" }
    ]
  }
}
```

---

## Choosing the Right Archetype

If you're unsure which archetype fits:

1. What's the *job* of this slide in the argument?
2. Is the content primarily text, data, or visual?
3. How many discrete pieces of information are there?

| Job | Content type | Archetype |
|-----|--------------|-----------|
| Orient the audience | Text | Title |
| Signal a shift | Text | Section |
| Deliver key insight | Text | Big Idea |
| List supporting points | Text | Bullets |
| Show comparison | Text or mixed | Two-Column or Comparison |
| Provide social proof | Text | Quote |
| Prove with data | Data | Chart |
| Show process | Mixed | Timeline |
| Close and ask | Text | Summary |

If a slide is doing two jobs, split it into two slides.
