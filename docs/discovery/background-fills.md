# Discovery: Background Fills (Images, Advanced Gradients)

## Status: Discovery

Session 32 added solid color and gradient support to `op: "background"`. This doc explores what else is possible.

---

## What Figma Supports

The Figma Plugin API supports these fill types:

| Type | Description | Implemented? |
|------|-------------|--------------|
| `SOLID` | Single color | ✅ Yes |
| `GRADIENT_LINEAR` | Linear gradient | ✅ Yes (Session 32) |
| `GRADIENT_RADIAL` | Radial gradient | ✅ Yes (Session 32) |
| `GRADIENT_ANGULAR` | Angular/conic gradient | ❌ Not yet |
| `GRADIENT_DIAMOND` | Diamond-shaped gradient | ❌ Not yet |
| `IMAGE` | Image fill | ❌ Not yet |
| `VIDEO` | Video fill | ❌ Not yet |
| `PATTERN` | Pattern fill (beta) | ❌ Not yet |

### Multiple Fills

Figma allows **stacking multiple fills** on a single node. Example:
- Base: Image fill
- Overlay: Gradient with transparency for darkening effect
- Each fill can have its own blend mode

---

## Image Backgrounds

### The Challenge

Image fills require an `imageHash` — a reference to an image stored in Figma's system. To get a hash, you need to:

1. Have image bytes (Uint8Array)
2. Call `figma.createImage(bytes)` to upload and get a hash
3. Use the hash in an `ImagePaint`

### How Could We Get Image Bytes?

**Option A: Base64 in the operation**
```json
{ "op": "background", "image": { "base64": "iVBORw0KGgo...", "scaleMode": "FILL" } }
```
- Pro: Self-contained, no network needed
- Con: Large payloads, Claude would need to generate or embed base64

**Option B: URL fetch in plugin**
```json
{ "op": "background", "image": { "url": "https://example.com/bg.jpg", "scaleMode": "FILL" } }
```
- Pro: Clean API, small payloads
- Con: Plugin needs network access (CORS issues, Figma sandbox restrictions)
- Con: URL might not be accessible from Figma's servers

**Option C: Figma asset reference**
```json
{ "op": "background", "image": { "figmaAssetId": "123:456", "scaleMode": "FILL" } }
```
- Pro: Uses existing Figma assets, no network needed
- Con: User needs to pre-upload images to Figma
- Con: Need to discover available assets

### Image Scale Modes

Figma supports:
- `FILL` — Scale to fill, may crop
- `FIT` — Scale to fit, may letterbox
- `CROP` — Custom crop with transform
- `TILE` — Repeat pattern

---

## Advanced Gradients

### Angular Gradient

Rotates colors around a center point. Useful for:
- Conic sweeps
- Color wheel effects

```typescript
{
  type: 'GRADIENT_ANGULAR',
  gradientTransform: [[1, 0, 0.5], [0, 1, 0.5]],  // center point
  gradientStops: [
    { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
    { position: 0.33, color: { r: 0, g: 1, b: 0, a: 1 } },
    { position: 0.66, color: { r: 0, g: 0, b: 1, a: 1 } },
    { position: 1, color: { r: 1, g: 0, b: 0, a: 1 } }
  ]
}
```

### Diamond Gradient

Like radial but diamond-shaped. Rarely used in slides.

---

## Gradient + Image Overlay Pattern

Common for slides: dark gradient over image for text readability.

```typescript
node.fills = [
  // Base: Image
  {
    type: 'IMAGE',
    imageHash: hash,
    scaleMode: 'FILL'
  },
  // Overlay: Gradient for darkening
  {
    type: 'GRADIENT_LINEAR',
    gradientTransform: [[0, 1, 0], [-1, 0, 1]],  // bottom-to-top
    gradientStops: [
      { position: 0, color: { r: 0, g: 0, b: 0, a: 0.7 } },  // dark at bottom
      { position: 0.5, color: { r: 0, g: 0, b: 0, a: 0.3 } },
      { position: 1, color: { r: 0, g: 0, b: 0, a: 0 } }     // transparent at top
    ],
    blendMode: 'NORMAL'
  }
];
```

---

## Recommendation

### Now (Implemented)
- ✅ Solid colors via `fill`
- ✅ Linear gradients via `gradient`
- ✅ Radial gradients via `gradient.type: "radial"`

### Next (Low Effort)
- Angular gradients — add `type: "angular"` option
- Diamond gradients — add `type: "diamond"` option

### Future (Higher Effort)
- Image backgrounds — need to solve image byte delivery
- Gradient overlays on images — requires image support first
- Blend modes — could add `blendMode` to gradient config

### Probably Skip
- Video fills — niche use case for slides
- Pattern fills — still in beta, rarely needed

---

## Open Questions

1. **Image delivery:** Base64 vs URL vs Figma asset reference?
2. **Asset discovery:** How does Claude know what images are available?
3. **File size limits:** Figma caps images at 4096×4096 — need to validate/resize?
4. **Network in plugin:** Can Figma plugins fetch URLs? CORS restrictions?
