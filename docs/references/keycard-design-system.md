# Keycard Presentation Design System

A coherent visual language for enterprise sales and strategy decks.

---

## Design Philosophy

**Core belief:** A presentation is a designed experience, not a document with slides.

**The job:** Make complex ideas feel inevitable. The audience should think "of course" — not "wow, fancy."

**The enemy:** Visual noise that competes with the message. Every element earns its place or it's cut.

**The tone:** Confident, technical, trustworthy. Not flashy, not corporate-safe. The visual equivalent of "we've done this before."

---

## Typography

### Font Stack
- **Primary:** Inter (available everywhere, excellent legibility)
- **Fallback:** SF Pro Display → Helvetica Neue → Arial

### Type Scale (1920×1080 canvas)

| Role | Size | Weight | Use |
|------|------|--------|-----|
| Hero | 72-96px | Bold | Single statement slides, the turn |
| Headline | 48-56px | Bold | Slide titles, section openers |
| Subhead | 28-32px | Medium | Supporting context, section labels |
| Body | 24-28px | Regular | Bullet content, descriptions |
| Label | 18-20px | Medium | Badges, metadata, eyebrows |
| Caption | 16px | Regular | Footnotes only (use sparingly) |

**Hard rule:** Nothing below 18px. Ever. If it's too small to read from 10 feet, it doesn't belong on a slide.

### Hierarchy Principle
Create contrast through **scale**, not decoration. A 72px headline next to 24px body text needs no underline, no box, no color change — the size difference does the work.

---

## Color

### Base Palette

```
Background:    #0f172a (slate-900)  — primary dark
Surface:       #1e293b (slate-800)  — cards, containers
Border:        #334155 (slate-700)  — subtle dividers

Text Primary:  #f8fafc (slate-50)   — headlines, key content
Text Secondary:#94a3b8 (slate-400)  — supporting text, labels
Text Muted:    #64748b (slate-500)  — metadata, captions
```

### Accent Colors (use ONE per slide)

```
Green:   #10b981 (emerald-500)  — success, validation, "we built this"
Blue:    #3b82f6 (blue-500)     — trust, information, setup phase
Purple:  #a855f7 (purple-500)   — discovery, questions, invitation
Amber:   #f59e0b (amber-500)    — warning, attention, blockers
```

### Gradient Usage

Gradients add depth. Use for:
- Backgrounds (subtle, radial from center)
- Hero moments (the turn slide)
- NOT for text, NOT for cards

```
Standard dark:   #0f172a → #000000 (linear, 180°)
Dramatic:        #1e1b4b → #0f0a1e → #000000 (radial)
```

---

## Layout

### Canvas
- **Size:** 1920 × 1080 (16:9)
- **Safe zone:** 80px margins on all sides
- **Content area:** 1760 × 920

### Grid System
- **Columns:** 12-column grid, 120px each, 40px gutters
- **Baseline:** 8px vertical rhythm
- **Spacing scale:** 8, 16, 24, 32, 48, 64, 96, 128px

### Layout Patterns

**Full-bleed hero:**
- Single massive statement
- 72-96px type
- Centered or left-aligned
- 60-70% of slide is the headline
- Supporting detail in corner or bottom

**Split (60/40 or 50/50):**
- Left: primary content
- Right: supporting visual or secondary content
- Vertical divider at column 7 or 8

**Card grid:**
- 2-3 cards maximum
- Equal widths
- 40px gaps
- Cards don't touch edges

**Stacked:**
- Headline at top
- Content flows down
- Insight/footer at bottom
- Clear vertical rhythm

### White Space
White space is not empty — it's a design element. A slide with 40% content and 60% space feels confident. A slide at 80% density feels desperate.

---

## Components

### Cards
```
Background:    #1e293b
Corner radius: 16px
Padding:       32px
```
Cards group related content. Don't use cards as decoration — if content doesn't need grouping, let it float.

### Badges/Pills
```
Background:    Accent color at 20% opacity, or solid accent
Text:          Accent color, or white on solid
Corner radius: 6px
Padding:       8px 16px
Font size:     14-16px, medium weight
```
Use for: phase labels (SETUP, TURN, LANDING), status, categories.

### Bullets
```
Marker:        8px circle, accent color
Indent:        32px from marker to text
Spacing:       24px between items
```
Bullets are scanning aids, not decoration. Max 4 per slide. If you need more, you need another slide.

### Insight Boxes
```
Background:    #0f172a (darker than surface)
Corner radius: 8px
Padding:       24px
Border:        None (contrast does the work)
```
Use for: lessons learned, constraints surfaced, the "so what."

---

## Images & Visualizations

### Placement Philosophy
Visuals should either:
1. **BE the slide** (full-bleed, hero image)
2. **Support the text** (right side, 40% width)
3. **Not exist** (text-only is fine)

Never let a visual and text compete for attention.

### Image Treatment
- No borders
- Subtle shadow if floating: `0 4px 24px rgba(0,0,0,0.3)`
- Corner radius: 8-16px (match card system)
- Desaturate slightly if competing with text

### Diagrams
- Use the accent color palette
- Labels at 18-20px minimum
- Connector lines: 2-3px, slate-500
- Arrow heads: simple, not decorative
- White space between elements

### Charts
- Headline states the insight, not the metric
- "APAC drives 40% of revenue" not "Revenue by Region"
- Minimal gridlines
- Data labels directly on elements when possible
- Legend only if necessary

---

## The Slide Hierarchy

Every deck has three phases. The visual language shifts subtly:

### Setup (slides 1-3)
- Cooler tones (blue accents)
- More content density acceptable
- Establishing credibility
- Two-column layouts work here

### Turn (slide 4-5)
- Hero typography
- Single statement
- Green or dramatic gradient
- This is the "money slide"
- Maximum white space

### Landing (slides 6+)
- Warmer tones (purple for questions, amber for action)
- Invitation energy
- Cards for options/questions
- Clear next steps

---

## Anti-Patterns

| Don't | Why | Do Instead |
|-------|-----|------------|
| Multiple accent colors on one slide | Dilutes focus | Pick one |
| Boxes around everything | Looks like a form | Let hierarchy do the work |
| Text smaller than 18px | Unreadable at distance | Edit the content shorter |
| Centered everything | Feels timid | Left-align, own the space |
| Decorative shapes | Noise | Purposeful white space |
| Stock photos | Generic, undermines credibility | Diagrams or text-only |
| Gradients on text | Readability nightmare | Solid colors |
| More than 4 bullets | Wall of text | Split into slides |

---

## Quality Checklist

Before finalizing any slide:

- [ ] Can I read every word from 10 feet away?
- [ ] Is there ONE focal point?
- [ ] Does every element have a job?
- [ ] Is there enough white space to breathe?
- [ ] Does the color accent reinforce the message?
- [ ] Would removing anything break the meaning?

---

## Implementation Notes

### Primitives Usage
When building with `monorail_primitives`:
- Start with the type — place headlines first
- Add supporting elements around the type
- Use `maxWidth` to control text wrapping
- Background operation first, then content
- Screenshot after every major addition

### Spacing Reference
```
Small gap:    24px  (between related items)
Medium gap:   48px  (between sections)
Large gap:    96px  (between major blocks)
Card padding: 32px  (internal)
Page margin:  80px  (from canvas edge)
```

---

## Examples

See slides in Figma deck "Keycard Template Library" for reference implementations.
