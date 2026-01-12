// Monorail Figma Plugin
// Converts IR (deck spec) into Figma Slides

// Import shared types (type-only imports are erased at compile time by esbuild)
import type { SlideContent, Slide, DeckIR, ElementInfo } from '../shared/types';

// Show the UI
figma.showUI(__html__, { width: 320, height: 280 });

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

const FONT_FALLBACKS = ['Supply', 'Inter', 'SF Pro Display', 'Helvetica Neue', 'Arial'];

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

        // Auto Layout container for text (vertically centered)
        const titleContainer = createAutoLayoutFrame(
          parent,
          'title-container',
          200,
          380,       // roughly vertically centered
          'VERTICAL',
          24         // spacing between headline and subline
        );
        if (c.headline) await addAutoLayoutText(titleContainer, c.headline, 96, true, COLORS.headline, 1520, 'headline');
        if (c.subline) await addAutoLayoutText(titleContainer, c.subline, 36, false, COLORS.muted, 1520, 'subline');
      }
      break;

    case 'section':
      {
        // Auto Layout container for section headline (vertically centered)
        const sectionContainer = createAutoLayoutFrame(
          parent,
          'section-container',
          200,
          450,       // vertically centered
          'VERTICAL',
          24         // spacing if we add subline later
        );
        if (c.headline) await addAutoLayoutText(sectionContainer, c.headline, 72, true, COLORS.headline, 1520, 'headline');
      }
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
      {
        // Use Auto Layout so content flows properly regardless of text length
        const twoColContainer = createAutoLayoutFrame(
          parent,
          'two-column-container',
          200,       // x position (left margin)
          150,       // y position
          'VERTICAL',
          48         // spacing between headline and columns
        );
        
        if (c.headline) await addAutoLayoutText(twoColContainer, c.headline, 56, true, COLORS.headline, 1520, 'headline');
        
        // Create horizontal container for the two columns
        const columnsContainer = createAutoLayoutFrame(
          twoColContainer,
          'columns-container',
          0, 0,      // position handled by parent Auto Layout
          'HORIZONTAL',
          40         // gap between columns
        );
        
        // Left column (vertical stack of title + body)
        if (c.left) {
          const leftColumn = createAutoLayoutFrame(
            columnsContainer,
            'left-column',
            0, 0,
            'VERTICAL',
            16         // spacing between title and body
          );
          // Set fixed width so columns don't overlap
          leftColumn.counterAxisSizingMode = 'FIXED';
          leftColumn.resize(740, leftColumn.height);
          
          await addAutoLayoutText(leftColumn, c.left.title, 36, true, COLORS.accent, 740, 'left-title');
          await addAutoLayoutText(leftColumn, c.left.body, 28, false, COLORS.body, 740, 'left-body');
        }
        
        // Right column (vertical stack of title + body)
        if (c.right) {
          const rightColumn = createAutoLayoutFrame(
            columnsContainer,
            'right-column',
            0, 0,
            'VERTICAL',
            16         // spacing between title and body
          );
          // Set fixed width so columns don't overlap
          rightColumn.counterAxisSizingMode = 'FIXED';
          rightColumn.resize(740, rightColumn.height);
          
          await addAutoLayoutText(rightColumn, c.right.title, 36, true, COLORS.headline, 740, 'right-title');
          await addAutoLayoutText(rightColumn, c.right.body, 28, false, COLORS.body, 740, 'right-body');
        }
      }
      break;
      
    case 'quote':
      {
        // Auto Layout container for quote text (vertically centered)
        const quoteContainer = createAutoLayoutFrame(
          parent,
          'quote-container',
          200,
          350,       // roughly vertically centered
          'VERTICAL',
          40         // spacing between quote and attribution
        );
        if (c.quote) await addAutoLayoutText(quoteContainer, `"${c.quote}"`, 48, true, COLORS.white, 1520, 'quote');
        if (c.attribution) await addAutoLayoutText(quoteContainer, `— ${c.attribution}`, 28, false, COLORS.muted, 1520, 'attribution');
      }
      break;

    case 'summary':
      {
        // Auto Layout container for headline and items
        const summaryContainer = createAutoLayoutFrame(
          parent,
          'summary-container',
          200,
          180,       // near top
          'VERTICAL',
          48         // spacing between headline and items
        );
        if (c.headline) await addAutoLayoutText(summaryContainer, c.headline, 72, true, COLORS.headline, 1520, 'headline');
        
        if (c.items) {
          // Nested container for items with tighter spacing
          const itemsContainer = createAutoLayoutFrame(
            summaryContainer,
            'items-container',
            0, 0,      // position handled by parent Auto Layout
            'VERTICAL',
            24         // spacing between items
          );
          for (let i = 0; i < c.items.length; i++) {
            await addAutoLayoutText(itemsContainer, c.items[i], 36, false, COLORS.body, 1520, `item-${i}`);
          }
        }
      }
      break;
      
    case 'chart':
      if (c.headline) await addText(parent, c.headline, 200, 150, 56, true, COLORS.headline, undefined, 'headline');
      addRect(parent, 200, 280, 1520, 500, { r: 0.1, g: 0.1, b: 0.13 }, COLORS.dimmed, true);
      await addText(parent, `[Chart: ${c.chart?.type || 'data'}]`, 860, 500, 28, false, COLORS.muted, undefined, 'chart-placeholder');
      if (c.takeaway) await addText(parent, c.takeaway, 200, 820, 28, false, COLORS.muted, undefined, 'takeaway');
      break;

    case 'video':
      {
        // Auto Layout container for video slide
        const videoContainer = createAutoLayoutFrame(
          parent,
          'video-container',
          200,
          150,
          'VERTICAL',
          32         // spacing between elements
        );

        if (c.headline) await addAutoLayoutText(videoContainer, c.headline, 56, true, COLORS.headline, 1520, 'headline');

        // Video placeholder frame (16:9 aspect ratio)
        const placeholderFrame = figma.createFrame();
        placeholderFrame.name = 'video-placeholder';
        placeholderFrame.resize(1200, 675);  // 16:9 ratio
        placeholderFrame.fills = [{ type: 'SOLID', color: { r: 0.08, g: 0.08, b: 0.1 } }];
        placeholderFrame.strokes = [{ type: 'SOLID', color: COLORS.dimmed }];
        placeholderFrame.strokeWeight = 2;
        placeholderFrame.cornerRadius = 8;
        videoContainer.appendChild(placeholderFrame);

        // Play button icon (triangle in circle)
        const playCircle = figma.createEllipse();
        playCircle.name = 'play-circle';
        playCircle.resize(100, 100);
        playCircle.x = 550;  // center in placeholder
        playCircle.y = 287;
        playCircle.fills = [{ type: 'SOLID', color: COLORS.white, opacity: 0.9 }];
        placeholderFrame.appendChild(playCircle);

        // Play triangle (pointing right)
        const playTriangle = figma.createPolygon();
        playTriangle.name = 'play-triangle';
        playTriangle.pointCount = 3;
        playTriangle.resize(36, 36);
        playTriangle.rotation = -90;  // point right (clockwise from up)
        // Positioned for optical centering within circle (manually tuned)
        playTriangle.x = 600;
        playTriangle.y = 320;
        playTriangle.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.15 } }];
        placeholderFrame.appendChild(playTriangle);

        // URL text below placeholder
        if (c.video_url) {
          await addAutoLayoutText(videoContainer, c.video_url, 20, false, COLORS.blue, 1520, 'video-url');
        }

        // Optional caption
        if (c.caption) {
          await addAutoLayoutText(videoContainer, c.caption, 24, false, COLORS.muted, 1520, 'caption');
        }
      }
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

  // Handle visual elements - works with any archetype
  if (c.visual) {
    const parentWidth = (parent as FrameNode).width || 1920;
    const parentHeight = (parent as FrameNode).height || 1080;
    const position = c.visual.position || 'right';
    
    // Smart defaults based on position - diagrams should be prominent
    let defaultWidth: number;
    let defaultHeight: number;
    switch (position) {
      case 'right':
        // Right side: ~60% of slide height, square
        defaultWidth = Math.round(parentHeight * 0.65);
        defaultHeight = Math.round(parentHeight * 0.65);
        break;
      case 'center':
        // Center: dominant, ~70% of slide height
        defaultWidth = Math.round(parentHeight * 0.7);
        defaultHeight = Math.round(parentHeight * 0.7);
        break;
      case 'below':
        // Below: wider, shorter
        defaultWidth = Math.round(parentWidth * 0.4);
        defaultHeight = Math.round(parentHeight * 0.35);
        break;
      default:
        defaultWidth = 600;
        defaultHeight = 600;
    }
    
    const visualWidth = c.visual.width || defaultWidth;
    const visualHeight = c.visual.height || defaultHeight;

    // Calculate position
    let visualX = 0;
    let visualY = 0;
    switch (position) {
      case 'right':
        visualX = parentWidth - visualWidth - 100;
        visualY = (parentHeight - visualHeight) / 2;
        break;
      case 'below':
        visualX = (parentWidth - visualWidth) / 2;
        visualY = parentHeight - visualHeight - 100;
        break;
      case 'center':
        visualX = (parentWidth - visualWidth) / 2;
        visualY = (parentHeight - visualHeight) / 2;
        break;
    }

    if (c.visual.type === 'svg' && c.visual.content) {
      // SVG rendering
      try {
        const svgNode = figma.createNodeFromSvg(c.visual.content);
        svgNode.name = 'visual';
        
        const scaleX = visualWidth / svgNode.width;
        const scaleY = visualHeight / svgNode.height;
        const scale = Math.min(scaleX, scaleY);
        svgNode.resize(svgNode.width * scale, svgNode.height * scale);
        svgNode.x = visualX;
        svgNode.y = visualY;
        
        parent.appendChild(svgNode);
      } catch (e) {
        console.error('Failed to render SVG:', e);
      }
    } else if (c.visual.type === 'cycle' && c.visual.nodes && c.visual.nodes.length > 0) {
      // Native Figma cycle diagram
      await renderCycleDiagram(parent, c.visual.nodes, c.visual.colors || [], c.visual.icons || [], visualX, visualY, visualWidth, visualHeight);
    }
  }
}

