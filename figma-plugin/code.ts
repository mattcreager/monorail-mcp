// Monorail Figma Plugin
// Converts IR (deck spec) into Figma Slides

// Show the UI
figma.showUI(__html__, { width: 320, height: 280 });

// Types for our IR format
interface SlideContent {
  headline?: string;
  subline?: string;
  bullets?: string[];
  quote?: string;
  attribution?: string;
  takeaway?: string;
  left?: { title: string; body: string };
  right?: { title: string; body: string };
  stages?: Array<{ label: string; description?: string }>;
  columns?: string[];
  rows?: string[][];
  items?: string[];
  chart?: { type: string; placeholder?: boolean };
  // Position Cards archetype (Keycard-style)
  eyebrow?: string;
  cards?: Array<{
    label: string;
    title: string;
    body: string;
    badge?: string;
    badge_color?: 'green' | 'cyan' | 'orange';
  }>;
  features?: Array<{ label: string; description: string }>;
}

interface Slide {
  id: string;
  archetype: string;
  status: 'draft' | 'locked' | 'stub';
  content: SlideContent;
  extras?: string[];  // Unrecognized text added by human (captured, not modified)
  speaker_notes?: string;
  // Rich read fields (for intent-based collaboration)
  figma_id?: string;           // Figma node ID for this slide
  elements?: ElementInfo[];    // All text elements with IDs
  has_diagram?: boolean;       // True if complex nested content detected
}

interface DeckIR {
  deck?: { title: string };
  slides: Slide[];
}

// Colors - dark theme
const COLORS = {
  bg: { r: 0.06, g: 0.06, b: 0.1 },           // Dark blue-black background
  headline: { r: 0.996, g: 0.953, b: 0.78 },   // Warm cream for headlines
  body: { r: 0.83, g: 0.83, b: 0.85 },         // Light gray for body text
  muted: { r: 0.61, g: 0.64, b: 0.69 },        // Muted gray for sublines
  accent: { r: 0.86, g: 0.15, b: 0.15 },       // Red accent
  white: { r: 0.98, g: 0.98, b: 0.98 },        // Near white
  blue: { r: 0.05, g: 0.6, b: 1 },             // Accent blue
  dimmed: { r: 0.3, g: 0.3, b: 0.35 },         // Dimmed elements
  // Position cards colors
  cyan: { r: 0.0, g: 0.74, b: 0.84 },          // Cyan for accents
  green: { r: 0.22, g: 0.78, b: 0.55 },        // Green for "Built" badge
  orange: { r: 0.95, g: 0.55, b: 0.15 },       // Orange for features
  cardBg: { r: 0.1, g: 0.1, b: 0.12 },         // Card background
  cardBgHighlight: { r: 0.12, g: 0.14, b: 0.16 }, // Highlighted card (middle)
  featureBg: { r: 0.08, g: 0.08, b: 0.1 },     // Feature row background
};

// Slide dimensions
const SLIDE_WIDTH = 1920;
const SLIDE_HEIGHT = 1080;

// ID mapping storage key
const MAPPING_KEY = 'monorail_id_mapping';

// Clear mapping
async function clearMapping(): Promise<void> {
  await figma.clientStorage.setAsync(MAPPING_KEY, {});
}

// Save mapping
async function saveMapping(mapping: Record<string, string>): Promise<void> {
  await figma.clientStorage.setAsync(MAPPING_KEY, mapping);
}

// Check if we're in Figma Slides
function isInSlides(): boolean {
  return figma.editorType === 'slides';
}

// =============================================================================
// FONT FALLBACK CHAIN
// =============================================================================
// Try fonts in order until one loads successfully.
// This prevents failures when custom fonts aren't available.

const FONT_FALLBACKS = ['Inter', 'SF Pro Display', 'Helvetica Neue', 'Arial'];

interface LoadedFont {
  family: string;
  regular: FontName;
  bold: FontName;
}

// Cache for successfully loaded fonts
let loadedFontCache: LoadedFont | null = null;

/**
 * Try to load a font family with both Regular and Bold styles.
 * Returns the font names if successful, null if not available.
 */
async function tryLoadFont(family: string): Promise<LoadedFont | null> {
  try {
    const regular: FontName = { family, style: 'Regular' };
    const bold: FontName = { family, style: 'Bold' };
    
    await figma.loadFontAsync(regular);
    await figma.loadFontAsync(bold);
    
    return { family, regular, bold };
  } catch {
    // Font not available
    return null;
  }
}

/**
 * Load the first available font from the fallback chain.
 * Caches the result for subsequent calls.
 */
async function loadFontWithFallback(): Promise<LoadedFont> {
  // Return cached font if available
  if (loadedFontCache) {
    return loadedFontCache;
  }
  
  // Try each font in the fallback chain
  for (const family of FONT_FALLBACKS) {
    const loaded = await tryLoadFont(family);
    if (loaded) {
      loadedFontCache = loaded;
      console.log(`[Font] Using ${family}`);
      return loaded;
    }
  }
  
  // This shouldn't happen as Inter should always be available
  throw new Error(`No fonts available from fallback chain: ${FONT_FALLBACKS.join(', ')}`);
}

/**
 * Get the appropriate FontName for the current style.
 */
async function getFontName(bold: boolean = false): Promise<FontName> {
  const font = await loadFontWithFallback();
  return bold ? font.bold : font.regular;
}

// Helper to add text (with optional name for update-in-place)
async function addText(
  parent: SceneNode & ChildrenMixin,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  bold: boolean = false,
  color: RGB = COLORS.white,
  maxWidth?: number,
  nodeName?: string
): Promise<TextNode> {
  const textNode = figma.createText();
  textNode.x = x;
  textNode.y = y;
  
  // Set node name for update-in-place (allows finding node later)
  if (nodeName) {
    textNode.name = nodeName;
  }
  
  // Use font fallback chain
  const fontName = await getFontName(bold);
  
  textNode.fontName = fontName;
  textNode.fontSize = fontSize;
  textNode.fills = [{ type: 'SOLID', color }];
  textNode.characters = text;
  
  if (maxWidth) {
    textNode.resize(maxWidth, textNode.height);
    textNode.textAutoResize = 'HEIGHT';
  }
  
  parent.appendChild(textNode);
  return textNode;
}

// Helper to add rectangle
function addRect(
  parent: SceneNode & ChildrenMixin,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: RGB,
  stroke?: RGB,
  dashed?: boolean
): RectangleNode {
  const rect = figma.createRectangle();
  rect.x = x;
  rect.y = y;
  rect.resize(w, h);
  rect.fills = [{ type: 'SOLID', color: fill }];
  if (stroke) {
    rect.strokes = [{ type: 'SOLID', color: stroke }];
    rect.strokeWeight = 2;
    if (dashed) {
      rect.dashPattern = [10, 5];
    }
  }
  parent.appendChild(rect);
  return rect;
}

// Helper to create Auto Layout frame
function createAutoLayoutFrame(
  parent: SceneNode & ChildrenMixin,
  name: string,
  x: number,
  y: number,
  direction: 'VERTICAL' | 'HORIZONTAL' = 'VERTICAL',
  spacing: number = 24,
  padding: number = 0
): FrameNode {
  const frame = figma.createFrame();
  frame.name = name;

  // Enable Auto Layout
  frame.layoutMode = direction;
  frame.primaryAxisSizingMode = 'AUTO';  // Height adjusts to content
  frame.counterAxisSizingMode = 'AUTO';  // Width adjusts to content
  frame.itemSpacing = spacing;

  // Padding (uniform for simplicity)
  frame.paddingTop = padding;
  frame.paddingBottom = padding;
  frame.paddingLeft = padding;
  frame.paddingRight = padding;

  // Transparent background (inherits slide bg)
  frame.fills = [];
  
  // Clip content that overflows
  frame.clipsContent = false;
  
  // Append first, THEN set position (fixes Figma Slides coordinate issue after deletes)
  parent.appendChild(frame);
  frame.x = x;
  frame.y = y;
  
  return frame;
}

// Helper to add text inside Auto Layout (no x/y - layout handles position)
async function addAutoLayoutText(
  parent: FrameNode,
  text: string,
  fontSize: number,
  bold: boolean = false,
  color: RGB = COLORS.white,
  maxWidth?: number,
  nodeName?: string
): Promise<TextNode> {
  const textNode = figma.createText();
  
  if (nodeName) {
    textNode.name = nodeName;
  }
  
  // Use font fallback chain
  const fontName = await getFontName(bold);
  
  textNode.fontName = fontName;
  textNode.fontSize = fontSize;
  textNode.fills = [{ type: 'SOLID', color }];
  textNode.characters = text;
  
  if (maxWidth) {
    textNode.resize(maxWidth, textNode.height);
    textNode.textAutoResize = 'HEIGHT';
  }
  
  parent.appendChild(textNode);
  return textNode;
}

// Set slide background color directly (for SlideNode)
function setSlideBackground(node: SceneNode): void {
  // SlideNode has a fills property we can set directly
  if ('fills' in node) {
    (node as any).fills = [{ type: 'SOLID', color: COLORS.bg }];
  }
}

// Add dark background rectangle (fallback for frames)
function addBackgroundRect(parent: SceneNode & ChildrenMixin): void {
  const bg = figma.createRectangle();
  bg.name = 'Background';
  bg.x = 0;
  bg.y = 0;
  bg.resize(SLIDE_WIDTH, SLIDE_HEIGHT);
  bg.fills = [{ type: 'SOLID', color: COLORS.bg }];
  bg.locked = true;
  parent.appendChild(bg);
}

// Create slide and add content
async function createSlideWithContent(slide: Slide, index: number): Promise<SceneNode> {
  let container: SceneNode & ChildrenMixin;
  
  if (isInSlides()) {
    // Use Figma Slides API
    container = (figma as any).createSlide() as SceneNode & ChildrenMixin;
    container.name = `${slide.content.headline || slide.archetype}`;
    
    // Set background color directly on the slide
    setSlideBackground(container);
  } else {
    // Fallback: Create frame for Figma Design
    const frame = figma.createFrame();
    frame.name = `Slide ${index + 1}: ${slide.content.headline || slide.archetype}`;
    frame.resize(SLIDE_WIDTH, SLIDE_HEIGHT);
    frame.x = index * 2000;
    frame.y = 0;
    frame.fills = [{ type: 'SOLID', color: COLORS.bg }];
    container = frame;
  }
  
  // Add content
  await addContentToParent(container, slide);
  
  return container;
}

