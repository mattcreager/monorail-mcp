// Archetype rendering - creates slides based on archetype type

import type { Slide } from '../../shared/types';
import { COLORS, SLIDE_WIDTH, SLIDE_HEIGHT } from './constants';
import { 
  addText, 
  addRect, 
  createAutoLayoutFrame, 
  addAutoLayoutText, 
  setSlideBackground, 
  isInSlides 
} from './primitives';
import { renderCycleDiagram, DIAGRAM_COLORS } from './diagrams';

// Create slide and add content
export async function createSlideWithContent(slide: Slide, index: number): Promise<SceneNode> {
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
export async function addContentToParent(parent: SceneNode & ChildrenMixin, slide: Slide): Promise<void> {
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
      {
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