// Color mapping for diagram nodes
const DIAGRAM_COLORS: Record<string, RGB> = {
  cyan: { r: 0, g: 0.74, b: 0.84 },
  green: { r: 0.3, g: 0.69, b: 0.31 },
  orange: { r: 1, g: 0.6, b: 0 },
  pink: { r: 0.91, g: 0.12, b: 0.39 },
  purple: { r: 0.61, g: 0.15, b: 0.69 },
  blue: { r: 0.13, g: 0.59, b: 0.95 },
  white: { r: 1, g: 1, b: 1 },
};

// Render an icon inside a circle using native Figma shapes
// Simple geometric representations that are guaranteed to work
function renderIcon(
  container: FrameNode,
  iconName: string,
  centerX: number,
  centerY: number,
  size: number,
  color: RGB
): void {
  const halfSize = size / 2;
  
  switch (iconName) {
    case 'presence': {
      // Person: circle head + rounded rectangle body
      const head = figma.createEllipse();
      head.name = 'icon-presence-head';
      head.resize(size * 0.4, size * 0.4);
      head.x = centerX - size * 0.2;
      head.y = centerY - halfSize;
      head.fills = [{ type: 'SOLID', color }];
      container.appendChild(head);
      
      const body = figma.createEllipse();
      body.name = 'icon-presence-body';
      body.resize(size * 0.7, size * 0.5);
      body.x = centerX - size * 0.35;
      body.y = centerY;
      body.fills = [{ type: 'SOLID', color }];
      container.appendChild(body);
      break;
    }
    
    case 'lightbulb': {
      // Lightbulb: circle + small rectangle base
      const bulb = figma.createEllipse();
      bulb.name = 'icon-lightbulb-bulb';
      bulb.resize(size * 0.7, size * 0.7);
      bulb.x = centerX - size * 0.35;
      bulb.y = centerY - halfSize;
      bulb.fills = [{ type: 'SOLID', color }];
      container.appendChild(bulb);
      
      const base = figma.createRectangle();
      base.name = 'icon-lightbulb-base';
      base.resize(size * 0.35, size * 0.25);
      base.x = centerX - size * 0.175;
      base.y = centerY + size * 0.15;
      base.fills = [{ type: 'SOLID', color }];
      base.cornerRadius = 2;
      container.appendChild(base);
      break;
    }
    
    case 'refresh': {
      // Refresh: two curved arrows (simplified as arc segments)
      const arc1 = figma.createEllipse();
      arc1.name = 'icon-refresh-arc';
      arc1.resize(size * 0.8, size * 0.8);
      arc1.x = centerX - size * 0.4;
      arc1.y = centerY - size * 0.4;
      arc1.fills = [];
      arc1.strokes = [{ type: 'SOLID', color }];
      arc1.strokeWeight = size * 0.12;
      arc1.arcData = { startingAngle: 0, endingAngle: 4.7, innerRadius: 0.7 };
      container.appendChild(arc1);
      
      // Arrow head (small triangle)
      const arrow = figma.createPolygon();
      arrow.name = 'icon-refresh-arrow';
      arrow.resize(size * 0.25, size * 0.25);
      arrow.x = centerX + size * 0.25;
      arrow.y = centerY - size * 0.5;
      arrow.fills = [{ type: 'SOLID', color }];
      arrow.rotation = 90;
      container.appendChild(arrow);
      break;
    }
    
    case 'chart': {
      // Chart: upward trending line with bars
      const bar1 = figma.createRectangle();
      bar1.name = 'icon-chart-bar1';
      bar1.resize(size * 0.2, size * 0.3);
      bar1.x = centerX - size * 0.4;
      bar1.y = centerY + size * 0.1;
      bar1.fills = [{ type: 'SOLID', color }];
      container.appendChild(bar1);
      
      const bar2 = figma.createRectangle();
      bar2.name = 'icon-chart-bar2';
      bar2.resize(size * 0.2, size * 0.5);
      bar2.x = centerX - size * 0.1;
      bar2.y = centerY - size * 0.1;
      bar2.fills = [{ type: 'SOLID', color }];
      container.appendChild(bar2);
      
      const bar3 = figma.createRectangle();
      bar3.name = 'icon-chart-bar3';
      bar3.resize(size * 0.2, size * 0.8);
      bar3.x = centerX + size * 0.2;
      bar3.y = centerY - size * 0.4;
      bar3.fills = [{ type: 'SOLID', color }];
      container.appendChild(bar3);
      break;
    }
    
    case 'magnet': {
      // Magnet: U-shape using rectangles
      const left = figma.createRectangle();
      left.name = 'icon-magnet-left';
      left.resize(size * 0.25, size * 0.7);
      left.x = centerX - size * 0.4;
      left.y = centerY - size * 0.35;
      left.fills = [{ type: 'SOLID', color }];
      container.appendChild(left);
      
      const right = figma.createRectangle();
      right.name = 'icon-magnet-right';
      right.resize(size * 0.25, size * 0.7);
      right.x = centerX + size * 0.15;
      right.y = centerY - size * 0.35;
      right.fills = [{ type: 'SOLID', color }];
      container.appendChild(right);
      
      const bottom = figma.createRectangle();
      bottom.name = 'icon-magnet-bottom';
      bottom.resize(size * 0.8, size * 0.25);
      bottom.x = centerX - size * 0.4;
      bottom.y = centerY + size * 0.1;
      bottom.fills = [{ type: 'SOLID', color }];
      bottom.cornerRadius = size * 0.1;
      container.appendChild(bottom);
      break;
    }
    
    case 'rocket': {
      // Rocket: pointed oval + fins
      const body = figma.createEllipse();
      body.name = 'icon-rocket-body';
      body.resize(size * 0.35, size * 0.8);
      body.x = centerX - size * 0.175;
      body.y = centerY - size * 0.4;
      body.fills = [{ type: 'SOLID', color }];
      body.rotation = 0;
      container.appendChild(body);
      
      const fin = figma.createPolygon();
      fin.name = 'icon-rocket-fin';
      fin.resize(size * 0.5, size * 0.3);
      fin.x = centerX - size * 0.25;
      fin.y = centerY + size * 0.2;
      fin.fills = [{ type: 'SOLID', color }];
      container.appendChild(fin);
      break;
    }
    
    case 'target': {
      // Target: concentric circles
      const outer = figma.createEllipse();
      outer.name = 'icon-target-outer';
      outer.resize(size * 0.9, size * 0.9);
      outer.x = centerX - size * 0.45;
      outer.y = centerY - size * 0.45;
      outer.fills = [];
      outer.strokes = [{ type: 'SOLID', color }];
      outer.strokeWeight = size * 0.08;
      container.appendChild(outer);
      
      const middle = figma.createEllipse();
      middle.name = 'icon-target-middle';
      middle.resize(size * 0.5, size * 0.5);
      middle.x = centerX - size * 0.25;
      middle.y = centerY - size * 0.25;
      middle.fills = [];
      middle.strokes = [{ type: 'SOLID', color }];
      middle.strokeWeight = size * 0.08;
      container.appendChild(middle);
      
      const center = figma.createEllipse();
      center.name = 'icon-target-center';
      center.resize(size * 0.2, size * 0.2);
      center.x = centerX - size * 0.1;
      center.y = centerY - size * 0.1;
      center.fills = [{ type: 'SOLID', color }];
      container.appendChild(center);
      break;
    }
    
    case 'users': {
      // Users: two overlapping person icons
      // Person 1 (back)
      const head1 = figma.createEllipse();
      head1.name = 'icon-users-head1';
      head1.resize(size * 0.3, size * 0.3);
      head1.x = centerX - size * 0.35;
      head1.y = centerY - size * 0.4;
      head1.fills = [{ type: 'SOLID', color: { r: color.r * 0.7, g: color.g * 0.7, b: color.b * 0.7 } }];
      container.appendChild(head1);
      
      const body1 = figma.createEllipse();
      body1.name = 'icon-users-body1';
      body1.resize(size * 0.4, size * 0.35);
      body1.x = centerX - size * 0.4;
      body1.y = centerY - size * 0.05;
      body1.fills = [{ type: 'SOLID', color: { r: color.r * 0.7, g: color.g * 0.7, b: color.b * 0.7 } }];
      container.appendChild(body1);
      
      // Person 2 (front)
      const head2 = figma.createEllipse();
      head2.name = 'icon-users-head2';
      head2.resize(size * 0.35, size * 0.35);
      head2.x = centerX + size * 0.05;
      head2.y = centerY - size * 0.45;
      head2.fills = [{ type: 'SOLID', color }];
      container.appendChild(head2);
      
      const body2 = figma.createEllipse();
      body2.name = 'icon-users-body2';
      body2.resize(size * 0.5, size * 0.4);
      body2.x = centerX;
      body2.y = centerY;
      body2.fills = [{ type: 'SOLID', color }];
      container.appendChild(body2);
      break;
    }
    
    case 'check': {
      // Checkmark: two rectangles at an angle
      const line1 = figma.createRectangle();
      line1.name = 'icon-check-1';
      line1.resize(size * 0.15, size * 0.5);
      line1.x = centerX - size * 0.25;
      line1.y = centerY - size * 0.1;
      line1.fills = [{ type: 'SOLID', color }];
      line1.rotation = -45;
      container.appendChild(line1);
      
      const line2 = figma.createRectangle();
      line2.name = 'icon-check-2';
      line2.resize(size * 0.15, size * 0.8);
      line2.x = centerX + size * 0.1;
      line2.y = centerY - size * 0.35;
      line2.fills = [{ type: 'SOLID', color }];
      line2.rotation = 45;
      container.appendChild(line2);
      break;
    }
    
    case 'star': {
      // Star: use Figma's star shape
      const star = figma.createStar();
      star.name = 'icon-star';
      star.resize(size * 0.9, size * 0.9);
      star.x = centerX - size * 0.45;
      star.y = centerY - size * 0.45;
      star.fills = [{ type: 'SOLID', color }];
      star.pointCount = 5;
      star.innerRadius = 0.4;
      container.appendChild(star);
      break;
    }
    
    default:
      // Fallback: simple filled circle
      const fallback = figma.createEllipse();
      fallback.name = `icon-${iconName}`;
      fallback.resize(size * 0.5, size * 0.5);
      fallback.x = centerX - size * 0.25;
      fallback.y = centerY - size * 0.25;
      fallback.fills = [{ type: 'SOLID', color }];
      container.appendChild(fallback);
  }
}