// Add content based on archetype (with named nodes for update-in-place)
async function addContentToParent(parent: SceneNode & ChildrenMixin, slide: Slide): Promise<void> {
  const c = slide.content;
  
  switch (slide.archetype) {
    case 'title':
      // Add gradient background frame for title slides
      {
        const gradientBg = figma.createRectangle();
        gradientBg.name = 'title-gradient-bg';
        gradientBg.resize(SLIDE_WIDTH, SLIDE_HEIGHT);
        gradientBg.x = 0;
        gradientBg.y = 0;
        gradientBg.fills = [{
          type: 'GRADIENT_LINEAR',
          gradientStops: [
            { position: 0, color: { ...COLORS.bg, a: 1 } },
            { position: 1, color: { r: 0.1, g: 0.1, b: 0.18, a: 1 } }
          ],
          gradientTransform: [[0.7, 0.7, 0], [-0.7, 0.7, 0.5]]  // 135deg diagonal
        }];
        parent.appendChild(gradientBg);
      }
      if (c.headline) await addText(parent, c.headline, 200, 420, 96, true, COLORS.headline, undefined, 'headline');
      if (c.subline) await addText(parent, c.subline, 200, 550, 36, false, COLORS.muted, undefined, 'subline');
      break;
      
    case 'section':
      if (c.headline) await addText(parent, c.headline, 200, 480, 72, true, COLORS.headline, undefined, 'headline');
      break;
      
    case 'big-idea':
      {
        // Use Auto Layout so subline flows below headline regardless of wrapping
        const bigIdeaContainer = createAutoLayoutFrame(
          parent,
          'big-idea-container',
          200,
          380,
          'VERTICAL',
          40  // spacing between headline and subline
        );
        if (c.headline) await addAutoLayoutText(bigIdeaContainer, c.headline, 72, true, COLORS.white, 1520, 'headline');
        if (c.subline) await addAutoLayoutText(bigIdeaContainer, c.subline, 32, false, COLORS.muted, 1520, 'subline');
      }
      break;
      
    case 'bullets':
      if (c.headline) await addText(parent, c.headline, 200, 180, 56, true, COLORS.headline, undefined, 'headline');
      if (c.bullets) {
        // Create Auto Layout container for bullets
        const bulletsContainer = createAutoLayoutFrame(
          parent,
          'bullets-container',
          200,      // x position
          300,      // y position (below headline)
          'VERTICAL',
          32        // spacing between bullets
        );
        
        // Add bullets as children (Auto Layout handles positioning)
        for (let i = 0; i < c.bullets.length; i++) {
          await addAutoLayoutText(
            bulletsContainer,
            `• ${c.bullets[i]}`,
            36,
            false,
            COLORS.body,
            1520,     // max width for text wrapping
            `bullet-${i}`
          );
        }
      }
      break;
      
    case 'two-column':
      if (c.headline) await addText(parent, c.headline, 200, 150, 56, true, COLORS.headline, undefined, 'headline');
      if (c.left) {
        await addText(parent, c.left.title, 200, 320, 36, true, COLORS.accent, undefined, 'left-title');
        await addText(parent, c.left.body, 200, 390, 28, false, COLORS.body, 680, 'left-body');
      }
      if (c.right) {
        await addText(parent, c.right.title, 1040, 320, 36, true, COLORS.headline, undefined, 'right-title');
        await addText(parent, c.right.body, 1040, 390, 28, false, COLORS.body, 680, 'right-body');
      }
      break;
      
    case 'quote':
      if (c.quote) await addText(parent, `"${c.quote}"`, 200, 380, 48, true, COLORS.white, 1520, 'quote');
      if (c.attribution) await addText(parent, `— ${c.attribution}`, 200, 560, 28, false, COLORS.muted, undefined, 'attribution');
      break;
      
    case 'summary':
      if (c.headline) await addText(parent, c.headline, 200, 200, 72, true, COLORS.headline, undefined, 'headline');
      if (c.items) {
        for (let i = 0; i < c.items.length; i++) {
          await addText(parent, c.items[i], 200, 380 + i * 100, 36, false, COLORS.body, undefined, `item-${i}`);
        }
      }
      break;
      
    case 'chart':
      if (c.headline) await addText(parent, c.headline, 200, 150, 56, true, COLORS.headline, undefined, 'headline');
      addRect(parent, 200, 280, 1520, 500, { r: 0.1, g: 0.1, b: 0.13 }, COLORS.dimmed, true);
      await addText(parent, `[Chart: ${c.chart?.type || 'data'}]`, 860, 500, 28, false, COLORS.muted, undefined, 'chart-placeholder');
      if (c.takeaway) await addText(parent, c.takeaway, 200, 820, 28, false, COLORS.muted, undefined, 'takeaway');
      break;
      
    case 'timeline':
      if (c.headline) await addText(parent, c.headline, 200, 150, 56, true, COLORS.headline, undefined, 'headline');
      if (c.stages) {
        const stageWidth = 1520 / c.stages.length;
        for (let i = 0; i < c.stages.length; i++) {
          const stage = c.stages[i];
          const x = 200 + i * stageWidth;
          
          // Marker circle
          const marker = figma.createEllipse();
          marker.name = `stage-${i}-marker`;
          marker.x = x + stageWidth / 2 - 20;
          marker.y = 340;
          marker.resize(40, 40);
          marker.fills = [{ type: 'SOLID', color: COLORS.blue }];
          parent.appendChild(marker);
          
          // Connector line
          if (i < c.stages.length - 1) {
            addRect(parent, x + stageWidth / 2 + 20, 356, stageWidth - 40, 8, COLORS.dimmed);
          }
          
          await addText(parent, stage.label, x + 10, 420, 28, true, COLORS.white, stageWidth - 20, `stage-${i}-label`);
          if (stage.description) {
            await addText(parent, stage.description, x + 10, 470, 22, false, COLORS.muted, stageWidth - 20, `stage-${i}-desc`);
          }
        }
      }
      break;
      
    case 'comparison':
      if (c.headline) await addText(parent, c.headline, 200, 150, 56, true, COLORS.headline, undefined, 'headline');
      const cols = c.columns || [];
      const rows = c.rows || [];
      const colW = 1520 / Math.max(cols.length, 1);
      const startY = 300;
      const rowH = 80;
      
      // Header row with background
      addRect(parent, 200, startY - 10, 1520, 60, { r: 0.1, g: 0.1, b: 0.13 });
      for (let i = 0; i < cols.length; i++) {
        await addText(parent, cols[i], 210 + i * colW, startY, 28, true, COLORS.headline, colW - 20, `col-${i}`);
      }
      
      // Data rows
      for (let r = 0; r < rows.length; r++) {
        const y = startY + 70 + r * rowH;
        // Alternate row background
        if (r % 2 === 0) {
          addRect(parent, 200, y - 10, 1520, rowH, { r: 0.08, g: 0.08, b: 0.11 });
        }
        for (let col = 0; col < rows[r].length; col++) {
          await addText(parent, rows[r][col], 210 + col * colW, y, 24, false, COLORS.body, colW - 20, `cell-${r}-${col}`);
        }
      }
      break;
      
    case 'position-cards':
      {
        // Eyebrow label (cyan, small caps style)
        if (c.eyebrow) {
          await addText(parent, c.eyebrow, 60, 80, 14, true, COLORS.cyan, undefined, 'eyebrow');
        }
        
        // Main headline (large, white)
        if (c.headline) {
          await addText(parent, c.headline, 60, 120, 52, true, COLORS.white, 1800, 'headline');
        }
        
        // Subline
        if (c.subline) {
          await addText(parent, c.subline, 60, 200, 52, true, COLORS.white, 1800, 'subline');
        }
        
        // Cards container
        const cards = c.cards || [];
        const cardCount = Math.min(cards.length, 3);
        const cardWidth = 460;
        const cardGap = 40;
        const cardsStartX = 60;
        const cardsStartY = 310;
        const cardHeight = 280;
        
        for (let i = 0; i < cardCount; i++) {
          const card = cards[i];
          const cardX = cardsStartX + i * (cardWidth + cardGap);
          const isMiddleCard = i === 1 && cardCount === 3;
          
          // Card background with rounded corners
          const cardBg = figma.createRectangle();
          cardBg.name = `card-${i}-bg`;
          cardBg.x = cardX;
          cardBg.y = cardsStartY;
          cardBg.resize(cardWidth, cardHeight);
          cardBg.cornerRadius = 16;
          cardBg.fills = [{ type: 'SOLID', color: isMiddleCard ? COLORS.cardBgHighlight : COLORS.cardBg }];
          if (isMiddleCard) {
            // Add cyan border for middle card
            cardBg.strokes = [{ type: 'SOLID', color: COLORS.cyan }];
            cardBg.strokeWeight = 2;
          }
          parent.appendChild(cardBg);
          
          // Card label (muted, small caps)
          await addText(parent, card.label, cardX + 24, cardsStartY + 24, 12, true, COLORS.muted, cardWidth - 48, `card-${i}-label`);
          
          // Card title (white, bold)
          await addText(parent, card.title, cardX + 24, cardsStartY + 56, 28, true, COLORS.white, cardWidth - 48, `card-${i}-title`);
          
          // Card body (muted)
          await addText(parent, card.body, cardX + 24, cardsStartY + 100, 18, false, COLORS.muted, cardWidth - 48, `card-${i}-body`);
          
          // Badge (if present)
          if (card.badge) {
            const badgeColor = card.badge_color === 'green' ? COLORS.green
              : card.badge_color === 'orange' ? COLORS.orange
              : COLORS.cyan;
            
            const badgeY = cardsStartY + cardHeight - 50;
            
            // Badge background (pill shape)
            const badgeBg = figma.createRectangle();
            badgeBg.name = `card-${i}-badge-bg`;
            badgeBg.x = cardX + 24;
            badgeBg.y = badgeY;
            badgeBg.resize(100, 32);
            badgeBg.cornerRadius = 16;
            badgeBg.fills = [{ type: 'SOLID', color: badgeColor, opacity: 0.15 }];
            parent.appendChild(badgeBg);
            
            // Badge text
            await addText(parent, card.badge, cardX + 36, badgeY + 7, 14, true, badgeColor, undefined, `card-${i}-badge`);
          }
        }
        
        // Features row
        const features = c.features || [];
        if (features.length > 0) {
          const featuresY = 640;
          
          // Features background
          const featuresBg = figma.createRectangle();
          featuresBg.name = 'features-bg';
          featuresBg.x = 60;
          featuresBg.y = featuresY;
          featuresBg.resize(1800, 160);
          featuresBg.cornerRadius = 16;
          featuresBg.fills = [{ type: 'SOLID', color: COLORS.featureBg }];
          parent.appendChild(featuresBg);
          
          // Features header
          await addText(parent, 'WHAT THE WEDGE DEMANDS — WHAT WE\'RE BUILDING', 85, featuresY + 24, 12, true, COLORS.muted, 1760, 'features-header');
          
          // Feature items (2 rows, 2 cols each or adapt)
          const featureStartY = featuresY + 60;
          const featureColWidth = 420;
          const featureRowHeight = 40;
          
          for (let i = 0; i < features.length; i++) {
            const feature = features[i];
            const row = Math.floor(i / 4);
            const col = i % 4;
            const fx = 85 + col * featureColWidth;
            const fy = featureStartY + row * featureRowHeight;
            
            // Orange dot
            const dot = figma.createEllipse();
            dot.name = `feature-${i}-dot`;
            dot.x = fx;
            dot.y = fy + 4;
            dot.resize(12, 12);
            dot.fills = [{ type: 'SOLID', color: COLORS.orange }];
            parent.appendChild(dot);
            
            // Feature label (bold)
            await addText(parent, feature.label, fx + 20, fy, 16, true, COLORS.white, undefined, `feature-${i}-label`);
            
            // Feature description (muted, inline after label)
            const labelWidth = feature.label.length * 9; // Approximate
            await addText(parent, feature.description, fx + 20 + labelWidth + 8, fy, 16, false, COLORS.muted, featureColWidth - labelWidth - 40, `feature-${i}-desc`);
          }
        }
      }
      break;
      
    default:
      if (c.headline) await addText(parent, c.headline, 200, 200, 64, true, COLORS.headline, undefined, 'headline');
  }
}