// Render a cycle diagram using native Figma shapes
async function renderCycleDiagram(
  parent: SceneNode & ChildrenMixin,
  nodes: string[],
  colors: string[],
  icons: string[],
  x: number,
  y: number,
  width: number,
  height: number
): Promise<void> {
  const container = figma.createFrame();
  container.name = 'visual';
  container.resize(width, height);
  container.x = x;
  container.y = y;
  container.fills = [];  // Transparent background
  container.clipsContent = false;
  
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.35;  // Circle radius for node placement
  const nodeRadius = 45;  // Size of each node circle
  const n = nodes.length;
  
  // Calculate node positions (arranged in a circle, starting from top)
  const nodePositions: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < n; i++) {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;  // Start from top (-90°)
    nodePositions.push({
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    });
  }
  
  // Draw connecting arcs first (so they're behind nodes)
  for (let i = 0; i < n; i++) {
    const from = nodePositions[i];
    const to = nodePositions[(i + 1) % n];
    const color = DIAGRAM_COLORS[colors[i] || 'white'] || DIAGRAM_COLORS.white;
    
    // Create a curved line using a vector
    const line = figma.createVector();
    line.name = `connector-${i}`;
    
    // Calculate control point for curve (offset toward center)
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    const toCenterX = centerX - midX;
    const toCenterY = centerY - midY;
    const dist = Math.sqrt(toCenterX * toCenterX + toCenterY * toCenterY);
    const curveOffset = 30;  // How much the curve bends inward
    const ctrlX = midX + (toCenterX / dist) * curveOffset;
    const ctrlY = midY + (toCenterY / dist) * curveOffset;
    
    // Offset start/end points to edge of circles
    const startAngle = Math.atan2(to.y - from.y, to.x - from.x);
    const endAngle = Math.atan2(from.y - to.y, from.x - to.x);
    const startX = from.x + nodeRadius * Math.cos(startAngle);
    const startY = from.y + nodeRadius * Math.sin(startAngle);
    const endX = to.x + nodeRadius * Math.cos(endAngle);
    const endY = to.y + nodeRadius * Math.sin(endAngle);
    
    // Create quadratic bezier path
    line.vectorPaths = [{
      windingRule: 'NONZERO',
      data: `M ${startX} ${startY} Q ${ctrlX} ${ctrlY} ${endX} ${endY}`,
    }];

    line.strokes = [{ type: 'SOLID', color }];
    line.strokeWeight = 3;
    line.strokeCap = 'ROUND';

    container.appendChild(line);

    // Add arrowhead at the end
    // Arrow direction: tangent at end of bezier (from control point to end)
    const arrowAngle = Math.atan2(endY - ctrlY, endX - ctrlX);
    const arrowSize = 12;  // Size of arrowhead
    
    // Triangle points for arrowhead
    const tipX = endX;
    const tipY = endY;
    const leftX = tipX - arrowSize * Math.cos(arrowAngle - Math.PI / 6);
    const leftY = tipY - arrowSize * Math.sin(arrowAngle - Math.PI / 6);
    const rightX = tipX - arrowSize * Math.cos(arrowAngle + Math.PI / 6);
    const rightY = tipY - arrowSize * Math.sin(arrowAngle + Math.PI / 6);

    const arrow = figma.createVector();
    arrow.name = `arrow-${i}`;
    arrow.vectorPaths = [{
      windingRule: 'NONZERO',
      data: `M ${tipX} ${tipY} L ${leftX} ${leftY} L ${rightX} ${rightY} Z`,
    }];
    arrow.fills = [{ type: 'SOLID', color }];
    arrow.strokes = [];

    container.appendChild(arrow);
  }
  
  // Draw nodes
  for (let i = 0; i < n; i++) {
    const pos = nodePositions[i];
    const label = nodes[i];
    const color = DIAGRAM_COLORS[colors[i] || 'white'] || DIAGRAM_COLORS.white;
    const iconName = icons[i];
    
    // Create circle
    const circle = figma.createEllipse();
    circle.name = `node-${i}`;
    circle.resize(nodeRadius * 2, nodeRadius * 2);
    circle.x = pos.x - nodeRadius;
    circle.y = pos.y - nodeRadius;
    circle.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.12 } }];  // Dark fill
    circle.strokes = [{ type: 'SOLID', color }];
    circle.strokeWeight = 3;
    
    container.appendChild(circle);
    
    // Render icon inside circle if specified
    if (iconName) {
      const iconSize = nodeRadius * 1.1;  // Icon slightly smaller than circle radius
      renderIcon(container, iconName, pos.x, pos.y, iconSize, color);
    }
    
    // Create label below the circle
    const text = figma.createText();
    text.name = `label-${i}`;
    
    // Load font
    const loadedFont = await loadFontWithFallback();
    text.fontName = loadedFont.bold;
    text.fontSize = 32;  // Bold labels for visual weight
    text.characters = label;
    text.fills = [{ type: 'SOLID', color }];
    text.textAlignHorizontal = 'CENTER';
    
    // Position label below circle
    text.x = pos.x - text.width / 2;
    text.y = pos.y + nodeRadius + 8;
    
    container.appendChild(text);
  }
  
  parent.appendChild(container);
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

    case 'video':
      await updateNamed('headline', c.headline);
      await updateNamed('video-url', c.video_url);
      await updateNamed('caption', c.caption);
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

  // Check for Auto Layout containers (new style)
  if (frameNames.has('bullets-container')) return 'bullets';
  if (frameNames.has('two-column-container')) return 'two-column';

  // Check for archetype-specific node names
  if (names.has('quote') && names.has('attribution')) return 'quote';
  // Legacy two-column detection (old style without container)
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
  // Table properties (TABLE nodes only)
  numRows?: number;
  numColumns?: number;
  tableCells?: { row: number; col: number; text: string }[];
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
  
  // TABLE properties (Figma Slides tables)
  if (node.type === 'TABLE') {
    const tableNode = node as TableNode;
    captured.numRows = tableNode.numRows;
    captured.numColumns = tableNode.numColumns;
    
    // Extract cell contents as 2D array
    const cells: { row: number; col: number; text: string }[] = [];
    for (let row = 0; row < tableNode.numRows; row++) {
      for (let col = 0; col < tableNode.numColumns; col++) {
        const cell = tableNode.cellAt(row, col);
        if (cell && cell.text) {
          cells.push({
            row,
            col,
            text: cell.text.characters || '',
          });
        }
      }
    }
    captured.tableCells = cells;
    console.log(`[TABLE] Captured ${tableNode.numRows}x${tableNode.numColumns} table with ${cells.length} cells`);
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

// ElementInfo imported from shared/types.ts

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

// Recursively find ALL text nodes in a node tree (including TABLE cells)
function getAllTextNodes(
  node: SceneNode,
  results: { node: TextNode; depth: number; parentName: string; absoluteX: number; absoluteY: number; isTableCell?: boolean; tableRow?: number; tableCol?: number }[] = [],
  depth: number = 0,
  parentName: string = '',
  offsetX: number = 0,
  offsetY: number = 0
): { node: TextNode; depth: number; parentName: string; absoluteX: number; absoluteY: number; isTableCell?: boolean; tableRow?: number; tableCol?: number }[] {
  
  if (node.type === 'TEXT') {
    results.push({
      node: node as TextNode,
      depth,
      parentName,
      absoluteX: node.x + offsetX,
      absoluteY: node.y + offsetY,
    });
  } else if (node.type === 'TABLE') {
    // Handle Figma Slides TABLE nodes
    const tableNode = node as TableNode;
    const tableX = node.x + offsetX;
    const tableY = node.y + offsetY;
    
    console.log(`[TABLE] Found ${tableNode.numRows}x${tableNode.numColumns} table "${node.name}"`);
    
    for (let row = 0; row < tableNode.numRows; row++) {
      for (let col = 0; col < tableNode.numColumns; col++) {
        const cell = tableNode.cellAt(row, col);
        if (cell && cell.text && cell.text.characters) {
          // TextSublayerNode is similar to TextNode - cast it for our purposes
          // We add table metadata so downstream code knows this came from a table
          results.push({
            node: cell.text as unknown as TextNode,
            depth: depth + 1,
            parentName: `${node.name || 'Table'}[${row},${col}]`,
            absoluteX: tableX, // Approximate - cells don't expose individual positions easily
            absoluteY: tableY + (row * 40), // Rough estimate based on row
            isTableCell: true,
            tableRow: row,
            tableCol: col,
          });
        }
      }
    }
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
  textInfos: { node: TextNode; depth: number; parentName: string; absoluteX: number; absoluteY: number; isTableCell?: boolean; tableRow?: number; tableCol?: number }[]
): ElementInfo[] {
  return textInfos.map(info => {
    const { node, depth, parentName, absoluteX, absoluteY, isTableCell, tableRow, tableCol } = info;
    const fontSize = typeof node.fontSize === 'number' ? node.fontSize : 24;
    const isBold = node.fontName !== figma.mixed && (node.fontName as FontName).style.includes('Bold');

    // Table cells get special type classification
    const elementType = isTableCell 
      ? 'table_cell' 
      : classifyElement(node.characters, fontSize, isBold, absoluteX, absoluteY, depth, parentName);

    const result: ElementInfo = {
      id: node.id,
      type: elementType,
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

    // Add table cell metadata if present
    if (isTableCell) {
      result.isTableCell = true;
      result.tableRow = tableRow;
      result.tableCol = tableCol;
    }

    return result;
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
    
    // TITLE: Has title-container or gradient background
    if (frameNames.has('title-container') || frameNames.has('title-gradient-bg') || children.some((n: any) => n.name === 'title-gradient-bg')) {
      const container = frameNodes.find(f => f.name === 'title-container');
      const containerTexts = container ? getRecursiveTextNodes(container) : directTextNodes;
      const headline = containerTexts.find(t => t.name === 'headline');
      const subline = containerTexts.find(t => t.name === 'subline');

      return {
        archetype: 'title',
        content: {
          headline: headline?.characters || '',
          subline: subline?.characters,
        }
      };
    }

    // SECTION: Has section-container frame
    if (frameNames.has('section-container')) {
      const container = frameNodes.find(f => f.name === 'section-container');
      const containerTexts = container ? getRecursiveTextNodes(container) : [];
      const headline = containerTexts.find(t => t.name === 'headline');

      return {
        archetype: 'section',
        content: {
          headline: headline?.characters || '',
        }
      };
    }

    // QUOTE: Has quote-container frame
    if (frameNames.has('quote-container')) {
      const container = frameNodes.find(f => f.name === 'quote-container');
      const containerTexts = container ? getRecursiveTextNodes(container) : [];
      const quote = containerTexts.find(t => t.name === 'quote');
      const attribution = containerTexts.find(t => t.name === 'attribution');

      return {
        archetype: 'quote',
        content: {
          quote: quote?.characters.replace(/^[""]|[""]$/g, '') || '',
          attribution: attribution?.characters.replace(/^[—-]\s*/, '') || '',
        }
      };
    }

    // SUMMARY: Has summary-container frame
    if (frameNames.has('summary-container')) {
      const container = frameNodes.find(f => f.name === 'summary-container');
      const containerTexts = container ? getRecursiveTextNodes(container) : [];
      const headline = containerTexts.find(t => t.name === 'headline');
      const items = containerTexts.filter(t => t.name.startsWith('item-'));
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

    // VIDEO: Has video-container frame
    if (frameNames.has('video-container')) {
      const container = frameNodes.find(f => f.name === 'video-container');
      const containerTexts = container ? getRecursiveTextNodes(container) : [];
      const headline = containerTexts.find(t => t.name === 'headline');
      const videoUrl = containerTexts.find(t => t.name === 'video-url');
      const caption = containerTexts.find(t => t.name === 'caption');

      return {
        archetype: 'video',
        content: {
          headline: headline?.characters || '',
          video_url: videoUrl?.characters || '',
          caption: caption?.characters,
        }
      };
    }
    
    // TWO-COLUMN: Check for two-column-container frame (new Auto Layout style)
    if (frameNames.has('two-column-container')) {
      const container = frameNodes.find(f => f.name === 'two-column-container');
      const allTexts = container ? getRecursiveTextNodes(container) : [];
      const headline = allTexts.find(t => t.name === 'headline');
      const leftTitle = allTexts.find(t => t.name === 'left-title');
      const leftBody = allTexts.find(t => t.name === 'left-body');
      const rightTitle = allTexts.find(t => t.name === 'right-title');
      const rightBody = allTexts.find(t => t.name === 'right-body');
      
      return {
        archetype: 'two-column',
        content: {
          headline: headline?.characters || '',
          left: { title: leftTitle?.characters || '', body: leftBody?.characters || '' },
          right: { title: rightTitle?.characters || '', body: rightBody?.characters || '' },
        }
      };
    }
    
    // TWO-COLUMN (legacy): Has left-title or right-title as direct children
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

async function applyPatches(patches: PatchRequest): Promise<{ updated: number; failed: string[]; fontSubstitutions: string[] }> {
  let updated = 0;
  const failed: string[] = [];
  const fontSubstitutions: string[] = [];
  
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
      
      // Try to load the existing font, fall back if unavailable
      const fontName = textNode.fontName;
      let fontLoaded = false;
      
      if (fontName !== figma.mixed) {
        try {
          await figma.loadFontAsync(fontName as FontName);
          fontLoaded = true;
        } catch {
          // Original font unavailable, try fallbacks
          const originalFontInfo = `${(fontName as FontName).family} ${(fontName as FontName).style}`;
          const wasBold = (fontName as FontName).style.includes('Bold');
          
          for (const fallbackFamily of FONT_FALLBACKS) {
            try {
              const fallbackFont: FontName = { family: fallbackFamily, style: wasBold ? 'Bold' : 'Regular' };
              await figma.loadFontAsync(fallbackFont);
              textNode.fontName = fallbackFont;
              fontLoaded = true;
              fontSubstitutions.push(`${originalFontInfo} → ${fallbackFamily}`);
              console.log(`Font fallback for ${patch.target}: ${originalFontInfo} → ${fallbackFamily}`);
              break;
            } catch {
              continue;
            }
          }
        }
      } else {
        // Mixed fonts - load fallback and apply uniformly
        const fallbackFont = await getFontName(false);
        textNode.fontName = fallbackFont;
        fontLoaded = true;
        fontSubstitutions.push(`mixed → ${fallbackFont.family}`);
      }
      
      if (!fontLoaded) {
        console.warn(`No fonts available for ${patch.target}`);
        failed.push(patch.target);
        continue;
      }
      
      // Update text content only (preserves position, size, color)
      textNode.characters = patch.text;
      updated++;
      
      console.log(`Patched ${patch.target}: "${patch.text.substring(0, 30)}..."`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to patch ${patch.target}:`, errorMsg);
      failed.push(patch.target);
    }
  }
  
  return { updated, failed, fontSubstitutions };
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
        figma.ui.postMessage({ type: 'patched', updated: 0, failed: [], fontSubstitutions: [] });
        return;
      }
      
      const result = await applyPatches(msg.patches);
      
      // Build notification message
      let notifyMsg = result.failed.length > 0
        ? `Patched ${result.updated} elements (${result.failed.length} failed)`
        : `✓ Patched ${result.updated} elements`;
      
      if (result.fontSubstitutions.length > 0) {
        const uniqueSubs = [...new Set(result.fontSubstitutions)];
        notifyMsg += ` (${uniqueSubs.length} font sub${uniqueSubs.length > 1 ? 's' : ''})`;
      }
      
      figma.notify(notifyMsg, { error: result.failed.length > 0 });
      figma.ui.postMessage({ type: 'patched', ...result });
    }
    
    // SPIKE: Export full template structure
    if (msg.type === 'capture-template') {
      // Get target node: by ID, by selection, or first slide
      let targetNode: SceneNode | null = null;
      const requestedSlideId = (msg as any).slideId as string | undefined;
      
      if (requestedSlideId) {
        // Capture specific slide by ID (no selection needed)
        targetNode = await (figma as any).getNodeByIdAsync(requestedSlideId);
        if (!targetNode) {
          figma.notify(`Slide not found: ${requestedSlideId}`, { error: true });
          figma.ui.postMessage({ type: 'template-captured', error: `Slide not found: ${requestedSlideId}` });
          return;
        }
      } else if (figma.currentPage.selection.length > 0) {
        targetNode = figma.currentPage.selection[0];
      } else {
        // Find first slide as fallback
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
        figma.ui.postMessage({ type: 'template-captured', error: 'No slide selected or found' });
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
        const fontSubstitutions: string[] = [];  // Track when we use fallback fonts
        
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
                // Single font - try to load it
                await figma.loadFontAsync(fontName as FontName);
              }
              
              textNode.characters = newText;
              updated++;
            } catch (fontError) {
              // Original font unavailable - try fallback fonts
              const originalFontInfo = textNode.fontName !== figma.mixed 
                ? `${(textNode.fontName as FontName).family} ${(textNode.fontName as FontName).style}`
                : 'mixed fonts';
              
              // Try each fallback font
              let fallbackSucceeded = false;
              for (const fallbackFamily of FONT_FALLBACKS) {
                try {
                  // Determine if original was bold
                  const wasBold = textNode.fontName !== figma.mixed && 
                    (textNode.fontName as FontName).style.includes('Bold');
                  const fallbackStyle = wasBold ? 'Bold' : 'Regular';
                  const fallbackFont: FontName = { family: fallbackFamily, style: fallbackStyle };
                  
                  await figma.loadFontAsync(fallbackFont);
                  
                  // Success! Apply fallback font and update text
                  textNode.fontName = fallbackFont;
                  textNode.characters = newText;
                  updated++;
                  fallbackSucceeded = true;
                  fontSubstitutions.push(`${originalFontInfo} → ${fallbackFamily}`);
                  console.log(`Used fallback font ${fallbackFamily} for node ${original.id} (original: ${originalFontInfo})`);
                  break;
                } catch {
                  // This fallback didn't work, try next
                  continue;
                }
              }
              
              if (!fallbackSucceeded) {
                console.warn(`Skipping text node ${original.id}: no fonts available (tried ${originalFontInfo} and fallbacks)`);
                failed.push(`${original.id} (font: ${originalFontInfo})`);
              }
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
        
        // Build notification message
        let notifyMsg = `✓ Created new slide with ${updated} text updates`;
        if (fontSubstitutions.length > 0) {
          const uniqueSubs = [...new Set(fontSubstitutions)];
          notifyMsg += ` (${uniqueSubs.length} font substitution${uniqueSubs.length > 1 ? 's' : ''})`;
        }
        figma.notify(notifyMsg);
        
        figma.ui.postMessage({ 
          type: 'instantiated', 
          success: true, 
          newSlideId: clonedSlide.id,
          updated,
          failed,
          fontSubstitutions: [...new Set(fontSubstitutions)]  // Deduplicated
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
    
    // =======================================================================
    // SCREENSHOT: Export slide as PNG for visual feedback
    // =======================================================================
    if (msg.type === 'export-screenshot') {
      const requestedSlideId = (msg as any).slideId as string | undefined;
      const scale = (msg as any).scale as number || 0.5;  // Default 0.5x for smaller images
      
      let targetNode: SceneNode | null = null;
      
      if (requestedSlideId) {
        // Export specific slide by ID
        targetNode = await (figma as any).getNodeByIdAsync(requestedSlideId);
        if (!targetNode) {
          figma.notify(`Slide not found: ${requestedSlideId}`, { error: true });
          figma.ui.postMessage({ type: 'screenshot-exported', error: `Slide not found: ${requestedSlideId}` });
          return;
        }
      } else if (figma.currentPage.selection.length > 0) {
        // Use current selection
        targetNode = figma.currentPage.selection[0];
      } else {
        // Find first slide as fallback
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
        figma.notify('No slide found to screenshot', { error: true });
        figma.ui.postMessage({ type: 'screenshot-exported', error: 'No slide found' });
        return;
      }
      
      try {
        // Export as PNG
        const pngData = await targetNode.exportAsync({
          format: 'PNG',
          constraint: { type: 'SCALE', value: scale }
        });
        
        // Convert to base64
        const base64 = figma.base64Encode(pngData);
        
        figma.ui.postMessage({ 
          type: 'screenshot-exported',
          success: true,
          slideId: targetNode.id,
          slideName: targetNode.name,
          base64,
          width: Math.round(targetNode.width * scale),
          height: Math.round(targetNode.height * scale)
        });
        figma.notify(`📷 Exported "${targetNode.name}" (${Math.round(scale * 100)}%)`);
        
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error('Screenshot export error:', errorMsg);
        figma.notify(`Export failed: ${errorMsg}`, { error: true });
        figma.ui.postMessage({ type: 'screenshot-exported', success: false, error: errorMsg });
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