// Parse IR
function parseIR(irString: string): DeckIR | null {
  try {
    return JSON.parse(irString);
  } catch (e) {
    console.error('Failed to parse IR:', e);
    return null;
  }
}

// Find a named text node within a parent (searches recursively for Auto Layout containers)
function findNamedTextNode(parent: SceneNode & ChildrenMixin, name: string): TextNode | null {
  const children = (parent as any).children || [];
  for (const child of children) {
    if (child.type === 'TEXT' && child.name === name) {
      return child as TextNode;
    }
    // Recursively search inside frames (for Auto Layout containers)
    if (child.type === 'FRAME' && 'children' in child) {
      const found = findNamedTextNode(child as FrameNode, name);
      if (found) return found;
    }
  }
  return null;
}

// Find a named frame within a parent
function findNamedFrame(parent: SceneNode & ChildrenMixin, name: string): FrameNode | null {
  const children = (parent as any).children || [];
  for (const child of children) {
    if (child.type === 'FRAME' && child.name === name) {
      return child as FrameNode;
    }
  }
  return null;
}

// Update text node content in place (preserves position, font, color)
async function updateTextInPlace(node: TextNode, newText: string): Promise<void> {
  // Load the font that's already on the node
  const fontName = node.fontName;
  if (fontName !== figma.mixed) {
    await figma.loadFontAsync(fontName);
  }
  node.characters = newText;
}

// Update slide content in place (preserves human formatting)
async function updateContentInPlace(parent: SceneNode & ChildrenMixin, slide: Slide): Promise<void> {
  const c = slide.content;
  
  // Helper to update a named node if it exists
  async function updateNamed(name: string, text: string | undefined): Promise<void> {
    if (!text) return;
    const node = findNamedTextNode(parent, name);
    if (node) {
      await updateTextInPlace(node, text);
    }
  }
  
  switch (slide.archetype) {
    case 'title':
      await updateNamed('headline', c.headline);
      await updateNamed('subline', c.subline);
      break;
      
    case 'section':
      await updateNamed('headline', c.headline);
      break;
      
    case 'big-idea':
      await updateNamed('headline', c.headline);
      await updateNamed('subline', c.subline);
      break;
      
    case 'bullets':
      await updateNamed('headline', c.headline);
      if (c.bullets) {
        for (let i = 0; i < c.bullets.length; i++) {
          await updateNamed(`bullet-${i}`, `• ${c.bullets[i]}`);
        }
      }
      break;
      
    case 'two-column':
      await updateNamed('headline', c.headline);
      if (c.left) {
        await updateNamed('left-title', c.left.title);
        await updateNamed('left-body', c.left.body);
      }
      if (c.right) {
        await updateNamed('right-title', c.right.title);
        await updateNamed('right-body', c.right.body);
      }
      break;
      
    case 'quote':
      await updateNamed('quote', c.quote ? `"${c.quote}"` : undefined);
      await updateNamed('attribution', c.attribution ? `— ${c.attribution}` : undefined);
      break;
      
    case 'summary':
      await updateNamed('headline', c.headline);
      if (c.items) {
        for (let i = 0; i < c.items.length; i++) {
          await updateNamed(`item-${i}`, c.items[i]);
        }
      }
      break;
      
    case 'chart':
      await updateNamed('headline', c.headline);
      await updateNamed('takeaway', c.takeaway);
      break;
      
    case 'timeline':
      await updateNamed('headline', c.headline);
      if (c.stages) {
        for (let i = 0; i < c.stages.length; i++) {
          await updateNamed(`stage-${i}-label`, c.stages[i].label);
          await updateNamed(`stage-${i}-desc`, c.stages[i].description);
        }
      }
      break;
      
    case 'comparison':
      await updateNamed('headline', c.headline);
      if (c.columns) {
        for (let i = 0; i < c.columns.length; i++) {
          await updateNamed(`col-${i}`, c.columns[i]);
        }
      }
      if (c.rows) {
        for (let r = 0; r < c.rows.length; r++) {
          for (let col = 0; col < c.rows[r].length; col++) {
            await updateNamed(`cell-${r}-${col}`, c.rows[r][col]);
          }
        }
      }
      break;
      
    default:
      await updateNamed('headline', c.headline);
  }
}

// Detect archetype of existing slide by examining named nodes
function detectExistingArchetype(parent: SceneNode & ChildrenMixin): string {
  const children = (parent as any).children || [];
  const textNodes = children.filter((n: any) => n.type === 'TEXT') as TextNode[];
  const frameNodes = children.filter((n: any) => n.type === 'FRAME') as FrameNode[];
  const names = new Set(textNodes.map(t => t.name));
  const frameNames = new Set(frameNodes.map(f => f.name));
  
  // Check for Auto Layout container (new style)
  if (frameNames.has('bullets-container')) return 'bullets';
  
  // Check for archetype-specific node names
  if (names.has('quote') && names.has('attribution')) return 'quote';
  if (names.has('left-title') || names.has('right-title')) return 'two-column';
  // Legacy bullets detection (old style without container)
  if (Array.from(names).some(n => n.startsWith('bullet-'))) return 'bullets';
  if (Array.from(names).some(n => n.startsWith('item-'))) return 'summary';
  if (Array.from(names).some(n => n.startsWith('stage-'))) return 'timeline';
  if (Array.from(names).some(n => n.startsWith('col-') || n.startsWith('cell-'))) return 'comparison';
  if (names.has('chart-placeholder')) return 'chart';
  if (names.has('headline') && names.has('subline')) {
    // Could be title or big-idea - check font size
    const headline = textNodes.find(t => t.name === 'headline');
    if (headline && typeof headline.fontSize === 'number' && headline.fontSize >= 90) {
      return 'title';
    }
    return 'big-idea';
  }
  if (names.has('headline') && names.size === 1) return 'section';
  
  return 'unknown';
}

// =============================================================================
// SPIKE: Full node tree capture for Dynamic Templates
// =============================================================================

interface CapturedNode {
  id: string;
  type: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  // Visual properties
  fills?: any[];          // Solid, gradient, image fills
  strokes?: any[];
  strokeWeight?: number;
  cornerRadius?: number;
  effects?: any[];        // Shadows, blur
  // Auto Layout (frames only)
  layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'GRID';
  itemSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  // Text properties (text nodes only)
  characters?: string;
  fontSize?: number;
  fontFamily?: string;
  fontStyle?: string;
  textAlignHorizontal?: string;
  textAlignVertical?: string;
  lineHeight?: any;
  letterSpacing?: any;
  // Children (recursive)
  children?: CapturedNode[];
}

// Capture full node tree for template extraction
function captureNodeTree(node: SceneNode): CapturedNode {
  const captured: CapturedNode = {
    id: node.id,
    type: node.type,
    name: node.name,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
  };
  
  // Visual properties (most node types have these)
  if ('fills' in node && node.fills !== figma.mixed) {
    captured.fills = JSON.parse(JSON.stringify(node.fills));
  }
  if ('strokes' in node) {
    captured.strokes = JSON.parse(JSON.stringify(node.strokes));
  }
  if ('strokeWeight' in node && node.strokeWeight !== figma.mixed) {
    captured.strokeWeight = node.strokeWeight as number;
  }
  if ('cornerRadius' in node && node.cornerRadius !== figma.mixed) {
    captured.cornerRadius = node.cornerRadius as number;
  }
  if ('effects' in node) {
    captured.effects = JSON.parse(JSON.stringify(node.effects));
  }
  
  // Auto Layout (frames)
  if ('layoutMode' in node) {
    captured.layoutMode = node.layoutMode as CapturedNode['layoutMode'];
    if (node.layoutMode !== 'NONE') {
      captured.itemSpacing = node.itemSpacing;
      captured.paddingTop = node.paddingTop;
      captured.paddingRight = node.paddingRight;
      captured.paddingBottom = node.paddingBottom;
      captured.paddingLeft = node.paddingLeft;
    }
  }
  
  // Text properties
  if (node.type === 'TEXT') {
    const textNode = node as TextNode;
    captured.characters = textNode.characters;
    if (textNode.fontSize !== figma.mixed) {
      captured.fontSize = textNode.fontSize;
    }
    if (textNode.fontName !== figma.mixed) {
      captured.fontFamily = textNode.fontName.family;
      captured.fontStyle = textNode.fontName.style;
    }
    captured.textAlignHorizontal = textNode.textAlignHorizontal;
    captured.textAlignVertical = textNode.textAlignVertical;
    if (textNode.lineHeight !== figma.mixed) {
      captured.lineHeight = textNode.lineHeight;
    }
    if (textNode.letterSpacing !== figma.mixed) {
      captured.letterSpacing = textNode.letterSpacing;
    }
  }
  
  // Recursively capture children
  if ('children' in node) {
    captured.children = (node as any).children.map((child: SceneNode) => captureNodeTree(child));
  }
  
  return captured;
}

// =============================================================================
// RICH EXPORT: Capture ALL elements for intent-based collaboration
// =============================================================================

// Element info for rich read (Claude can see and target individual elements)
interface ElementInfo {
  id: string;              // Figma node ID (stable, for targeted updates)
  type: string;            // 'section_label', 'headline', 'body_text', 'accent_text', 'diagram_text', etc.
  text: string;            // The text content
  x: number;               // Absolute position on slide
  y: number;
  fontSize: number;
  isBold: boolean;
  width: number;
  height: number;
  parentName: string;      // Parent frame name (helps identify context)
  depth: number;           // Nesting depth (0 = direct child of slide)
  isInDiagram: boolean;    // True if deeply nested (likely part of diagram)
}

// Rich slide export (full element visibility)
interface RichSlideExport {
  id: string;              // IR slide ID
  figma_id: string;        // Figma node ID
  name: string;            // Slide name in Figma
  archetype: string;       // Best guess (may be 'unknown' for complex slides)
  elements: ElementInfo[]; // ALL text elements with IDs for targeting
  has_diagram: boolean;    // True if has complex nested content
  content: SlideContent;   // Legacy format for backward compatibility
  extras?: string[];       // Legacy extras field
}

// Recursively find ALL text nodes in a node tree
function getAllTextNodes(
  node: SceneNode,
  results: { node: TextNode; depth: number; parentName: string; absoluteX: number; absoluteY: number }[] = [],
  depth: number = 0,
  parentName: string = '',
  offsetX: number = 0,
  offsetY: number = 0
): { node: TextNode; depth: number; parentName: string; absoluteX: number; absoluteY: number }[] {
  
  if (node.type === 'TEXT') {
    results.push({
      node: node as TextNode,
      depth,
      parentName,
      absoluteX: node.x + offsetX,
      absoluteY: node.y + offsetY,
    });
  } else if ('children' in node) {
    const container = node as SceneNode & ChildrenMixin;
    const newOffsetX = offsetX + (node.type !== 'SLIDE' ? node.x : 0);
    const newOffsetY = offsetY + (node.type !== 'SLIDE' ? node.y : 0);
    
    for (const child of container.children) {
      getAllTextNodes(
        child,
        results,
        depth + 1,
        node.name || parentName,
        newOffsetX,
        newOffsetY
      );
    }
  }
  
  return results;
}

// Classify element type based on position, size, and context
function classifyElement(
  text: string,
  fontSize: number,
  isBold: boolean,
  x: number,
  y: number,
  depth: number,
  parentName: string
): string {
  const upperText = text.toUpperCase();
  
  // Section label: small caps, near top, often in a box
  if (y < 200 && fontSize <= 24 && (upperText === text || parentName.toLowerCase().includes('label'))) {
    return 'section_label';
  }
  
  // Headline: large, bold, upper portion of slide
  if (fontSize >= 48 && isBold && y < 500) {
    return 'headline';
  }
  
  // Quote: has quote marks
  if (text.startsWith('"') || text.startsWith('"')) {
    return 'quote';
  }
  
  // Attribution: starts with dash
  if (text.startsWith('—') || text.startsWith('-')) {
    return 'attribution';
  }
  
  // Bullet: starts with bullet character
  if (text.startsWith('•') || text.match(/^[-•]\s/)) {
    return 'bullet';
  }
  
  // Accent block text: nested, medium size, typically a key point
  if (depth >= 2 && fontSize >= 20 && fontSize <= 36 && text.length > 20) {
    return 'accent_text';
  }
  
  // Diagram text: deeply nested, smaller, or in a complex structure
  if (depth >= 3 || parentName.toLowerCase().includes('diagram') || parentName.toLowerCase().includes('flow')) {
    return 'diagram_text';
  }
  
  // Small caption/label
  if (fontSize <= 18) {
    return 'caption';
  }
  
  // Subline: secondary text, under headline position
  if (y > 400 && y < 650 && !isBold && fontSize >= 28 && fontSize <= 40) {
    return 'subline';
  }
  
  // Default: body text
  return 'body_text';
}

// Convert collected text info to ElementInfo array
function buildElementInfos(
  textInfos: { node: TextNode; depth: number; parentName: string; absoluteX: number; absoluteY: number }[]
): ElementInfo[] {
  return textInfos.map(info => {
    const { node, depth, parentName, absoluteX, absoluteY } = info;
    const fontSize = typeof node.fontSize === 'number' ? node.fontSize : 24;
    const isBold = node.fontName !== figma.mixed && (node.fontName as FontName).style.includes('Bold');
    
    return {
      id: node.id,
      type: classifyElement(node.characters, fontSize, isBold, absoluteX, absoluteY, depth, parentName),
      text: node.characters,
      x: absoluteX,
      y: absoluteY,
      fontSize,
      isBold,
      width: node.width,
      height: node.height,
      parentName,
      depth,
      isInDiagram: depth >= 3 || parentName.toLowerCase().includes('diagram'),
    };
  });
}

// =============================================================================
// LEGACY EXPORT: Pattern-matching for backward compatibility
// =============================================================================

interface TextAnalysis {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  isBold: boolean;
  width: number;
}

interface SlideAnalysis {
  archetype: string;
  content: SlideContent;
  extras?: string[];  // Text not claimed by archetype detection
}

// Helper to get all text nodes recursively from a parent (for bullets in containers)
function getRecursiveTextNodes(node: SceneNode): TextNode[] {
  if (node.type === 'TEXT') return [node];
  if ('children' in node) {
    const result: TextNode[] = [];
    for (const child of (node as any).children) {
      result.push(...getRecursiveTextNodes(child));
    }
    return result;
  }
  return [];
}

function analyzeSlideContent(directTextNodes: TextNode[], parent?: SceneNode & ChildrenMixin): SlideAnalysis {
  // First, try frame-based detection (most reliable for Monorail-created slides)
  if (parent) {
    const children = (parent as any).children || [];
    const frameNodes = children.filter((n: any) => n.type === 'FRAME') as FrameNode[];
    const frameNames = new Set(frameNodes.map(f => f.name));
    const textNames = new Set(directTextNodes.map(t => t.name));
    
    // BULLETS: Check for bullets-container frame
    if (frameNames.has('bullets-container')) {
      const bulletsFrame = frameNodes.find(f => f.name === 'bullets-container');
      const headline = directTextNodes.find(t => t.name === 'headline');
      const bulletNodes = bulletsFrame ? getRecursiveTextNodes(bulletsFrame) : [];
      
      return {
        archetype: 'bullets',
        content: {
          headline: headline?.characters || '',
          bullets: bulletNodes.map(t => t.characters.replace(/^[•-]\s*/, '')),
        }
      };
    }
    
    // BIG-IDEA: Check for big-idea-container frame
    if (frameNames.has('big-idea-container')) {
      const container = frameNodes.find(f => f.name === 'big-idea-container');
      const containerTexts = container ? getRecursiveTextNodes(container) : [];
      const headline = containerTexts.find(t => t.name === 'headline');
      const subline = containerTexts.find(t => t.name === 'subline');
      
      return {
        archetype: 'big-idea',
        content: {
          headline: headline?.characters || '',
          subline: subline?.characters,
        }
      };
    }
    
    // TITLE: Has gradient background and headline + optional subline
    if (frameNames.has('title-gradient-bg') || children.some((n: any) => n.name === 'title-gradient-bg')) {
      const headline = directTextNodes.find(t => t.name === 'headline');
      const subline = directTextNodes.find(t => t.name === 'subline');
      
      return {
        archetype: 'title',
        content: {
          headline: headline?.characters || '',
          subline: subline?.characters,
        }
      };
    }
    
    // TWO-COLUMN: Has left-title or right-title
    if (textNames.has('left-title') || textNames.has('right-title')) {
      const headline = directTextNodes.find(t => t.name === 'headline');
      const leftTitle = directTextNodes.find(t => t.name === 'left-title');
      const leftBody = directTextNodes.find(t => t.name === 'left-body');
      const rightTitle = directTextNodes.find(t => t.name === 'right-title');
      const rightBody = directTextNodes.find(t => t.name === 'right-body');
      
      return {
        archetype: 'two-column',
        content: {
          headline: headline?.characters || '',
          left: { title: leftTitle?.characters || '', body: leftBody?.characters || '' },
          right: { title: rightTitle?.characters || '', body: rightBody?.characters || '' },
        }
      };
    }
    
    // QUOTE: Has quote and attribution named nodes
    if (textNames.has('quote') && textNames.has('attribution')) {
      const quote = directTextNodes.find(t => t.name === 'quote');
      const attribution = directTextNodes.find(t => t.name === 'attribution');
      
      return {
        archetype: 'quote',
        content: {
          quote: quote?.characters.replace(/^[""]|[""]$/g, '') || '',
          attribution: attribution?.characters.replace(/^[—-]\s*/, '') || '',
        }
      };
    }
    
    // SUMMARY: Has item-* named nodes
    if (Array.from(textNames).some(n => n.startsWith('item-'))) {
      const headline = directTextNodes.find(t => t.name === 'headline');
      const items = directTextNodes.filter(t => t.name.startsWith('item-'));
      items.sort((a, b) => {
        const aNum = parseInt(a.name.replace('item-', '')) || 0;
        const bNum = parseInt(b.name.replace('item-', '')) || 0;
        return aNum - bNum;
      });
      
      return {
        archetype: 'summary',
        content: {
          headline: headline?.characters || '',
          items: items.map(t => t.characters),
        }
      };
    }
    
    // TIMELINE: Has stage-* named nodes
    if (Array.from(textNames).some(n => n.startsWith('stage-'))) {
      const headline = directTextNodes.find(t => t.name === 'headline');
      const stageLabels = directTextNodes.filter(t => t.name.match(/^stage-\d+-label$/));
      const stageDescs = directTextNodes.filter(t => t.name.match(/^stage-\d+-desc$/));
      
      const stages: Array<{ label: string; description?: string }> = [];
      stageLabels.sort((a, b) => {
        const aNum = parseInt(a.name.match(/stage-(\d+)/)?.[1] || '0');
        const bNum = parseInt(b.name.match(/stage-(\d+)/)?.[1] || '0');
        return aNum - bNum;
      });
      
      for (const label of stageLabels) {
        const idx = label.name.match(/stage-(\d+)/)?.[1];
        const desc = stageDescs.find(d => d.name === `stage-${idx}-desc`);
        stages.push({
          label: label.characters,
          description: desc?.characters,
        });
      }
      
      return {
        archetype: 'timeline',
        content: {
          headline: headline?.characters || '',
          stages,
        }
      };
    }
    
    // CHART: Has chart-placeholder
    if (textNames.has('chart-placeholder')) {
      const headline = directTextNodes.find(t => t.name === 'headline');
      const takeaway = directTextNodes.find(t => t.name === 'takeaway');
      const chartText = directTextNodes.find(t => t.name === 'chart-placeholder');
      const chartType = chartText?.characters.match(/\[Chart:\s*(\w+)\]/)?.[1] || 'data';
      
      return {
        archetype: 'chart',
        content: {
          headline: headline?.characters || '',
          chart: { type: chartType, placeholder: true },
          takeaway: takeaway?.characters,
        }
      };
    }
    
    // COMPARISON: Has col-* or cell-* named nodes
    if (Array.from(textNames).some(n => n.startsWith('col-') || n.startsWith('cell-'))) {
      const headline = directTextNodes.find(t => t.name === 'headline');
      const colNodes = directTextNodes.filter(t => t.name.startsWith('col-'));
      const cellNodes = directTextNodes.filter(t => t.name.startsWith('cell-'));
      
      colNodes.sort((a, b) => {
        const aNum = parseInt(a.name.replace('col-', '')) || 0;
        const bNum = parseInt(b.name.replace('col-', '')) || 0;
        return aNum - bNum;
      });
      
      const columns = colNodes.map(c => c.characters);
      const rows: string[][] = [];
      
      // Group cells by row
      const cellMap = new Map<number, Map<number, string>>();
      for (const cell of cellNodes) {
        const match = cell.name.match(/cell-(\d+)-(\d+)/);
        if (match) {
          const [, rowStr, colStr] = match;
          const row = parseInt(rowStr);
          const col = parseInt(colStr);
          if (!cellMap.has(row)) cellMap.set(row, new Map());
          cellMap.get(row)!.set(col, cell.characters);
        }
      }
      
      // Build rows array
      const rowNums = Array.from(cellMap.keys()).sort((a, b) => a - b);
      for (const rowNum of rowNums) {
        const rowCells = cellMap.get(rowNum)!;
        const colNums = Array.from(rowCells.keys()).sort((a, b) => a - b);
        rows.push(colNums.map(c => rowCells.get(c) || ''));
      }
      
      return {
        archetype: 'comparison',
        content: {
          headline: headline?.characters || '',
          columns,
          rows,
        }
      };
    }
    
    // SECTION: Only has a single headline
    if (textNames.size === 1 && textNames.has('headline')) {
      const headline = directTextNodes.find(t => t.name === 'headline');
      return {
        archetype: 'section',
        content: { headline: headline?.characters || '' }
      };
    }
  }
  
  // Fallback: Pattern-matching on text content (for non-Monorail slides)
  const texts: (TextAnalysis & { node: TextNode })[] = directTextNodes.map(t => ({
    text: t.characters,
    x: t.x,
    y: t.y,
    fontSize: typeof t.fontSize === 'number' ? t.fontSize : 24,
    isBold: t.fontName !== figma.mixed && (t.fontName as FontName).style.includes('Bold'),
    width: t.width,
    node: t,
  }));
  
  if (texts.length === 0) {
    return { archetype: 'unknown', content: {} };
  }
  
  // Track which texts are "claimed" by archetype detection
  const claimed = new Set<TextNode>();
  
  // Find the largest text (likely headline)
  const largestText = texts.reduce((a, b) => a.fontSize > b.fontSize ? a : b);
  
  // Count bullet points
  const bulletTexts = texts.filter(t => t.text.startsWith('•') || t.text.startsWith('-'));
  
  // Check for quote markers
  const hasQuote = texts.some(t => t.text.startsWith('"') || t.text.startsWith('"'));
  const hasAttribution = texts.some(t => t.text.startsWith('—') || t.text.startsWith('-'));
  
  // Check for two-column layout (texts on left and right halves)
  const leftTexts = texts.filter(t => t.x < SLIDE_WIDTH / 2 - 100);
  const rightTexts = texts.filter(t => t.x >= SLIDE_WIDTH / 2 - 100);
  const hasTwoColumns = leftTexts.length >= 2 && rightTexts.length >= 2;
  
  // Check for chart placeholder
  const hasChartPlaceholder = texts.some(t => t.text.includes('[Chart'));
  
  // Check for timeline (multiple texts at similar Y with labels)
  const midYTexts = texts.filter(t => t.y > 350 && t.y < 550);
  const hasTimelinePattern = midYTexts.length >= 3 && 
    new Set(midYTexts.map(t => Math.round(t.y / 50))).size <= 2;
  
  // Detect archetype based on patterns
  let archetype = 'unknown';
  let content: SlideContent = {};
  
  // TITLE: Large centered headline, maybe subline
  if (largestText.fontSize >= 80 && texts.length <= 2) {
    archetype = 'title';
    claimed.add(largestText.node);
    const sublineText = texts.find(t => t !== largestText);
    if (sublineText) claimed.add(sublineText.node);
    content = {
      headline: largestText.text,
      subline: sublineText?.text,
    };
  }
  // SECTION: Single large headline
  else if (texts.length === 1 && largestText.fontSize >= 60) {
    archetype = 'section';
    claimed.add(largestText.node);
    content = { headline: largestText.text };
  }
  // QUOTE: Has quote marks and attribution
  else if (hasQuote && hasAttribution) {
    archetype = 'quote';
    const quoteText = texts.find(t => t.text.startsWith('"') || t.text.startsWith('"'));
    const attrText = texts.find(t => t.text.startsWith('—') || t.text.startsWith('-'));
    if (quoteText) claimed.add(quoteText.node);
    if (attrText) claimed.add(attrText.node);
    content = {
      quote: quoteText?.text.replace(/^[""]|[""]$/g, '') || '',
      attribution: attrText?.text.replace(/^[—-]\s*/, '') || '',
    };
  }
  // BULLETS: Has bullet points
  else if (bulletTexts.length >= 2) {
    archetype = 'bullets';
    const headline = texts.find(t => t.fontSize >= 48 && !t.text.startsWith('•'));
    if (headline) claimed.add(headline.node);
    bulletTexts.forEach(t => claimed.add(t.node));
    content = {
      headline: headline?.text || '',
      bullets: bulletTexts.map(t => t.text.replace(/^[•-]\s*/, '')),
    };
  }
  // TWO-COLUMN: Content on both halves
  else if (hasTwoColumns) {
    archetype = 'two-column';
    const headline = texts.find(t => t.fontSize >= 48);
    const leftBold = leftTexts.find(t => t.isBold && t !== headline);
    const leftBody = leftTexts.find(t => !t.isBold && t !== headline && t.fontSize < 40);
    const rightBold = rightTexts.find(t => t.isBold);
    const rightBody = rightTexts.find(t => !t.isBold && t.fontSize < 40);
    if (headline) claimed.add(headline.node);
    if (leftBold) claimed.add(leftBold.node);
    if (leftBody) claimed.add(leftBody.node);
    if (rightBold) claimed.add(rightBold.node);
    if (rightBody) claimed.add(rightBody.node);
    content = {
      headline: headline?.text || '',
      left: { 
        title: leftBold?.text || '', 
        body: leftBody?.text || '' 
      },
      right: { 
        title: rightBold?.text || '', 
        body: rightBody?.text || '' 
      },
    };
  }
  // CHART: Has chart placeholder
  else if (hasChartPlaceholder) {
    archetype = 'chart';
    const headline = texts.find(t => t.fontSize >= 48);
    const takeaway = texts.find(t => t.y > 700);
    const chartText = texts.find(t => t.text.includes('[Chart'));
    if (headline) claimed.add(headline.node);
    if (takeaway) claimed.add(takeaway.node);
    if (chartText) claimed.add(chartText.node);
    const chartType = chartText?.text.match(/\[Chart:\s*(\w+)\]/)?.[1] || 'data';
    content = {
      headline: headline?.text || '',
      chart: { type: chartType, placeholder: true },
      takeaway: takeaway?.text,
    };
  }
  // TIMELINE: Multiple items in a row pattern
  else if (hasTimelinePattern) {
    archetype = 'timeline';
    const headline = texts.find(t => t.fontSize >= 48);
    if (headline) claimed.add(headline.node);
    const stageTexts = texts.filter(t => t !== headline && t.y > 350);
    stageTexts.forEach(t => claimed.add(t.node));
    // Group by x position
    const stageGroups: Map<number, (TextAnalysis & { node: TextNode })[]> = new Map();
    for (const t of stageTexts) {
      const bucket = Math.round(t.x / 300) * 300;
      if (!stageGroups.has(bucket)) stageGroups.set(bucket, []);
      stageGroups.get(bucket)!.push(t);
    }
    const stages = Array.from(stageGroups.values()).map(group => {
      group.sort((a, b) => a.y - b.y);
      return {
        label: group[0]?.text || '',
        description: group[1]?.text,
      };
    });
    content = {
      headline: headline?.text || '',
      stages,
    };
  }
  // SUMMARY: Headline + list of items (no bullets)
  else if (texts.length >= 3 && texts.length <= 5) {
    const headline = texts.find(t => t.fontSize >= 60);
    const items = texts.filter(t => t !== headline && t.fontSize >= 28 && t.fontSize <= 40);
    if (items.length >= 2) {
      archetype = 'summary';
      if (headline) claimed.add(headline.node);
      items.forEach(t => claimed.add(t.node));
      content = {
        headline: headline?.text || '',
        items: items.map(t => t.text),
      };
    }
  }
  // BIG-IDEA: Large headline + subline
  else if (largestText.fontSize >= 60 && texts.length === 2) {
    archetype = 'big-idea';
    claimed.add(largestText.node);
    const subline = texts.find(t => t !== largestText);
    if (subline) claimed.add(subline.node);
    content = {
      headline: largestText.text,
      subline: subline?.text,
    };
  }
  
  // Fallback: unknown with all text as headline/subline
  if (archetype === 'unknown') {
    if (texts[0]) claimed.add(texts[0].node);
    if (texts[1]) claimed.add(texts[1].node);
    content = {
      headline: texts[0]?.text || '',
      subline: texts[1]?.text,
    };
  }
  
  // Collect extras: text nodes not claimed by archetype detection
  const extras = texts
    .filter(t => !claimed.has(t.node))
    .map(t => t.text)
    .filter(text => text.trim().length > 0);
  
  return { 
    archetype, 
    content,
    extras: extras.length > 0 ? extras : undefined,
  };
}

// =============================================================================
// TARGETED WRITE: Patch specific elements by ID (preserves everything else)
// =============================================================================

interface ElementPatch {
  target: string;      // Figma node ID (from rich read)
  text: string;        // New text content
}

interface PatchRequest {
  slide_id?: string;   // Optional: for logging/context
  changes: ElementPatch[];
}

async function applyPatches(patches: PatchRequest): Promise<{ updated: number; failed: string[] }> {
  let updated = 0;
  const failed: string[] = [];
  
  // Load fallback font upfront (we might need it for new text)
  await loadFontWithFallback();
  
  for (const patch of patches.changes) {
    try {
      const node = await (figma as any).getNodeByIdAsync(patch.target);
      
      if (!node) {
        console.warn(`Node not found: ${patch.target}`);
        failed.push(patch.target);
        continue;
      }
      
      if (node.type !== 'TEXT') {
        console.warn(`Node ${patch.target} is not a text node (type: ${node.type})`);
        failed.push(patch.target);
        continue;
      }
      
      const textNode = node as TextNode;
      
      // Load the existing font to preserve styling
      const fontName = textNode.fontName;
      if (fontName !== figma.mixed) {
        await figma.loadFontAsync(fontName);
      }
      
      // Update text content only (preserves position, size, color, font)
      textNode.characters = patch.text;
      updated++;
      
      console.log(`Patched ${patch.target}: "${patch.text.substring(0, 30)}..."`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to patch ${patch.target}:`, errorMsg);
      failed.push(patch.target);
    }
  }
  
  return { updated, failed };
}

// Main message handler
figma.ui.onmessage = async (msg: { type: string; ir?: string; patches?: PatchRequest; mode?: 'append' | 'replace'; startIndex?: number }) => {
  try {
    if (msg.type === 'apply-ir') {
      if (!msg.ir) {
        figma.notify('No IR provided', { error: true });
        return;
      }
      
      const ir = parseIR(msg.ir);
      if (!ir) {
        figma.notify('Failed to parse IR', { error: true });
        return;
      }
      
      const editorMode = isInSlides() ? 'Figma Slides' : 'Figma Design';
      console.log(`Editor: ${figma.editorType}, Mode: ${editorMode}`);
      
      // Load fonts upfront with fallback chain
      await loadFontWithFallback();
      
      // REPLACE MODE: Delete all existing slides first
      const pushMode = msg.mode || 'append';
      let replacedCount = 0;
      
      if (pushMode === 'replace') {
        console.log('Replace mode: deleting all existing slides');
        
        // Find all slides in the document
        const slidesToDelete: SceneNode[] = [];
        
        if (isInSlides()) {
          // In Figma Slides, find all SLIDE nodes
          function findAllSlides(node: SceneNode): void {
            if ((node as any).type === 'SLIDE') {
              slidesToDelete.push(node);
            } else if ('children' in node) {
              for (const child of (node as any).children) {
                findAllSlides(child);
              }
            }
          }
          for (const node of figma.currentPage.children) {
            findAllSlides(node);
          }
        } else {
          // In Figma Design, find all top-level frames that look like slides (1920x1080)
          for (const node of figma.currentPage.children) {
            if (node.type === 'FRAME' && node.width === 1920 && node.height === 1080) {
              slidesToDelete.push(node);
            }
          }
        }
        
        // Delete them all
        for (const slide of slidesToDelete) {
          try {
            slide.remove();
            replacedCount++;
          } catch (e) {
            console.warn(`Failed to delete slide: ${e}`);
          }
        }
        
        console.log(`Deleted ${replacedCount} existing slides`);
        
        // Clear the mapping since we're starting fresh
        await figma.clientStorage.setAsync(MAPPING_KEY, {});
      }
      
      // Load existing mapping (for updates) - will be empty in replace mode
      const existingMapping = pushMode === 'replace' ? {} : (await figma.clientStorage.getAsync(MAPPING_KEY) || {});
      const mapping: Record<string, string> = { ...existingMapping };
      
      // Get start index for positioning
      const startIndex = msg.startIndex;
      
      // If we need to position slides, find the slide container first
      let slideContainer: (SceneNode & ChildrenMixin) | null = null;
      if (startIndex !== undefined && isInSlides()) {
        // Find the SLIDE_ROW that contains slides
        function findSlideContainer(node: SceneNode): (SceneNode & ChildrenMixin) | null {
          if ((node as any).type === 'SLIDE_ROW') return node as SceneNode & ChildrenMixin;
          if ('children' in node) {
            for (const child of (node as any).children) {
              const found = findSlideContainer(child);
              if (found) return found;
            }
          }
          return null;
        }
        for (const node of figma.currentPage.children) {
          slideContainer = findSlideContainer(node);
          if (slideContainer) break;
        }
      }
      
      let created = 0;
      let updated = 0;
      let skipped = 0;
      const createdNames: string[] = [];
      const updatedNames: string[] = [];
      
      for (let i = 0; i < ir.slides.length; i++) {
        const slide = ir.slides[i];
        const existingFigmaId = mapping[slide.id];
        
        try {
          // Check if slide exists and is valid
          let existingNode: SceneNode | null = null;
          if (existingFigmaId) {
            existingNode = await (figma as any).getNodeByIdAsync(existingFigmaId);
          }
          
          // LOCKED: Skip if status is locked and node exists
          if (slide.status === 'locked' && existingNode) {
            console.log(`Skipping locked slide: ${slide.id}`);
            skipped++;
            figma.notify(`Skipped ${slide.id} (locked)`);
            continue;
          }
          
          // UPDATE: If node exists, try update-in-place or re-render
          if (existingNode) {
            const existingArchetype = detectExistingArchetype(existingNode as SceneNode & ChildrenMixin);
            
            // If archetype matches, update in place (preserves human formatting)
            if (existingArchetype === slide.archetype) {
              console.log(`Updating slide ${i + 1} in place: ${slide.archetype}`);
              
              // Update name
              const slideName = slide.content.headline || slide.archetype;
              existingNode.name = slideName;
              
              // Update content in place (preserves position, font, color)
              await updateContentInPlace(existingNode as SceneNode & ChildrenMixin, slide);
              
              updated++;
              updatedNames.push(slideName);
              figma.notify(`Updated: "${slideName}"`);
            } 
            // If archetype changed, clear and re-render
            else {
              console.log(`Re-rendering slide ${i + 1}: ${existingArchetype} → ${slide.archetype}`);
              
              // Clear existing children
              const children = [...(existingNode as any).children];
              for (const child of children) {
                child.remove();
              }
              
              // Update name
              const slideName = slide.content.headline || slide.archetype;
              existingNode.name = slideName;
              
              // Re-apply background (for slides)
              if (isInSlides()) {
                setSlideBackground(existingNode);
              }
              
              // Re-add content
              await addContentToParent(existingNode as SceneNode & ChildrenMixin, slide);
              
              updated++;
              updatedNames.push(slideName);
              figma.notify(`Re-rendered: "${slideName}"`);
            }
          }
          // CREATE: New slide
          else {
            console.log(`Creating slide ${i + 1}: ${slide.archetype}`);
            const node = await createSlideWithContent(slide, i);
            const slideName = slide.content.headline || slide.archetype;
            
            // If positioning is requested, move the slide to the correct position
            if (startIndex !== undefined && slideContainer && isInSlides()) {
              // Calculate the target position: startIndex + number of slides already created
              const targetPosition = startIndex + created;
              const currentIndex = slideContainer.children.indexOf(node);
              
              if (currentIndex !== -1 && currentIndex !== targetPosition) {
                // Move to target position
                const clampedTarget = Math.min(targetPosition, slideContainer.children.length - 1);
                (slideContainer as any).insertChild(clampedTarget, node);
              }
            }
            
            mapping[slide.id] = node.id;
            created++;
            createdNames.push(slideName);
            figma.notify(`Created: "${slideName}"`);
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error(`Error on slide ${i + 1}:`, errorMsg);
          figma.notify(`Error on slide ${i + 1}: ${errorMsg}`, { error: true });
        }
      }
      
      await saveMapping(mapping);
      
      // Rich summary
      const summary = [];
      if (replacedCount > 0) {
        summary.push(`Replaced ${replacedCount} old slides`);
      }
      if (created > 0) {
        const createList = createdNames.length <= 2
          ? createdNames.map(n => `"${n}"`).join(', ')
          : `${created} slides`;
        summary.push(`Created: ${createList}`);
      }
      if (updated > 0) {
        const updateList = updatedNames.length <= 2
          ? updatedNames.map(n => `"${n}"`).join(', ')
          : `${updated} slides`;
        summary.push(`Updated: ${updateList}`);
      }
      if (skipped > 0) summary.push(`${skipped} skipped (locked)`);

      const positionText = pushMode === 'append' && startIndex !== undefined ? ` at position ${startIndex}` : '';
      figma.notify(`✓ ${summary.join(' • ')}${positionText}`, { timeout: 3000 });
      figma.ui.postMessage({
        type: 'applied',
        count: created + updated,
        created,
        updated,
        skipped,
        replaced: replacedCount,
        mode: pushMode,
        createdNames,
        updatedNames,
        startIndex
      });
    }
    
    if (msg.type === 'export-ir') {
      const slides: Slide[] = [];
      
      // Load stored mapping to preserve IDs
      const storedMapping = await figma.clientStorage.getAsync(MAPPING_KEY) || {};
      const reverseMapping: Record<string, string> = {};
      for (const [irId, figmaId] of Object.entries(storedMapping)) {
        reverseMapping[figmaId as string] = irId;
      }
      
      // Collect all slide nodes
      const slideNodes: SceneNode[] = [];
      
      if (isInSlides()) {
        // In Figma Slides: traverse to find SLIDE nodes
        // Structure is: Page -> SLIDE_GRID -> SLIDE_ROW -> SLIDE
        function findSlides(node: SceneNode): void {
          if ((node as any).type === 'SLIDE') {
            slideNodes.push(node);
            return;
          }
          if ('children' in node) {
            for (const child of (node as any).children) {
              findSlides(child);
            }
          }
        }
        
        for (const node of figma.currentPage.children) {
          findSlides(node);
        }
      } else {
        // In Figma Design: look for frames named "Slide"
        for (const node of figma.currentPage.children) {
          if (node.type === 'FRAME' && node.name.includes('Slide')) {
            slideNodes.push(node);
          }
        }
      }
      
      for (const node of slideNodes) {
        try {
          // =====================================================
          // RICH READ: Get ALL text nodes recursively
          // =====================================================
          const allTextInfos = getAllTextNodes(node);
          const elements = buildElementInfos(allTextInfos);
          
          // Check if this slide has diagram-like complexity
          const hasDiagram = elements.some(e => e.isInDiagram) || 
                             elements.filter(e => e.depth >= 2).length > 5;
          
          // Sort elements by position (top to bottom, left to right)
          elements.sort((a, b) => {
            if (Math.abs(a.y - b.y) > 50) return a.y - b.y;
            return a.x - b.x;
          });
          
          // =====================================================
          // ARCHETYPE DETECTION: Frame-based first, then pattern-matching
          // =====================================================
          const children = (node as any).children || [];
          const directTextNodes = children.filter((n: any) => n.type === 'TEXT') as TextNode[];
          directTextNodes.sort((a, b) => {
            if (Math.abs(a.y - b.y) > 50) return a.y - b.y;
            return a.x - b.x;
          });
          const analysis = analyzeSlideContent(directTextNodes, node as SceneNode & ChildrenMixin);
          
          // Get or generate slide ID
          const slideId = reverseMapping[node.id] || `slide-${slides.length + 1}`;
          
          slides.push({
            id: slideId,
            figma_id: node.id,
            archetype: analysis.archetype,
            status: 'draft',
            content: analysis.content,
            extras: analysis.extras,
            // Rich read fields
            elements,
            has_diagram: hasDiagram,
          });
        } catch (err) {
          console.error(`Error processing slide "${node.name}":`, err);
        }
      }
      
      const ir: DeckIR = {
        deck: { title: 'Pulled Deck' },
        slides
      };
      
      // Count slides with rich content
      const richSlides = slides.filter(s => (s.elements?.length || 0) > 0).length;
      const diagramSlides = slides.filter(s => s.has_diagram).length;
      
      figma.ui.postMessage({ type: 'exported', ir: JSON.stringify(ir, null, 2) });
      figma.notify(`Pulled ${slides.length} slides (${richSlides} with elements, ${diagramSlides} with diagrams)`);
    }
    
    if (msg.type === 'patch-elements') {
      if (!msg.patches || !msg.patches.changes || msg.patches.changes.length === 0) {
        figma.notify('No patches provided', { error: true });
        figma.ui.postMessage({ type: 'patched', updated: 0, failed: [] });
        return;
      }
      
      const result = await applyPatches(msg.patches);
      
      if (result.failed.length > 0) {
        figma.notify(`Patched ${result.updated} elements (${result.failed.length} failed)`, { error: true });
      } else {
        figma.notify(`✓ Patched ${result.updated} elements`);
      }
      
      figma.ui.postMessage({ type: 'patched', ...result });
    }
    
    // SPIKE: Export full template structure
    if (msg.type === 'capture-template') {
      // Get the first selected node, or first slide
      let targetNode: SceneNode | null = null;
      
      if (figma.currentPage.selection.length > 0) {
        targetNode = figma.currentPage.selection[0];
      } else {
        // Find first slide
        if (isInSlides()) {
          function findFirstSlide(node: SceneNode): SceneNode | null {
            if ((node as any).type === 'SLIDE') return node;
            if ('children' in node) {
              for (const child of (node as any).children) {
                const found = findFirstSlide(child);
                if (found) return found;
              }
            }
            return null;
          }
          for (const node of figma.currentPage.children) {
            targetNode = findFirstSlide(node);
            if (targetNode) break;
          }
        }
      }
      
      if (!targetNode) {
        figma.notify('No slide selected or found', { error: true });
        return;
      }
      
      const captured = captureNodeTree(targetNode);
      
      // Count nodes for feedback
      function countNodes(node: CapturedNode): number {
        let count = 1;
        if (node.children) {
          for (const child of node.children) {
            count += countNodes(child);
          }
        }
        return count;
      }
      const nodeCount = countNodes(captured);
      
      figma.ui.postMessage({ 
        type: 'template-captured', 
        template: JSON.stringify(captured, null, 2),
        nodeCount 
      });
      figma.notify(`Captured template: ${nodeCount} nodes from "${targetNode.name}"`);
    }
    
    // SPIKE: Create new slide with design system tokens
    if (msg.type === 'create-styled-slide') {
      const layout = (msg as any).layout as string;
      const content = (msg as any).content as Record<string, any>;
      const ds = (msg as any).designSystem as any;
      
      try {
        // Find design system colors
        const getBgColor = (): RGB => {
          if (ds?.background?.color) return ds.background.color;
          return COLORS.bg;
        };
        
        const getAccentColor = (): RGB => {
          const accent = ds?.colors?.find((c: any) => c.name?.includes('accent') || c.name?.includes('green'));
          if (accent?.rgb) return accent.rgb;
          return { r: 0.8, g: 1, b: 0.24 }; // lime green default
        };
        
        const getTextColor = (): RGB => {
          const light = ds?.colors?.find((c: any) => c.name === 'light' || c.hex === '#ffffff');
          if (light?.rgb) return light.rgb;
          return COLORS.white;
        };
        
        const getHeadlineFont = (): { family: string; style: string; size: number } => {
          // Look for a monospace or display font for headlines
          const headlineFont = ds?.fonts?.find((f: any) => 
            f.usage?.some((u: string) => u.includes('headline') || u.includes('10'))
          );
          if (headlineFont) {
            return { 
              family: headlineFont.family, 
              style: headlineFont.style,
              size: Math.max(...(headlineFont.sizes || [48]))
            };
          }
          return { family: 'Inter', style: 'Bold', size: 48 };
        };
        
        const getBodyFont = (): { family: string; style: string; size: number } => {
          const bodyFont = ds?.fonts?.find((f: any) => 
            f.family === 'Geist' || f.usage?.some((u: string) => u.includes('Card'))
          );
          if (bodyFont) {
            return { 
              family: bodyFont.family, 
              style: bodyFont.style,
              size: bodyFont.sizes?.[0] || 22
            };
          }
          return { family: 'Inter', style: 'Regular', size: 22 };
        };
        
        // Create the slide
        let slide: SceneNode & ChildrenMixin;
        
        if (isInSlides()) {
          slide = (figma as any).createSlide() as SceneNode & ChildrenMixin;
        } else {
          const frame = figma.createFrame();
          frame.resize(SLIDE_WIDTH, SLIDE_HEIGHT);
          slide = frame;
        }
        
        // Set background
        const bgColor = getBgColor();
        if ('fills' in slide) {
          (slide as any).fills = [{ type: 'SOLID', color: bgColor }];
        }
        
        // Get fonts to load
        const headlineFont = getHeadlineFont();
        const bodyFont = getBodyFont();
        
        // Try to load fonts, fall back to Inter if unavailable
        let headlineFontName: FontName = { family: 'Inter', style: 'Bold' };
        let bodyFontName: FontName = { family: 'Inter', style: 'Regular' };
        
        try {
          await figma.loadFontAsync({ family: headlineFont.family, style: headlineFont.style });
          headlineFontName = { family: headlineFont.family, style: headlineFont.style };
        } catch {
          // Use font fallback chain
          headlineFontName = await getFontName(true);
        }
        
        try {
          await figma.loadFontAsync({ family: bodyFont.family, style: bodyFont.style });
          bodyFontName = { family: bodyFont.family, style: bodyFont.style };
        } catch {
          // Use font fallback chain
          bodyFontName = await getFontName(false);
        }
        
        const accentColor = getAccentColor();
        const textColor = getTextColor();
        const cornerRadius = ds?.corners?.cardRadius || 8;
        
        // Build layout based on type
        switch (layout) {
          case 'quote': {
            slide.name = content.attribution ? `Quote: ${content.attribution}` : 'Quote';
            
            // Quote text (large, centered)
            const quoteText = figma.createText();
            quoteText.fontName = headlineFontName;
            quoteText.fontSize = 36;
            quoteText.fills = [{ type: 'SOLID', color: textColor }];
            quoteText.characters = `"${content.quote || 'Quote goes here'}"`;
            quoteText.x = 200;
            quoteText.y = 400;
            quoteText.resize(1520, quoteText.height);
            quoteText.textAutoResize = 'HEIGHT';
            quoteText.textAlignHorizontal = 'CENTER';
            slide.appendChild(quoteText);
            
            // Attribution
            if (content.attribution) {
              const attrText = figma.createText();
              attrText.fontName = bodyFontName;
              attrText.fontSize = 20;
              attrText.fills = [{ type: 'SOLID', color: accentColor }];
              attrText.characters = `— ${content.attribution}`;
              attrText.x = 200;
              attrText.y = 550;
              attrText.resize(1520, attrText.height);
              attrText.textAlignHorizontal = 'CENTER';
              slide.appendChild(attrText);
            }
            break;
          }
          
          case 'bullets': {
            slide.name = content.headline || 'Bullets';
            
            // Headline
            const headline = figma.createText();
            headline.fontName = headlineFontName;
            headline.fontSize = headlineFont.size;
            headline.fills = [{ type: 'SOLID', color: textColor }];
            headline.characters = content.headline || 'Headline';
            headline.x = 60;
            headline.y = 150;
            headline.resize(800, headline.height);
            headline.textAutoResize = 'HEIGHT';
            slide.appendChild(headline);
            
            // Bullets container with Auto Layout
            const bulletsFrame = figma.createFrame();
            bulletsFrame.name = 'Bullets';
            bulletsFrame.layoutMode = 'VERTICAL';
            bulletsFrame.itemSpacing = ds?.spacing?.itemSpacing || 24;
            bulletsFrame.primaryAxisSizingMode = 'AUTO';
            bulletsFrame.counterAxisSizingMode = 'AUTO';
            bulletsFrame.fills = [];
            bulletsFrame.x = 60;
            bulletsFrame.y = 300;
            
            const bullets = content.bullets || ['First point', 'Second point', 'Third point'];
            for (const bullet of bullets) {
              const bulletText = figma.createText();
              bulletText.fontName = bodyFontName;
              bulletText.fontSize = bodyFont.size;
              bulletText.fills = [{ type: 'SOLID', color: textColor }];
              bulletText.characters = `• ${bullet}`;
              bulletText.resize(800, bulletText.height);
              bulletText.textAutoResize = 'HEIGHT';
              bulletsFrame.appendChild(bulletText);
            }
            
            slide.appendChild(bulletsFrame);
            break;
          }
          
          case 'big-idea': {
            slide.name = content.headline || 'Big Idea';
            
            // Large headline
            const headline = figma.createText();
            headline.fontName = headlineFontName;
            headline.fontSize = 56;
            headline.fills = [{ type: 'SOLID', color: textColor }];
            headline.characters = content.headline || 'The big idea';
            headline.x = 200;
            headline.y = 380;
            headline.resize(1520, headline.height);
            headline.textAutoResize = 'HEIGHT';
            slide.appendChild(headline);
            
            // Subline
            if (content.subline) {
              const subline = figma.createText();
              subline.fontName = bodyFontName;
              subline.fontSize = 24;
              subline.fills = [{ type: 'SOLID', color: { r: textColor.r * 0.7, g: textColor.g * 0.7, b: textColor.b * 0.7 } }];
              subline.characters = content.subline;
              subline.x = 200;
              subline.y = 500;
              subline.resize(1520, subline.height);
              subline.textAutoResize = 'HEIGHT';
              slide.appendChild(subline);
            }
            break;
          }
          
          case 'section': {
            slide.name = content.headline || 'Section';
            
            // Section label with accent border
            const labelFrame = figma.createFrame();
            labelFrame.name = 'Section Label';
            labelFrame.layoutMode = 'HORIZONTAL';
            labelFrame.paddingTop = 12;
            labelFrame.paddingBottom = 12;
            labelFrame.paddingLeft = 16;
            labelFrame.paddingRight = 16;
            labelFrame.primaryAxisSizingMode = 'AUTO';
            labelFrame.counterAxisSizingMode = 'AUTO';
            labelFrame.fills = [];
            labelFrame.strokes = [{ type: 'SOLID', color: accentColor }];
            labelFrame.strokeWeight = 2;
            labelFrame.cornerRadius = cornerRadius;
            labelFrame.x = 60;
            labelFrame.y = 480;
            
            const labelText = figma.createText();
            labelText.fontName = headlineFontName;
            labelText.fontSize = 24;
            labelText.fills = [{ type: 'SOLID', color: accentColor }];
            labelText.characters = (content.headline || 'SECTION').toUpperCase();
            labelFrame.appendChild(labelText);
            
            slide.appendChild(labelFrame);
            break;
          }
        }
        
        // Select the new slide
        figma.currentPage.selection = [slide];
        figma.viewport.scrollAndZoomIntoView([slide]);
        
        figma.notify(`✓ Created "${layout}" slide`);
        figma.ui.postMessage({ 
          type: 'styled-slide-created', 
          success: true, 
          slideId: slide.id
        });
        
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error('Create styled slide error:', errorMsg);
        figma.notify(`Error: ${errorMsg}`, { error: true });
        figma.ui.postMessage({ type: 'styled-slide-created', success: false, error: errorMsg });
      }
    }
    
    // SPIKE: Instantiate template (clone slide + update content)
    if (msg.type === 'instantiate-template') {
      const sourceId = (msg as any).sourceId as string;
      const contentMap = (msg as any).contentMap as Record<string, string>; // slot_id -> new text
      
      if (!sourceId) {
        figma.notify('No source slide ID provided', { error: true });
        figma.ui.postMessage({ type: 'instantiated', success: false, error: 'No source ID' });
        return;
      }
      
      try {
        // Find source node
        const sourceNode = await (figma as any).getNodeByIdAsync(sourceId);
        if (!sourceNode) {
          figma.notify(`Source slide not found: ${sourceId}`, { error: true });
          figma.ui.postMessage({ type: 'instantiated', success: false, error: 'Source not found' });
          return;
        }
        
        // Clone the slide
        const clonedSlide = sourceNode.clone();
        clonedSlide.name = `${sourceNode.name} (copy)`;
        
        // If it's a slide, insert it after the source
        if ((sourceNode as any).type === 'SLIDE') {
          // For Figma Slides, we need to insert the clone properly
          const parent = sourceNode.parent;
          if (parent && 'insertChild' in parent) {
            const sourceIndex = parent.children.indexOf(sourceNode);
            (parent as any).insertChild(sourceIndex + 1, clonedSlide);
          }
        }
        
        // Load fonts we might need with fallback chain
        await loadFontWithFallback();
        
        // Update text nodes based on content map
        let updated = 0;
        const failed: string[] = [];
        
        // Build a map of old ID -> new node in clone
        // Since clone creates new IDs, we need to match by structure
        // For now, use a simpler approach: find text nodes by walking both trees in parallel
        
        async function updateTextNodes(
          original: SceneNode,
          cloned: SceneNode,
          contentMap: Record<string, string>
        ): Promise<void> {
          // If this node's original ID is in the content map, update the cloned version
          if (original.id in contentMap && cloned.type === 'TEXT') {
            const textNode = cloned as TextNode;
            const newText = contentMap[original.id];
            
            try {
              // Load ALL fonts used in this text node (handles mixed fonts too)
              const fontName = textNode.fontName;
              if (fontName === figma.mixed) {
                // Mixed fonts - need to load each segment's font
                const len = textNode.characters.length;
                for (let i = 0; i < len; i++) {
                  const segmentFont = textNode.getRangeFontName(i, i + 1);
                  if (segmentFont !== figma.mixed) {
                    await figma.loadFontAsync(segmentFont as FontName);
                  }
                }
              } else {
                // Single font
                await figma.loadFontAsync(fontName as FontName);
              }
              
              textNode.characters = newText;
              updated++;
            } catch (fontError) {
              // Font unavailable - log and skip this node
              const fontInfo = textNode.fontName !== figma.mixed 
                ? `${(textNode.fontName as FontName).family} ${(textNode.fontName as FontName).style}`
                : 'mixed fonts';
              console.warn(`Skipping text node ${original.id}: font "${fontInfo}" unavailable`);
              failed.push(`${original.id} (font: ${fontInfo})`);
            }
          }
          
          // Recurse into children
          if ('children' in original && 'children' in cloned) {
            const origChildren = (original as any).children;
            const clonedChildren = (cloned as any).children;
            
            // Walk children in parallel (clone preserves order)
            for (let i = 0; i < Math.min(origChildren.length, clonedChildren.length); i++) {
              await updateTextNodes(origChildren[i], clonedChildren[i], contentMap);
            }
          }
        }
        
        await updateTextNodes(sourceNode, clonedSlide, contentMap || {});
        
        // Select the new slide
        figma.currentPage.selection = [clonedSlide];
        figma.viewport.scrollAndZoomIntoView([clonedSlide]);
        
        figma.notify(`✓ Created new slide with ${updated} text updates`);
        figma.ui.postMessage({ 
          type: 'instantiated', 
          success: true, 
          newSlideId: clonedSlide.id,
          updated,
          failed 
        });
        
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error('Instantiate error:', errorMsg);
        figma.notify(`Error: ${errorMsg}`, { error: true });
        figma.ui.postMessage({ type: 'instantiated', success: false, error: errorMsg });
      }
    }
    
    // Delete slides by ID
    if (msg.type === 'delete-slides') {
      const slideIds = (msg as any).slideIds as string[];
      
      if (!slideIds || slideIds.length === 0) {
        figma.notify('No slide IDs provided', { error: true });
        figma.ui.postMessage({ type: 'slides-deleted', deleted: 0, failed: [], deletedNames: [] });
        return;
      }
      
      let deleted = 0;
      const failed: string[] = [];
      const deletedNames: string[] = [];
      
      for (const slideId of slideIds) {
        try {
          const node = await (figma as any).getNodeByIdAsync(slideId);
          
          if (!node) {
            console.warn(`Slide not found: ${slideId}`);
            failed.push(slideId);
            continue;
          }
          
          // Check if it's a slide
          if ((node as any).type !== 'SLIDE' && node.type !== 'FRAME') {
            console.warn(`Node ${slideId} is not a slide (type: ${node.type})`);
            failed.push(slideId);
            continue;
          }
          
          // Capture name before deleting
          const slideName = node.name || slideId;
          
          // Remove from stored mapping
          const mapping = await figma.clientStorage.getAsync(MAPPING_KEY) || {};
          for (const [irId, figmaId] of Object.entries(mapping)) {
            if (figmaId === slideId) {
              delete mapping[irId];
            }
          }
          await figma.clientStorage.setAsync(MAPPING_KEY, mapping);
          
          // Delete the node
          node.remove();
          deleted++;
          deletedNames.push(slideName);
          
          console.log(`Deleted slide: ${slideName} (${slideId})`);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error(`Failed to delete ${slideId}:`, errorMsg);
          failed.push(slideId);
        }
      }
      
      // Rich notification with names
      if (deleted > 0) {
        const nameList = deletedNames.length <= 3 
          ? deletedNames.map(n => `"${n}"`).join(', ')
          : `"${deletedNames[0]}" + ${deletedNames.length - 1} more`;
        figma.notify(`✓ Deleted: ${nameList}`);
      }
      if (failed.length > 0) {
        figma.notify(`${failed.length} slides not found`, { error: true });
      }
      
      figma.ui.postMessage({ type: 'slides-deleted', deleted, failed, deletedNames });
    }
    
    // Reorder slides
    if (msg.type === 'reorder-slides') {
      const slideIds = (msg as any).slideIds as string[];
      
      if (!slideIds || slideIds.length === 0) {
        figma.notify('No slide IDs provided', { error: true });
        figma.ui.postMessage({ type: 'slides-reordered', success: false, error: 'No slide IDs provided' });
        return;
      }
      
      try {
        // Get all slide nodes in requested order, capture before state
        const slides: SceneNode[] = [];
        const beforeOrder: string[] = [];
        const afterOrder: string[] = [];
        
        for (const slideId of slideIds) {
          const node = await (figma as any).getNodeByIdAsync(slideId);
          if (node && ((node as any).type === 'SLIDE' || node.type === 'FRAME')) {
            slides.push(node);
            afterOrder.push(node.name || slideId);
          } else {
            console.warn(`Slide not found or wrong type: ${slideId}`);
          }
        }
        
        if (slides.length === 0) {
          figma.ui.postMessage({ type: 'slides-reordered', success: false, error: 'No valid slides found' });
          return;
        }
        
        // Get the parent container (SLIDE_ROW for Figma Slides)
        const parent = slides[0].parent;
        if (!parent || !('insertChild' in parent)) {
          figma.ui.postMessage({ type: 'slides-reordered', success: false, error: 'Cannot access slide container' });
          return;
        }
        
        // Capture current order before reordering
        const currentChildren = (parent as any).children || [];
        for (const child of currentChildren) {
          if ((child as any).type === 'SLIDE' || child.type === 'FRAME') {
            beforeOrder.push(child.name || child.id);
          }
        }
        
        // Reorder by inserting each slide at its new position
        // We go in reverse order and insert at position 0, which effectively reverses the order
        // Then we reverse our input to get the correct final order
        for (let i = slides.length - 1; i >= 0; i--) {
          const slide = slides[i];
          // Remove and re-insert at the beginning
          // This pushes earlier-inserted slides forward
          (parent as any).insertChild(0, slide);
        }
        
        // Show what moved
        const movedSlides: string[] = [];
        for (let i = 0; i < Math.min(beforeOrder.length, afterOrder.length); i++) {
          if (beforeOrder[i] !== afterOrder[i]) {
            movedSlides.push(afterOrder[i]);
          }
        }
        
        if (movedSlides.length > 0) {
          const moveList = movedSlides.length <= 2
            ? movedSlides.map(n => `"${n}"`).join(', ')
            : `${movedSlides.length} slides`;
          figma.notify(`✓ Reordered: ${moveList} moved`);
        } else {
          figma.notify(`✓ Order unchanged (${slides.length} slides)`);
        }
        
        figma.ui.postMessage({ 
          type: 'slides-reordered', 
          success: true, 
          count: slides.length,
          beforeOrder,
          afterOrder 
        });
        
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error('Reorder error:', errorMsg);
        figma.notify(`Error: ${errorMsg}`, { error: true });
        figma.ui.postMessage({ type: 'slides-reordered', success: false, error: errorMsg });
      }
    }
    
    if (msg.type === 'close') {
      figma.closePlugin();
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Plugin error:', errorMsg);
    figma.notify(`Error: ${errorMsg}`, { error: true });
  }
};

console.log(`Monorail loaded. Editor: ${figma.editorType}`);
