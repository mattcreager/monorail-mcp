"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));

  // code.ts
  figma.showUI(__html__, { width: 320, height: 280 });
  var COLORS = {
    bg: { r: 0.06, g: 0.06, b: 0.1 },
    // Dark blue-black background
    headline: { r: 0.996, g: 0.953, b: 0.78 },
    // Warm cream for headlines
    body: { r: 0.83, g: 0.83, b: 0.85 },
    // Light gray for body text
    muted: { r: 0.61, g: 0.64, b: 0.69 },
    // Muted gray for sublines
    accent: { r: 0.86, g: 0.15, b: 0.15 },
    // Red accent
    white: { r: 0.98, g: 0.98, b: 0.98 },
    // Near white
    blue: { r: 0.05, g: 0.6, b: 1 },
    // Accent blue
    dimmed: { r: 0.3, g: 0.3, b: 0.35 },
    // Dimmed elements
    // Position cards colors
    cyan: { r: 0, g: 0.74, b: 0.84 },
    // Cyan for accents
    green: { r: 0.22, g: 0.78, b: 0.55 },
    // Green for "Built" badge
    orange: { r: 0.95, g: 0.55, b: 0.15 },
    // Orange for features
    cardBg: { r: 0.1, g: 0.1, b: 0.12 },
    // Card background
    cardBgHighlight: { r: 0.12, g: 0.14, b: 0.16 },
    // Highlighted card (middle)
    featureBg: { r: 0.08, g: 0.08, b: 0.1 }
    // Feature row background
  };
  var SLIDE_WIDTH = 1920;
  var SLIDE_HEIGHT = 1080;
  var MAPPING_KEY = "monorail_id_mapping";
  async function saveMapping(mapping) {
    await figma.clientStorage.setAsync(MAPPING_KEY, mapping);
  }
  function isInSlides() {
    return figma.editorType === "slides";
  }
  var FONT_FALLBACKS = ["Supply", "Inter", "SF Pro Display", "Helvetica Neue", "Arial"];
  var loadedFontCache = null;
  async function tryLoadFont(family) {
    try {
      const regular = { family, style: "Regular" };
      const bold = { family, style: "Bold" };
      await figma.loadFontAsync(regular);
      await figma.loadFontAsync(bold);
      return { family, regular, bold };
    } catch (e) {
      return null;
    }
  }
  async function loadFontWithFallback() {
    if (loadedFontCache) {
      return loadedFontCache;
    }
    for (const family of FONT_FALLBACKS) {
      const loaded = await tryLoadFont(family);
      if (loaded) {
        loadedFontCache = loaded;
        console.log(`[Font] Using ${family}`);
        return loaded;
      }
    }
    throw new Error(`No fonts available from fallback chain: ${FONT_FALLBACKS.join(", ")}`);
  }
  async function getFontName(bold = false) {
    const font = await loadFontWithFallback();
    return bold ? font.bold : font.regular;
  }
  async function addText(parent, text, x, y, fontSize, bold = false, color = COLORS.white, maxWidth, nodeName) {
    const textNode = figma.createText();
    textNode.x = x;
    textNode.y = y;
    if (nodeName) {
      textNode.name = nodeName;
    }
    const fontName = await getFontName(bold);
    textNode.fontName = fontName;
    textNode.fontSize = fontSize;
    textNode.fills = [{ type: "SOLID", color }];
    textNode.characters = text;
    if (maxWidth) {
      textNode.resize(maxWidth, textNode.height);
      textNode.textAutoResize = "HEIGHT";
    }
    parent.appendChild(textNode);
    return textNode;
  }
  function addRect(parent, x, y, w, h, fill, stroke, dashed) {
    const rect = figma.createRectangle();
    rect.x = x;
    rect.y = y;
    rect.resize(w, h);
    rect.fills = [{ type: "SOLID", color: fill }];
    if (stroke) {
      rect.strokes = [{ type: "SOLID", color: stroke }];
      rect.strokeWeight = 2;
      if (dashed) {
        rect.dashPattern = [10, 5];
      }
    }
    parent.appendChild(rect);
    return rect;
  }
  function createAutoLayoutFrame(parent, name, x, y, direction = "VERTICAL", spacing = 24, padding = 0) {
    const frame = figma.createFrame();
    frame.name = name;
    frame.layoutMode = direction;
    frame.primaryAxisSizingMode = "AUTO";
    frame.counterAxisSizingMode = "AUTO";
    frame.itemSpacing = spacing;
    frame.paddingTop = padding;
    frame.paddingBottom = padding;
    frame.paddingLeft = padding;
    frame.paddingRight = padding;
    frame.fills = [];
    frame.clipsContent = false;
    parent.appendChild(frame);
    frame.x = x;
    frame.y = y;
    return frame;
  }
  async function addAutoLayoutText(parent, text, fontSize, bold = false, color = COLORS.white, maxWidth, nodeName) {
    const textNode = figma.createText();
    if (nodeName) {
      textNode.name = nodeName;
    }
    const fontName = await getFontName(bold);
    textNode.fontName = fontName;
    textNode.fontSize = fontSize;
    textNode.fills = [{ type: "SOLID", color }];
    textNode.characters = text;
    if (maxWidth) {
      textNode.resize(maxWidth, textNode.height);
      textNode.textAutoResize = "HEIGHT";
    }
    parent.appendChild(textNode);
    return textNode;
  }
  function setSlideBackground(node) {
    if ("fills" in node) {
      node.fills = [{ type: "SOLID", color: COLORS.bg }];
    }
  }
  async function createSlideWithContent(slide, index) {
    let container;
    if (isInSlides()) {
      container = figma.createSlide();
      container.name = `${slide.content.headline || slide.archetype}`;
      setSlideBackground(container);
    } else {
      const frame = figma.createFrame();
      frame.name = `Slide ${index + 1}: ${slide.content.headline || slide.archetype}`;
      frame.resize(SLIDE_WIDTH, SLIDE_HEIGHT);
      frame.x = index * 2e3;
      frame.y = 0;
      frame.fills = [{ type: "SOLID", color: COLORS.bg }];
      container = frame;
    }
    await addContentToParent(container, slide);
    return container;
  }
  async function addContentToParent(parent, slide) {
    var _a;
    const c = slide.content;
    switch (slide.archetype) {
      case "title":
        {
          const gradientBg = figma.createRectangle();
          gradientBg.name = "title-gradient-bg";
          gradientBg.resize(SLIDE_WIDTH, SLIDE_HEIGHT);
          gradientBg.x = 0;
          gradientBg.y = 0;
          gradientBg.fills = [{
            type: "GRADIENT_LINEAR",
            gradientStops: [
              { position: 0, color: __spreadProps(__spreadValues({}, COLORS.bg), { a: 1 }) },
              { position: 1, color: { r: 0.1, g: 0.1, b: 0.18, a: 1 } }
            ],
            gradientTransform: [[0.7, 0.7, 0], [-0.7, 0.7, 0.5]]
            // 135deg diagonal
          }];
          parent.appendChild(gradientBg);
          const titleContainer = createAutoLayoutFrame(
            parent,
            "title-container",
            200,
            380,
            // roughly vertically centered
            "VERTICAL",
            24
            // spacing between headline and subline
          );
          if (c.headline) await addAutoLayoutText(titleContainer, c.headline, 96, true, COLORS.headline, 1520, "headline");
          if (c.subline) await addAutoLayoutText(titleContainer, c.subline, 36, false, COLORS.muted, 1520, "subline");
        }
        break;
      case "section":
        {
          const sectionContainer = createAutoLayoutFrame(
            parent,
            "section-container",
            200,
            450,
            // vertically centered
            "VERTICAL",
            24
            // spacing if we add subline later
          );
          if (c.headline) await addAutoLayoutText(sectionContainer, c.headline, 72, true, COLORS.headline, 1520, "headline");
        }
        break;
      case "big-idea":
        {
          const bigIdeaContainer = createAutoLayoutFrame(
            parent,
            "big-idea-container",
            200,
            380,
            "VERTICAL",
            40
            // spacing between headline and subline
          );
          if (c.headline) await addAutoLayoutText(bigIdeaContainer, c.headline, 72, true, COLORS.white, 1520, "headline");
          if (c.subline) await addAutoLayoutText(bigIdeaContainer, c.subline, 32, false, COLORS.muted, 1520, "subline");
        }
        break;
      case "bullets":
        if (c.headline) await addText(parent, c.headline, 200, 180, 56, true, COLORS.headline, void 0, "headline");
        if (c.bullets) {
          const bulletsContainer = createAutoLayoutFrame(
            parent,
            "bullets-container",
            200,
            // x position
            300,
            // y position (below headline)
            "VERTICAL",
            32
            // spacing between bullets
          );
          for (let i = 0; i < c.bullets.length; i++) {
            await addAutoLayoutText(
              bulletsContainer,
              `\u2022 ${c.bullets[i]}`,
              36,
              false,
              COLORS.body,
              1520,
              // max width for text wrapping
              `bullet-${i}`
            );
          }
        }
        break;
      case "two-column":
        {
          const twoColContainer = createAutoLayoutFrame(
            parent,
            "two-column-container",
            200,
            // x position (left margin)
            150,
            // y position
            "VERTICAL",
            48
            // spacing between headline and columns
          );
          if (c.headline) await addAutoLayoutText(twoColContainer, c.headline, 56, true, COLORS.headline, 1520, "headline");
          const columnsContainer = createAutoLayoutFrame(
            twoColContainer,
            "columns-container",
            0,
            0,
            // position handled by parent Auto Layout
            "HORIZONTAL",
            40
            // gap between columns
          );
          if (c.left) {
            const leftColumn = createAutoLayoutFrame(
              columnsContainer,
              "left-column",
              0,
              0,
              "VERTICAL",
              16
              // spacing between title and body
            );
            leftColumn.counterAxisSizingMode = "FIXED";
            leftColumn.resize(740, leftColumn.height);
            await addAutoLayoutText(leftColumn, c.left.title, 36, true, COLORS.accent, 740, "left-title");
            await addAutoLayoutText(leftColumn, c.left.body, 28, false, COLORS.body, 740, "left-body");
          }
          if (c.right) {
            const rightColumn = createAutoLayoutFrame(
              columnsContainer,
              "right-column",
              0,
              0,
              "VERTICAL",
              16
              // spacing between title and body
            );
            rightColumn.counterAxisSizingMode = "FIXED";
            rightColumn.resize(740, rightColumn.height);
            await addAutoLayoutText(rightColumn, c.right.title, 36, true, COLORS.headline, 740, "right-title");
            await addAutoLayoutText(rightColumn, c.right.body, 28, false, COLORS.body, 740, "right-body");
          }
        }
        break;
      case "quote":
        {
          const quoteContainer = createAutoLayoutFrame(
            parent,
            "quote-container",
            200,
            350,
            // roughly vertically centered
            "VERTICAL",
            40
            // spacing between quote and attribution
          );
          if (c.quote) await addAutoLayoutText(quoteContainer, `"${c.quote}"`, 48, true, COLORS.white, 1520, "quote");
          if (c.attribution) await addAutoLayoutText(quoteContainer, `\u2014 ${c.attribution}`, 28, false, COLORS.muted, 1520, "attribution");
        }
        break;
      case "summary":
        {
          const summaryContainer = createAutoLayoutFrame(
            parent,
            "summary-container",
            200,
            180,
            // near top
            "VERTICAL",
            48
            // spacing between headline and items
          );
          if (c.headline) await addAutoLayoutText(summaryContainer, c.headline, 72, true, COLORS.headline, 1520, "headline");
          if (c.items) {
            const itemsContainer = createAutoLayoutFrame(
              summaryContainer,
              "items-container",
              0,
              0,
              // position handled by parent Auto Layout
              "VERTICAL",
              24
              // spacing between items
            );
            for (let i = 0; i < c.items.length; i++) {
              await addAutoLayoutText(itemsContainer, c.items[i], 36, false, COLORS.body, 1520, `item-${i}`);
            }
          }
        }
        break;
      case "chart":
        if (c.headline) await addText(parent, c.headline, 200, 150, 56, true, COLORS.headline, void 0, "headline");
        addRect(parent, 200, 280, 1520, 500, { r: 0.1, g: 0.1, b: 0.13 }, COLORS.dimmed, true);
        await addText(parent, `[Chart: ${((_a = c.chart) == null ? void 0 : _a.type) || "data"}]`, 860, 500, 28, false, COLORS.muted, void 0, "chart-placeholder");
        if (c.takeaway) await addText(parent, c.takeaway, 200, 820, 28, false, COLORS.muted, void 0, "takeaway");
        break;
      case "video":
        {
          const videoContainer = createAutoLayoutFrame(
            parent,
            "video-container",
            200,
            150,
            "VERTICAL",
            32
            // spacing between elements
          );
          if (c.headline) await addAutoLayoutText(videoContainer, c.headline, 56, true, COLORS.headline, 1520, "headline");
          const placeholderFrame = figma.createFrame();
          placeholderFrame.name = "video-placeholder";
          placeholderFrame.resize(1200, 675);
          placeholderFrame.fills = [{ type: "SOLID", color: { r: 0.08, g: 0.08, b: 0.1 } }];
          placeholderFrame.strokes = [{ type: "SOLID", color: COLORS.dimmed }];
          placeholderFrame.strokeWeight = 2;
          placeholderFrame.cornerRadius = 8;
          videoContainer.appendChild(placeholderFrame);
          const playCircle = figma.createEllipse();
          playCircle.name = "play-circle";
          playCircle.resize(100, 100);
          playCircle.x = 550;
          playCircle.y = 287;
          playCircle.fills = [{ type: "SOLID", color: COLORS.white, opacity: 0.9 }];
          placeholderFrame.appendChild(playCircle);
          const playTriangle = figma.createPolygon();
          playTriangle.name = "play-triangle";
          playTriangle.pointCount = 3;
          playTriangle.resize(36, 36);
          playTriangle.rotation = -90;
          playTriangle.x = 600;
          playTriangle.y = 320;
          playTriangle.fills = [{ type: "SOLID", color: { r: 0.1, g: 0.1, b: 0.15 } }];
          placeholderFrame.appendChild(playTriangle);
          if (c.video_url) {
            await addAutoLayoutText(videoContainer, c.video_url, 20, false, COLORS.blue, 1520, "video-url");
          }
          if (c.caption) {
            await addAutoLayoutText(videoContainer, c.caption, 24, false, COLORS.muted, 1520, "caption");
          }
        }
        break;
      case "timeline":
        if (c.headline) await addText(parent, c.headline, 200, 150, 56, true, COLORS.headline, void 0, "headline");
        if (c.stages) {
          const stageWidth = 1520 / c.stages.length;
          for (let i = 0; i < c.stages.length; i++) {
            const stage = c.stages[i];
            const x = 200 + i * stageWidth;
            const marker = figma.createEllipse();
            marker.name = `stage-${i}-marker`;
            marker.x = x + stageWidth / 2 - 20;
            marker.y = 340;
            marker.resize(40, 40);
            marker.fills = [{ type: "SOLID", color: COLORS.blue }];
            parent.appendChild(marker);
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
      case "comparison":
        if (c.headline) await addText(parent, c.headline, 200, 150, 56, true, COLORS.headline, void 0, "headline");
        const cols = c.columns || [];
        const rows = c.rows || [];
        const colW = 1520 / Math.max(cols.length, 1);
        const startY = 300;
        const rowH = 80;
        addRect(parent, 200, startY - 10, 1520, 60, { r: 0.1, g: 0.1, b: 0.13 });
        for (let i = 0; i < cols.length; i++) {
          await addText(parent, cols[i], 210 + i * colW, startY, 28, true, COLORS.headline, colW - 20, `col-${i}`);
        }
        for (let r = 0; r < rows.length; r++) {
          const y = startY + 70 + r * rowH;
          if (r % 2 === 0) {
            addRect(parent, 200, y - 10, 1520, rowH, { r: 0.08, g: 0.08, b: 0.11 });
          }
          for (let col = 0; col < rows[r].length; col++) {
            await addText(parent, rows[r][col], 210 + col * colW, y, 24, false, COLORS.body, colW - 20, `cell-${r}-${col}`);
          }
        }
        break;
      case "position-cards":
        {
          if (c.eyebrow) {
            await addText(parent, c.eyebrow, 60, 80, 14, true, COLORS.cyan, void 0, "eyebrow");
          }
          if (c.headline) {
            await addText(parent, c.headline, 60, 120, 52, true, COLORS.white, 1800, "headline");
          }
          if (c.subline) {
            await addText(parent, c.subline, 60, 200, 52, true, COLORS.white, 1800, "subline");
          }
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
            const cardBg = figma.createRectangle();
            cardBg.name = `card-${i}-bg`;
            cardBg.x = cardX;
            cardBg.y = cardsStartY;
            cardBg.resize(cardWidth, cardHeight);
            cardBg.cornerRadius = 16;
            cardBg.fills = [{ type: "SOLID", color: isMiddleCard ? COLORS.cardBgHighlight : COLORS.cardBg }];
            if (isMiddleCard) {
              cardBg.strokes = [{ type: "SOLID", color: COLORS.cyan }];
              cardBg.strokeWeight = 2;
            }
            parent.appendChild(cardBg);
            await addText(parent, card.label, cardX + 24, cardsStartY + 24, 12, true, COLORS.muted, cardWidth - 48, `card-${i}-label`);
            await addText(parent, card.title, cardX + 24, cardsStartY + 56, 28, true, COLORS.white, cardWidth - 48, `card-${i}-title`);
            await addText(parent, card.body, cardX + 24, cardsStartY + 100, 18, false, COLORS.muted, cardWidth - 48, `card-${i}-body`);
            if (card.badge) {
              const badgeColor = card.badge_color === "green" ? COLORS.green : card.badge_color === "orange" ? COLORS.orange : COLORS.cyan;
              const badgeY = cardsStartY + cardHeight - 50;
              const badgeBg = figma.createRectangle();
              badgeBg.name = `card-${i}-badge-bg`;
              badgeBg.x = cardX + 24;
              badgeBg.y = badgeY;
              badgeBg.resize(100, 32);
              badgeBg.cornerRadius = 16;
              badgeBg.fills = [{ type: "SOLID", color: badgeColor, opacity: 0.15 }];
              parent.appendChild(badgeBg);
              await addText(parent, card.badge, cardX + 36, badgeY + 7, 14, true, badgeColor, void 0, `card-${i}-badge`);
            }
          }
          const features = c.features || [];
          if (features.length > 0) {
            const featuresY = 640;
            const featuresBg = figma.createRectangle();
            featuresBg.name = "features-bg";
            featuresBg.x = 60;
            featuresBg.y = featuresY;
            featuresBg.resize(1800, 160);
            featuresBg.cornerRadius = 16;
            featuresBg.fills = [{ type: "SOLID", color: COLORS.featureBg }];
            parent.appendChild(featuresBg);
            await addText(parent, "WHAT THE WEDGE DEMANDS \u2014 WHAT WE'RE BUILDING", 85, featuresY + 24, 12, true, COLORS.muted, 1760, "features-header");
            const featureStartY = featuresY + 60;
            const featureColWidth = 420;
            const featureRowHeight = 40;
            for (let i = 0; i < features.length; i++) {
              const feature = features[i];
              const row = Math.floor(i / 4);
              const col = i % 4;
              const fx = 85 + col * featureColWidth;
              const fy = featureStartY + row * featureRowHeight;
              const dot = figma.createEllipse();
              dot.name = `feature-${i}-dot`;
              dot.x = fx;
              dot.y = fy + 4;
              dot.resize(12, 12);
              dot.fills = [{ type: "SOLID", color: COLORS.orange }];
              parent.appendChild(dot);
              await addText(parent, feature.label, fx + 20, fy, 16, true, COLORS.white, void 0, `feature-${i}-label`);
              const labelWidth = feature.label.length * 9;
              await addText(parent, feature.description, fx + 20 + labelWidth + 8, fy, 16, false, COLORS.muted, featureColWidth - labelWidth - 40, `feature-${i}-desc`);
            }
          }
        }
        break;
      default:
        if (c.headline) await addText(parent, c.headline, 200, 200, 64, true, COLORS.headline, void 0, "headline");
    }
    if (c.visual) {
      const parentWidth = parent.width || 1920;
      const parentHeight = parent.height || 1080;
      const position = c.visual.position || "right";
      let defaultWidth;
      let defaultHeight;
      switch (position) {
        case "right":
          defaultWidth = Math.round(parentHeight * 0.65);
          defaultHeight = Math.round(parentHeight * 0.65);
          break;
        case "center":
          defaultWidth = Math.round(parentHeight * 0.7);
          defaultHeight = Math.round(parentHeight * 0.7);
          break;
        case "below":
          defaultWidth = Math.round(parentWidth * 0.4);
          defaultHeight = Math.round(parentHeight * 0.35);
          break;
        default:
          defaultWidth = 600;
          defaultHeight = 600;
      }
      const visualWidth = c.visual.width || defaultWidth;
      const visualHeight = c.visual.height || defaultHeight;
      let visualX = 0;
      let visualY = 0;
      switch (position) {
        case "right":
          visualX = parentWidth - visualWidth - 100;
          visualY = (parentHeight - visualHeight) / 2;
          break;
        case "below":
          visualX = (parentWidth - visualWidth) / 2;
          visualY = parentHeight - visualHeight - 100;
          break;
        case "center":
          visualX = (parentWidth - visualWidth) / 2;
          visualY = (parentHeight - visualHeight) / 2;
          break;
      }
      if (c.visual.type === "svg" && c.visual.content) {
        try {
          const svgNode = figma.createNodeFromSvg(c.visual.content);
          svgNode.name = "visual";
          const scaleX = visualWidth / svgNode.width;
          const scaleY = visualHeight / svgNode.height;
          const scale = Math.min(scaleX, scaleY);
          svgNode.resize(svgNode.width * scale, svgNode.height * scale);
          svgNode.x = visualX;
          svgNode.y = visualY;
          parent.appendChild(svgNode);
        } catch (e) {
          console.error("Failed to render SVG:", e);
        }
      } else if (c.visual.type === "cycle" && c.visual.nodes && c.visual.nodes.length > 0) {
        await renderCycleDiagram(parent, c.visual.nodes, c.visual.colors || [], c.visual.icons || [], visualX, visualY, visualWidth, visualHeight);
      }
    }
  }
  var DIAGRAM_COLORS = {
    cyan: { r: 0, g: 0.74, b: 0.84 },
    green: { r: 0.3, g: 0.69, b: 0.31 },
    orange: { r: 1, g: 0.6, b: 0 },
    pink: { r: 0.91, g: 0.12, b: 0.39 },
    purple: { r: 0.61, g: 0.15, b: 0.69 },
    blue: { r: 0.13, g: 0.59, b: 0.95 },
    white: { r: 1, g: 1, b: 1 }
  };
  function renderIcon(container, iconName, centerX, centerY, size, color) {
    const halfSize = size / 2;
    switch (iconName) {
      case "presence": {
        const head = figma.createEllipse();
        head.name = "icon-presence-head";
        head.resize(size * 0.4, size * 0.4);
        head.x = centerX - size * 0.2;
        head.y = centerY - halfSize;
        head.fills = [{ type: "SOLID", color }];
        container.appendChild(head);
        const body = figma.createEllipse();
        body.name = "icon-presence-body";
        body.resize(size * 0.7, size * 0.5);
        body.x = centerX - size * 0.35;
        body.y = centerY;
        body.fills = [{ type: "SOLID", color }];
        container.appendChild(body);
        break;
      }
      case "lightbulb": {
        const bulb = figma.createEllipse();
        bulb.name = "icon-lightbulb-bulb";
        bulb.resize(size * 0.7, size * 0.7);
        bulb.x = centerX - size * 0.35;
        bulb.y = centerY - halfSize;
        bulb.fills = [{ type: "SOLID", color }];
        container.appendChild(bulb);
        const base = figma.createRectangle();
        base.name = "icon-lightbulb-base";
        base.resize(size * 0.35, size * 0.25);
        base.x = centerX - size * 0.175;
        base.y = centerY + size * 0.15;
        base.fills = [{ type: "SOLID", color }];
        base.cornerRadius = 2;
        container.appendChild(base);
        break;
      }
      case "refresh": {
        const arc1 = figma.createEllipse();
        arc1.name = "icon-refresh-arc";
        arc1.resize(size * 0.8, size * 0.8);
        arc1.x = centerX - size * 0.4;
        arc1.y = centerY - size * 0.4;
        arc1.fills = [];
        arc1.strokes = [{ type: "SOLID", color }];
        arc1.strokeWeight = size * 0.12;
        arc1.arcData = { startingAngle: 0, endingAngle: 4.7, innerRadius: 0.7 };
        container.appendChild(arc1);
        const arrow = figma.createPolygon();
        arrow.name = "icon-refresh-arrow";
        arrow.resize(size * 0.25, size * 0.25);
        arrow.x = centerX + size * 0.25;
        arrow.y = centerY - size * 0.5;
        arrow.fills = [{ type: "SOLID", color }];
        arrow.rotation = 90;
        container.appendChild(arrow);
        break;
      }
      case "chart": {
        const bar1 = figma.createRectangle();
        bar1.name = "icon-chart-bar1";
        bar1.resize(size * 0.2, size * 0.3);
        bar1.x = centerX - size * 0.4;
        bar1.y = centerY + size * 0.1;
        bar1.fills = [{ type: "SOLID", color }];
        container.appendChild(bar1);
        const bar2 = figma.createRectangle();
        bar2.name = "icon-chart-bar2";
        bar2.resize(size * 0.2, size * 0.5);
        bar2.x = centerX - size * 0.1;
        bar2.y = centerY - size * 0.1;
        bar2.fills = [{ type: "SOLID", color }];
        container.appendChild(bar2);
        const bar3 = figma.createRectangle();
        bar3.name = "icon-chart-bar3";
        bar3.resize(size * 0.2, size * 0.8);
        bar3.x = centerX + size * 0.2;
        bar3.y = centerY - size * 0.4;
        bar3.fills = [{ type: "SOLID", color }];
        container.appendChild(bar3);
        break;
      }
      case "magnet": {
        const left = figma.createRectangle();
        left.name = "icon-magnet-left";
        left.resize(size * 0.25, size * 0.7);
        left.x = centerX - size * 0.4;
        left.y = centerY - size * 0.35;
        left.fills = [{ type: "SOLID", color }];
        container.appendChild(left);
        const right = figma.createRectangle();
        right.name = "icon-magnet-right";
        right.resize(size * 0.25, size * 0.7);
        right.x = centerX + size * 0.15;
        right.y = centerY - size * 0.35;
        right.fills = [{ type: "SOLID", color }];
        container.appendChild(right);
        const bottom = figma.createRectangle();
        bottom.name = "icon-magnet-bottom";
        bottom.resize(size * 0.8, size * 0.25);
        bottom.x = centerX - size * 0.4;
        bottom.y = centerY + size * 0.1;
        bottom.fills = [{ type: "SOLID", color }];
        bottom.cornerRadius = size * 0.1;
        container.appendChild(bottom);
        break;
      }
      case "rocket": {
        const body = figma.createEllipse();
        body.name = "icon-rocket-body";
        body.resize(size * 0.35, size * 0.8);
        body.x = centerX - size * 0.175;
        body.y = centerY - size * 0.4;
        body.fills = [{ type: "SOLID", color }];
        body.rotation = 0;
        container.appendChild(body);
        const fin = figma.createPolygon();
        fin.name = "icon-rocket-fin";
        fin.resize(size * 0.5, size * 0.3);
        fin.x = centerX - size * 0.25;
        fin.y = centerY + size * 0.2;
        fin.fills = [{ type: "SOLID", color }];
        container.appendChild(fin);
        break;
      }
      case "target": {
        const outer = figma.createEllipse();
        outer.name = "icon-target-outer";
        outer.resize(size * 0.9, size * 0.9);
        outer.x = centerX - size * 0.45;
        outer.y = centerY - size * 0.45;
        outer.fills = [];
        outer.strokes = [{ type: "SOLID", color }];
        outer.strokeWeight = size * 0.08;
        container.appendChild(outer);
        const middle = figma.createEllipse();
        middle.name = "icon-target-middle";
        middle.resize(size * 0.5, size * 0.5);
        middle.x = centerX - size * 0.25;
        middle.y = centerY - size * 0.25;
        middle.fills = [];
        middle.strokes = [{ type: "SOLID", color }];
        middle.strokeWeight = size * 0.08;
        container.appendChild(middle);
        const center = figma.createEllipse();
        center.name = "icon-target-center";
        center.resize(size * 0.2, size * 0.2);
        center.x = centerX - size * 0.1;
        center.y = centerY - size * 0.1;
        center.fills = [{ type: "SOLID", color }];
        container.appendChild(center);
        break;
      }
      case "users": {
        const head1 = figma.createEllipse();
        head1.name = "icon-users-head1";
        head1.resize(size * 0.3, size * 0.3);
        head1.x = centerX - size * 0.35;
        head1.y = centerY - size * 0.4;
        head1.fills = [{ type: "SOLID", color: { r: color.r * 0.7, g: color.g * 0.7, b: color.b * 0.7 } }];
        container.appendChild(head1);
        const body1 = figma.createEllipse();
        body1.name = "icon-users-body1";
        body1.resize(size * 0.4, size * 0.35);
        body1.x = centerX - size * 0.4;
        body1.y = centerY - size * 0.05;
        body1.fills = [{ type: "SOLID", color: { r: color.r * 0.7, g: color.g * 0.7, b: color.b * 0.7 } }];
        container.appendChild(body1);
        const head2 = figma.createEllipse();
        head2.name = "icon-users-head2";
        head2.resize(size * 0.35, size * 0.35);
        head2.x = centerX + size * 0.05;
        head2.y = centerY - size * 0.45;
        head2.fills = [{ type: "SOLID", color }];
        container.appendChild(head2);
        const body2 = figma.createEllipse();
        body2.name = "icon-users-body2";
        body2.resize(size * 0.5, size * 0.4);
        body2.x = centerX;
        body2.y = centerY;
        body2.fills = [{ type: "SOLID", color }];
        container.appendChild(body2);
        break;
      }
      case "check": {
        const line1 = figma.createRectangle();
        line1.name = "icon-check-1";
        line1.resize(size * 0.15, size * 0.5);
        line1.x = centerX - size * 0.25;
        line1.y = centerY - size * 0.1;
        line1.fills = [{ type: "SOLID", color }];
        line1.rotation = -45;
        container.appendChild(line1);
        const line2 = figma.createRectangle();
        line2.name = "icon-check-2";
        line2.resize(size * 0.15, size * 0.8);
        line2.x = centerX + size * 0.1;
        line2.y = centerY - size * 0.35;
        line2.fills = [{ type: "SOLID", color }];
        line2.rotation = 45;
        container.appendChild(line2);
        break;
      }
      case "star": {
        const star = figma.createStar();
        star.name = "icon-star";
        star.resize(size * 0.9, size * 0.9);
        star.x = centerX - size * 0.45;
        star.y = centerY - size * 0.45;
        star.fills = [{ type: "SOLID", color }];
        star.pointCount = 5;
        star.innerRadius = 0.4;
        container.appendChild(star);
        break;
      }
      default:
        const fallback = figma.createEllipse();
        fallback.name = `icon-${iconName}`;
        fallback.resize(size * 0.5, size * 0.5);
        fallback.x = centerX - size * 0.25;
        fallback.y = centerY - size * 0.25;
        fallback.fills = [{ type: "SOLID", color }];
        container.appendChild(fallback);
    }
  }
  async function renderCycleDiagram(parent, nodes, colors, icons, x, y, width, height) {
    const container = figma.createFrame();
    container.name = "visual";
    container.resize(width, height);
    container.x = x;
    container.y = y;
    container.fills = [];
    container.clipsContent = false;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.35;
    const nodeRadius = 45;
    const n = nodes.length;
    const nodePositions = [];
    for (let i = 0; i < n; i++) {
      const angle = -Math.PI / 2 + 2 * Math.PI * i / n;
      nodePositions.push({
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle)
      });
    }
    for (let i = 0; i < n; i++) {
      const from = nodePositions[i];
      const to = nodePositions[(i + 1) % n];
      const color = DIAGRAM_COLORS[colors[i] || "white"] || DIAGRAM_COLORS.white;
      const line = figma.createVector();
      line.name = `connector-${i}`;
      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2;
      const toCenterX = centerX - midX;
      const toCenterY = centerY - midY;
      const dist = Math.sqrt(toCenterX * toCenterX + toCenterY * toCenterY);
      const curveOffset = 30;
      const ctrlX = midX + toCenterX / dist * curveOffset;
      const ctrlY = midY + toCenterY / dist * curveOffset;
      const startAngle = Math.atan2(to.y - from.y, to.x - from.x);
      const endAngle = Math.atan2(from.y - to.y, from.x - to.x);
      const startX = from.x + nodeRadius * Math.cos(startAngle);
      const startY = from.y + nodeRadius * Math.sin(startAngle);
      const endX = to.x + nodeRadius * Math.cos(endAngle);
      const endY = to.y + nodeRadius * Math.sin(endAngle);
      line.vectorPaths = [{
        windingRule: "NONZERO",
        data: `M ${startX} ${startY} Q ${ctrlX} ${ctrlY} ${endX} ${endY}`
      }];
      line.strokes = [{ type: "SOLID", color }];
      line.strokeWeight = 3;
      line.strokeCap = "ROUND";
      container.appendChild(line);
      const arrowAngle = Math.atan2(endY - ctrlY, endX - ctrlX);
      const arrowSize = 12;
      const tipX = endX;
      const tipY = endY;
      const leftX = tipX - arrowSize * Math.cos(arrowAngle - Math.PI / 6);
      const leftY = tipY - arrowSize * Math.sin(arrowAngle - Math.PI / 6);
      const rightX = tipX - arrowSize * Math.cos(arrowAngle + Math.PI / 6);
      const rightY = tipY - arrowSize * Math.sin(arrowAngle + Math.PI / 6);
      const arrow = figma.createVector();
      arrow.name = `arrow-${i}`;
      arrow.vectorPaths = [{
        windingRule: "NONZERO",
        data: `M ${tipX} ${tipY} L ${leftX} ${leftY} L ${rightX} ${rightY} Z`
      }];
      arrow.fills = [{ type: "SOLID", color }];
      arrow.strokes = [];
      container.appendChild(arrow);
    }
    for (let i = 0; i < n; i++) {
      const pos = nodePositions[i];
      const label = nodes[i];
      const color = DIAGRAM_COLORS[colors[i] || "white"] || DIAGRAM_COLORS.white;
      const iconName = icons[i];
      const circle = figma.createEllipse();
      circle.name = `node-${i}`;
      circle.resize(nodeRadius * 2, nodeRadius * 2);
      circle.x = pos.x - nodeRadius;
      circle.y = pos.y - nodeRadius;
      circle.fills = [{ type: "SOLID", color: { r: 0.1, g: 0.1, b: 0.12 } }];
      circle.strokes = [{ type: "SOLID", color }];
      circle.strokeWeight = 3;
      container.appendChild(circle);
      if (iconName) {
        const iconSize = nodeRadius * 1.1;
        renderIcon(container, iconName, pos.x, pos.y, iconSize, color);
      }
      const text = figma.createText();
      text.name = `label-${i}`;
      const loadedFont = await loadFontWithFallback();
      text.fontName = loadedFont.bold;
      text.fontSize = 32;
      text.characters = label;
      text.fills = [{ type: "SOLID", color }];
      text.textAlignHorizontal = "CENTER";
      text.x = pos.x - text.width / 2;
      text.y = pos.y + nodeRadius + 8;
      container.appendChild(text);
    }
    parent.appendChild(container);
  }
  function parseIR(irString) {
    try {
      return JSON.parse(irString);
    } catch (e) {
      console.error("Failed to parse IR:", e);
      return null;
    }
  }
  function findNamedTextNode(parent, name) {
    const children = parent.children || [];
    for (const child of children) {
      if (child.type === "TEXT" && child.name === name) {
        return child;
      }
      if (child.type === "FRAME" && "children" in child) {
        const found = findNamedTextNode(child, name);
        if (found) return found;
      }
    }
    return null;
  }
  async function updateTextInPlace(node, newText) {
    const fontName = node.fontName;
    if (fontName !== figma.mixed) {
      await figma.loadFontAsync(fontName);
    }
    node.characters = newText;
  }
  async function updateContentInPlace(parent, slide) {
    const c = slide.content;
    async function updateNamed(name, text) {
      if (!text) return;
      const node = findNamedTextNode(parent, name);
      if (node) {
        await updateTextInPlace(node, text);
      }
    }
    switch (slide.archetype) {
      case "title":
        await updateNamed("headline", c.headline);
        await updateNamed("subline", c.subline);
        break;
      case "section":
        await updateNamed("headline", c.headline);
        break;
      case "big-idea":
        await updateNamed("headline", c.headline);
        await updateNamed("subline", c.subline);
        break;
      case "bullets":
        await updateNamed("headline", c.headline);
        if (c.bullets) {
          for (let i = 0; i < c.bullets.length; i++) {
            await updateNamed(`bullet-${i}`, `\u2022 ${c.bullets[i]}`);
          }
        }
        break;
      case "two-column":
        await updateNamed("headline", c.headline);
        if (c.left) {
          await updateNamed("left-title", c.left.title);
          await updateNamed("left-body", c.left.body);
        }
        if (c.right) {
          await updateNamed("right-title", c.right.title);
          await updateNamed("right-body", c.right.body);
        }
        break;
      case "quote":
        await updateNamed("quote", c.quote ? `"${c.quote}"` : void 0);
        await updateNamed("attribution", c.attribution ? `\u2014 ${c.attribution}` : void 0);
        break;
      case "summary":
        await updateNamed("headline", c.headline);
        if (c.items) {
          for (let i = 0; i < c.items.length; i++) {
            await updateNamed(`item-${i}`, c.items[i]);
          }
        }
        break;
      case "chart":
        await updateNamed("headline", c.headline);
        await updateNamed("takeaway", c.takeaway);
        break;
      case "video":
        await updateNamed("headline", c.headline);
        await updateNamed("video-url", c.video_url);
        await updateNamed("caption", c.caption);
        break;
      case "timeline":
        await updateNamed("headline", c.headline);
        if (c.stages) {
          for (let i = 0; i < c.stages.length; i++) {
            await updateNamed(`stage-${i}-label`, c.stages[i].label);
            await updateNamed(`stage-${i}-desc`, c.stages[i].description);
          }
        }
        break;
      case "comparison":
        await updateNamed("headline", c.headline);
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
        await updateNamed("headline", c.headline);
    }
  }
  function detectExistingArchetype(parent) {
    const children = parent.children || [];
    const textNodes = children.filter((n) => n.type === "TEXT");
    const frameNodes = children.filter((n) => n.type === "FRAME");
    const names = new Set(textNodes.map((t) => t.name));
    const frameNames = new Set(frameNodes.map((f) => f.name));
    if (frameNames.has("bullets-container")) return "bullets";
    if (frameNames.has("two-column-container")) return "two-column";
    if (names.has("quote") && names.has("attribution")) return "quote";
    if (names.has("left-title") || names.has("right-title")) return "two-column";
    if (Array.from(names).some((n) => n.startsWith("bullet-"))) return "bullets";
    if (Array.from(names).some((n) => n.startsWith("item-"))) return "summary";
    if (Array.from(names).some((n) => n.startsWith("stage-"))) return "timeline";
    if (Array.from(names).some((n) => n.startsWith("col-") || n.startsWith("cell-"))) return "comparison";
    if (names.has("chart-placeholder")) return "chart";
    if (names.has("headline") && names.has("subline")) {
      const headline = textNodes.find((t) => t.name === "headline");
      if (headline && typeof headline.fontSize === "number" && headline.fontSize >= 90) {
        return "title";
      }
      return "big-idea";
    }
    if (names.has("headline") && names.size === 1) return "section";
    return "unknown";
  }
  function captureNodeTree(node) {
    const captured = {
      id: node.id,
      type: node.type,
      name: node.name,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height
    };
    if ("fills" in node && node.fills !== figma.mixed) {
      captured.fills = JSON.parse(JSON.stringify(node.fills));
    }
    if ("strokes" in node) {
      captured.strokes = JSON.parse(JSON.stringify(node.strokes));
    }
    if ("strokeWeight" in node && node.strokeWeight !== figma.mixed) {
      captured.strokeWeight = node.strokeWeight;
    }
    if ("cornerRadius" in node && node.cornerRadius !== figma.mixed) {
      captured.cornerRadius = node.cornerRadius;
    }
    if ("effects" in node) {
      captured.effects = JSON.parse(JSON.stringify(node.effects));
    }
    if ("layoutMode" in node) {
      captured.layoutMode = node.layoutMode;
      if (node.layoutMode !== "NONE") {
        captured.itemSpacing = node.itemSpacing;
        captured.paddingTop = node.paddingTop;
        captured.paddingRight = node.paddingRight;
        captured.paddingBottom = node.paddingBottom;
        captured.paddingLeft = node.paddingLeft;
      }
    }
    if (node.type === "TEXT") {
      const textNode = node;
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
    if (node.type === "TABLE") {
      const tableNode = node;
      captured.numRows = tableNode.numRows;
      captured.numColumns = tableNode.numColumns;
      const cells = [];
      for (let row = 0; row < tableNode.numRows; row++) {
        for (let col = 0; col < tableNode.numColumns; col++) {
          const cell = tableNode.cellAt(row, col);
          if (cell && cell.text) {
            cells.push({
              row,
              col,
              text: cell.text.characters || ""
            });
          }
        }
      }
      captured.tableCells = cells;
      console.log(`[TABLE] Captured ${tableNode.numRows}x${tableNode.numColumns} table with ${cells.length} cells`);
    }
    if ("children" in node) {
      captured.children = node.children.map((child) => captureNodeTree(child));
    }
    return captured;
  }
  function getAllTextNodes(node, results = [], depth = 0, parentName = "", offsetX = 0, offsetY = 0) {
    if (node.type === "TEXT") {
      results.push({
        node,
        depth,
        parentName,
        absoluteX: node.x + offsetX,
        absoluteY: node.y + offsetY
      });
    } else if (node.type === "TABLE") {
      const tableNode = node;
      const tableX = node.x + offsetX;
      const tableY = node.y + offsetY;
      console.log(`[TABLE] Found ${tableNode.numRows}x${tableNode.numColumns} table "${node.name}"`);
      for (let row = 0; row < tableNode.numRows; row++) {
        for (let col = 0; col < tableNode.numColumns; col++) {
          const cell = tableNode.cellAt(row, col);
          if (cell && cell.text && cell.text.characters) {
            results.push({
              node: cell.text,
              depth: depth + 1,
              parentName: `${node.name || "Table"}[${row},${col}]`,
              absoluteX: tableX,
              // Approximate - cells don't expose individual positions easily
              absoluteY: tableY + row * 40,
              // Rough estimate based on row
              isTableCell: true,
              tableRow: row,
              tableCol: col
            });
          }
        }
      }
    } else if ("children" in node) {
      const container = node;
      const newOffsetX = offsetX + (node.type !== "SLIDE" ? node.x : 0);
      const newOffsetY = offsetY + (node.type !== "SLIDE" ? node.y : 0);
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
  function classifyElement(text, fontSize, isBold, x, y, depth, parentName) {
    const upperText = text.toUpperCase();
    if (y < 200 && fontSize <= 24 && (upperText === text || parentName.toLowerCase().includes("label"))) {
      return "section_label";
    }
    if (fontSize >= 48 && isBold && y < 500) {
      return "headline";
    }
    if (text.startsWith('"') || text.startsWith('"')) {
      return "quote";
    }
    if (text.startsWith("\u2014") || text.startsWith("-")) {
      return "attribution";
    }
    if (text.startsWith("\u2022") || text.match(/^[-•]\s/)) {
      return "bullet";
    }
    if (depth >= 2 && fontSize >= 20 && fontSize <= 36 && text.length > 20) {
      return "accent_text";
    }
    if (depth >= 3 || parentName.toLowerCase().includes("diagram") || parentName.toLowerCase().includes("flow")) {
      return "diagram_text";
    }
    if (fontSize <= 18) {
      return "caption";
    }
    if (y > 400 && y < 650 && !isBold && fontSize >= 28 && fontSize <= 40) {
      return "subline";
    }
    return "body_text";
  }
  function buildElementInfos(textInfos) {
    return textInfos.map((info) => {
      const { node, depth, parentName, absoluteX, absoluteY, isTableCell, tableRow, tableCol } = info;
      const fontSize = typeof node.fontSize === "number" ? node.fontSize : 24;
      const isBold = node.fontName !== figma.mixed && node.fontName.style.includes("Bold");
      const elementType = isTableCell ? "table_cell" : classifyElement(node.characters, fontSize, isBold, absoluteX, absoluteY, depth, parentName);
      const result = {
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
        isInDiagram: depth >= 3 || parentName.toLowerCase().includes("diagram")
      };
      if (isTableCell) {
        result.isTableCell = true;
        result.tableRow = tableRow;
        result.tableCol = tableCol;
      }
      return result;
    });
  }
  var ADDABLE_CONTAINER_PATTERNS = [
    { pattern: "bullets-container", element_type: "bullet", hint: 'Add bullet points with action:"add"' },
    { pattern: "items-container", element_type: "item", hint: 'Add summary items with action:"add"' },
    { pattern: "columns-container", element_type: "column", hint: "Add columns (complex - may need clone instead)" }
  ];
  function findAddableContainers(slideNode, slideName) {
    const containers = [];
    function traverse(node) {
      if (node.type === "FRAME") {
        const frame = node;
        if (frame.layoutMode && frame.layoutMode !== "NONE") {
          for (const pattern of ADDABLE_CONTAINER_PATTERNS) {
            if (frame.name === pattern.pattern || frame.name.includes(pattern.pattern)) {
              const textChildren = frame.children.filter((c) => c.type === "TEXT");
              if (textChildren.length > 0) {
                containers.push({
                  id: frame.id,
                  name: frame.name,
                  slide_id: slideNode.id,
                  slide_name: slideName,
                  child_count: textChildren.length,
                  element_type: pattern.element_type,
                  hint: pattern.hint
                });
              }
              break;
            }
          }
        }
        for (const child of frame.children) {
          traverse(child);
        }
      } else if ("children" in node) {
        for (const child of node.children) {
          traverse(child);
        }
      }
    }
    traverse(slideNode);
    return containers;
  }
  function getRecursiveTextNodes(node) {
    if (node.type === "TEXT") return [node];
    if ("children" in node) {
      const result = [];
      for (const child of node.children) {
        result.push(...getRecursiveTextNodes(child));
      }
      return result;
    }
    return [];
  }
  function analyzeSlideContent(directTextNodes, parent) {
    var _a, _b, _c, _d, _e;
    if (parent) {
      const children = parent.children || [];
      const frameNodes = children.filter((n) => n.type === "FRAME");
      const frameNames = new Set(frameNodes.map((f) => f.name));
      const textNames = new Set(directTextNodes.map((t) => t.name));
      if (frameNames.has("bullets-container")) {
        const bulletsFrame = frameNodes.find((f) => f.name === "bullets-container");
        const headline = directTextNodes.find((t) => t.name === "headline");
        const bulletNodes = bulletsFrame ? getRecursiveTextNodes(bulletsFrame) : [];
        return {
          archetype: "bullets",
          content: {
            headline: (headline == null ? void 0 : headline.characters) || "",
            bullets: bulletNodes.map((t) => t.characters.replace(/^[•-]\s*/, ""))
          }
        };
      }
      if (frameNames.has("big-idea-container")) {
        const container = frameNodes.find((f) => f.name === "big-idea-container");
        const containerTexts = container ? getRecursiveTextNodes(container) : [];
        const headline = containerTexts.find((t) => t.name === "headline");
        const subline = containerTexts.find((t) => t.name === "subline");
        return {
          archetype: "big-idea",
          content: {
            headline: (headline == null ? void 0 : headline.characters) || "",
            subline: subline == null ? void 0 : subline.characters
          }
        };
      }
      if (frameNames.has("title-container") || frameNames.has("title-gradient-bg") || children.some((n) => n.name === "title-gradient-bg")) {
        const container = frameNodes.find((f) => f.name === "title-container");
        const containerTexts = container ? getRecursiveTextNodes(container) : directTextNodes;
        const headline = containerTexts.find((t) => t.name === "headline");
        const subline = containerTexts.find((t) => t.name === "subline");
        return {
          archetype: "title",
          content: {
            headline: (headline == null ? void 0 : headline.characters) || "",
            subline: subline == null ? void 0 : subline.characters
          }
        };
      }
      if (frameNames.has("section-container")) {
        const container = frameNodes.find((f) => f.name === "section-container");
        const containerTexts = container ? getRecursiveTextNodes(container) : [];
        const headline = containerTexts.find((t) => t.name === "headline");
        return {
          archetype: "section",
          content: {
            headline: (headline == null ? void 0 : headline.characters) || ""
          }
        };
      }
      if (frameNames.has("quote-container")) {
        const container = frameNodes.find((f) => f.name === "quote-container");
        const containerTexts = container ? getRecursiveTextNodes(container) : [];
        const quote = containerTexts.find((t) => t.name === "quote");
        const attribution = containerTexts.find((t) => t.name === "attribution");
        return {
          archetype: "quote",
          content: {
            quote: (quote == null ? void 0 : quote.characters.replace(/^[""]|[""]$/g, "")) || "",
            attribution: (attribution == null ? void 0 : attribution.characters.replace(/^[—-]\s*/, "")) || ""
          }
        };
      }
      if (frameNames.has("summary-container")) {
        const container = frameNodes.find((f) => f.name === "summary-container");
        const containerTexts = container ? getRecursiveTextNodes(container) : [];
        const headline = containerTexts.find((t) => t.name === "headline");
        const items = containerTexts.filter((t) => t.name.startsWith("item-"));
        items.sort((a, b) => {
          const aNum = parseInt(a.name.replace("item-", "")) || 0;
          const bNum = parseInt(b.name.replace("item-", "")) || 0;
          return aNum - bNum;
        });
        return {
          archetype: "summary",
          content: {
            headline: (headline == null ? void 0 : headline.characters) || "",
            items: items.map((t) => t.characters)
          }
        };
      }
      if (frameNames.has("video-container")) {
        const container = frameNodes.find((f) => f.name === "video-container");
        const containerTexts = container ? getRecursiveTextNodes(container) : [];
        const headline = containerTexts.find((t) => t.name === "headline");
        const videoUrl = containerTexts.find((t) => t.name === "video-url");
        const caption = containerTexts.find((t) => t.name === "caption");
        return {
          archetype: "video",
          content: {
            headline: (headline == null ? void 0 : headline.characters) || "",
            video_url: (videoUrl == null ? void 0 : videoUrl.characters) || "",
            caption: caption == null ? void 0 : caption.characters
          }
        };
      }
      if (frameNames.has("two-column-container")) {
        const container = frameNodes.find((f) => f.name === "two-column-container");
        const allTexts = container ? getRecursiveTextNodes(container) : [];
        const headline = allTexts.find((t) => t.name === "headline");
        const leftTitle = allTexts.find((t) => t.name === "left-title");
        const leftBody = allTexts.find((t) => t.name === "left-body");
        const rightTitle = allTexts.find((t) => t.name === "right-title");
        const rightBody = allTexts.find((t) => t.name === "right-body");
        return {
          archetype: "two-column",
          content: {
            headline: (headline == null ? void 0 : headline.characters) || "",
            left: { title: (leftTitle == null ? void 0 : leftTitle.characters) || "", body: (leftBody == null ? void 0 : leftBody.characters) || "" },
            right: { title: (rightTitle == null ? void 0 : rightTitle.characters) || "", body: (rightBody == null ? void 0 : rightBody.characters) || "" }
          }
        };
      }
      if (textNames.has("left-title") || textNames.has("right-title")) {
        const headline = directTextNodes.find((t) => t.name === "headline");
        const leftTitle = directTextNodes.find((t) => t.name === "left-title");
        const leftBody = directTextNodes.find((t) => t.name === "left-body");
        const rightTitle = directTextNodes.find((t) => t.name === "right-title");
        const rightBody = directTextNodes.find((t) => t.name === "right-body");
        return {
          archetype: "two-column",
          content: {
            headline: (headline == null ? void 0 : headline.characters) || "",
            left: { title: (leftTitle == null ? void 0 : leftTitle.characters) || "", body: (leftBody == null ? void 0 : leftBody.characters) || "" },
            right: { title: (rightTitle == null ? void 0 : rightTitle.characters) || "", body: (rightBody == null ? void 0 : rightBody.characters) || "" }
          }
        };
      }
      if (textNames.has("quote") && textNames.has("attribution")) {
        const quote = directTextNodes.find((t) => t.name === "quote");
        const attribution = directTextNodes.find((t) => t.name === "attribution");
        return {
          archetype: "quote",
          content: {
            quote: (quote == null ? void 0 : quote.characters.replace(/^[""]|[""]$/g, "")) || "",
            attribution: (attribution == null ? void 0 : attribution.characters.replace(/^[—-]\s*/, "")) || ""
          }
        };
      }
      if (Array.from(textNames).some((n) => n.startsWith("item-"))) {
        const headline = directTextNodes.find((t) => t.name === "headline");
        const items = directTextNodes.filter((t) => t.name.startsWith("item-"));
        items.sort((a, b) => {
          const aNum = parseInt(a.name.replace("item-", "")) || 0;
          const bNum = parseInt(b.name.replace("item-", "")) || 0;
          return aNum - bNum;
        });
        return {
          archetype: "summary",
          content: {
            headline: (headline == null ? void 0 : headline.characters) || "",
            items: items.map((t) => t.characters)
          }
        };
      }
      if (Array.from(textNames).some((n) => n.startsWith("stage-"))) {
        const headline = directTextNodes.find((t) => t.name === "headline");
        const stageLabels = directTextNodes.filter((t) => t.name.match(/^stage-\d+-label$/));
        const stageDescs = directTextNodes.filter((t) => t.name.match(/^stage-\d+-desc$/));
        const stages = [];
        stageLabels.sort((a, b) => {
          var _a2, _b2;
          const aNum = parseInt(((_a2 = a.name.match(/stage-(\d+)/)) == null ? void 0 : _a2[1]) || "0");
          const bNum = parseInt(((_b2 = b.name.match(/stage-(\d+)/)) == null ? void 0 : _b2[1]) || "0");
          return aNum - bNum;
        });
        for (const label of stageLabels) {
          const idx = (_a = label.name.match(/stage-(\d+)/)) == null ? void 0 : _a[1];
          const desc = stageDescs.find((d) => d.name === `stage-${idx}-desc`);
          stages.push({
            label: label.characters,
            description: desc == null ? void 0 : desc.characters
          });
        }
        return {
          archetype: "timeline",
          content: {
            headline: (headline == null ? void 0 : headline.characters) || "",
            stages
          }
        };
      }
      if (textNames.has("chart-placeholder")) {
        const headline = directTextNodes.find((t) => t.name === "headline");
        const takeaway = directTextNodes.find((t) => t.name === "takeaway");
        const chartText = directTextNodes.find((t) => t.name === "chart-placeholder");
        const chartType = ((_b = chartText == null ? void 0 : chartText.characters.match(/\[Chart:\s*(\w+)\]/)) == null ? void 0 : _b[1]) || "data";
        return {
          archetype: "chart",
          content: {
            headline: (headline == null ? void 0 : headline.characters) || "",
            chart: { type: chartType, placeholder: true },
            takeaway: takeaway == null ? void 0 : takeaway.characters
          }
        };
      }
      if (Array.from(textNames).some((n) => n.startsWith("col-") || n.startsWith("cell-"))) {
        const headline = directTextNodes.find((t) => t.name === "headline");
        const colNodes = directTextNodes.filter((t) => t.name.startsWith("col-"));
        const cellNodes = directTextNodes.filter((t) => t.name.startsWith("cell-"));
        colNodes.sort((a, b) => {
          const aNum = parseInt(a.name.replace("col-", "")) || 0;
          const bNum = parseInt(b.name.replace("col-", "")) || 0;
          return aNum - bNum;
        });
        const columns = colNodes.map((c) => c.characters);
        const rows = [];
        const cellMap = /* @__PURE__ */ new Map();
        for (const cell of cellNodes) {
          const match = cell.name.match(/cell-(\d+)-(\d+)/);
          if (match) {
            const [, rowStr, colStr] = match;
            const row = parseInt(rowStr);
            const col = parseInt(colStr);
            if (!cellMap.has(row)) cellMap.set(row, /* @__PURE__ */ new Map());
            cellMap.get(row).set(col, cell.characters);
          }
        }
        const rowNums = Array.from(cellMap.keys()).sort((a, b) => a - b);
        for (const rowNum of rowNums) {
          const rowCells = cellMap.get(rowNum);
          const colNums = Array.from(rowCells.keys()).sort((a, b) => a - b);
          rows.push(colNums.map((c) => rowCells.get(c) || ""));
        }
        return {
          archetype: "comparison",
          content: {
            headline: (headline == null ? void 0 : headline.characters) || "",
            columns,
            rows
          }
        };
      }
      if (textNames.size === 1 && textNames.has("headline")) {
        const headline = directTextNodes.find((t) => t.name === "headline");
        return {
          archetype: "section",
          content: { headline: (headline == null ? void 0 : headline.characters) || "" }
        };
      }
    }
    const texts = directTextNodes.map((t) => ({
      text: t.characters,
      x: t.x,
      y: t.y,
      fontSize: typeof t.fontSize === "number" ? t.fontSize : 24,
      isBold: t.fontName !== figma.mixed && t.fontName.style.includes("Bold"),
      width: t.width,
      node: t
    }));
    if (texts.length === 0) {
      return { archetype: "unknown", content: {} };
    }
    const claimed = /* @__PURE__ */ new Set();
    const largestText = texts.reduce((a, b) => a.fontSize > b.fontSize ? a : b);
    const bulletTexts = texts.filter((t) => t.text.startsWith("\u2022") || t.text.startsWith("-"));
    const hasQuote = texts.some((t) => t.text.startsWith('"') || t.text.startsWith('"'));
    const hasAttribution = texts.some((t) => t.text.startsWith("\u2014") || t.text.startsWith("-"));
    const leftTexts = texts.filter((t) => t.x < SLIDE_WIDTH / 2 - 100);
    const rightTexts = texts.filter((t) => t.x >= SLIDE_WIDTH / 2 - 100);
    const hasTwoColumns = leftTexts.length >= 2 && rightTexts.length >= 2;
    const hasChartPlaceholder = texts.some((t) => t.text.includes("[Chart"));
    const midYTexts = texts.filter((t) => t.y > 350 && t.y < 550);
    const hasTimelinePattern = midYTexts.length >= 3 && new Set(midYTexts.map((t) => Math.round(t.y / 50))).size <= 2;
    let archetype = "unknown";
    let content = {};
    if (largestText.fontSize >= 80 && texts.length <= 2) {
      archetype = "title";
      claimed.add(largestText.node);
      const sublineText = texts.find((t) => t !== largestText);
      if (sublineText) claimed.add(sublineText.node);
      content = {
        headline: largestText.text,
        subline: sublineText == null ? void 0 : sublineText.text
      };
    } else if (texts.length === 1 && largestText.fontSize >= 60) {
      archetype = "section";
      claimed.add(largestText.node);
      content = { headline: largestText.text };
    } else if (hasQuote && hasAttribution) {
      archetype = "quote";
      const quoteText = texts.find((t) => t.text.startsWith('"') || t.text.startsWith('"'));
      const attrText = texts.find((t) => t.text.startsWith("\u2014") || t.text.startsWith("-"));
      if (quoteText) claimed.add(quoteText.node);
      if (attrText) claimed.add(attrText.node);
      content = {
        quote: (quoteText == null ? void 0 : quoteText.text.replace(/^[""]|[""]$/g, "")) || "",
        attribution: (attrText == null ? void 0 : attrText.text.replace(/^[—-]\s*/, "")) || ""
      };
    } else if (bulletTexts.length >= 2) {
      archetype = "bullets";
      const headline = texts.find((t) => t.fontSize >= 48 && !t.text.startsWith("\u2022"));
      if (headline) claimed.add(headline.node);
      bulletTexts.forEach((t) => claimed.add(t.node));
      content = {
        headline: (headline == null ? void 0 : headline.text) || "",
        bullets: bulletTexts.map((t) => t.text.replace(/^[•-]\s*/, ""))
      };
    } else if (hasTwoColumns) {
      archetype = "two-column";
      const headline = texts.find((t) => t.fontSize >= 48);
      const leftBold = leftTexts.find((t) => t.isBold && t !== headline);
      const leftBody = leftTexts.find((t) => !t.isBold && t !== headline && t.fontSize < 40);
      const rightBold = rightTexts.find((t) => t.isBold);
      const rightBody = rightTexts.find((t) => !t.isBold && t.fontSize < 40);
      if (headline) claimed.add(headline.node);
      if (leftBold) claimed.add(leftBold.node);
      if (leftBody) claimed.add(leftBody.node);
      if (rightBold) claimed.add(rightBold.node);
      if (rightBody) claimed.add(rightBody.node);
      content = {
        headline: (headline == null ? void 0 : headline.text) || "",
        left: {
          title: (leftBold == null ? void 0 : leftBold.text) || "",
          body: (leftBody == null ? void 0 : leftBody.text) || ""
        },
        right: {
          title: (rightBold == null ? void 0 : rightBold.text) || "",
          body: (rightBody == null ? void 0 : rightBody.text) || ""
        }
      };
    } else if (hasChartPlaceholder) {
      archetype = "chart";
      const headline = texts.find((t) => t.fontSize >= 48);
      const takeaway = texts.find((t) => t.y > 700);
      const chartText = texts.find((t) => t.text.includes("[Chart"));
      if (headline) claimed.add(headline.node);
      if (takeaway) claimed.add(takeaway.node);
      if (chartText) claimed.add(chartText.node);
      const chartType = ((_c = chartText == null ? void 0 : chartText.text.match(/\[Chart:\s*(\w+)\]/)) == null ? void 0 : _c[1]) || "data";
      content = {
        headline: (headline == null ? void 0 : headline.text) || "",
        chart: { type: chartType, placeholder: true },
        takeaway: takeaway == null ? void 0 : takeaway.text
      };
    } else if (hasTimelinePattern) {
      archetype = "timeline";
      const headline = texts.find((t) => t.fontSize >= 48);
      if (headline) claimed.add(headline.node);
      const stageTexts = texts.filter((t) => t !== headline && t.y > 350);
      stageTexts.forEach((t) => claimed.add(t.node));
      const stageGroups = /* @__PURE__ */ new Map();
      for (const t of stageTexts) {
        const bucket = Math.round(t.x / 300) * 300;
        if (!stageGroups.has(bucket)) stageGroups.set(bucket, []);
        stageGroups.get(bucket).push(t);
      }
      const stages = Array.from(stageGroups.values()).map((group) => {
        var _a2, _b2;
        group.sort((a, b) => a.y - b.y);
        return {
          label: ((_a2 = group[0]) == null ? void 0 : _a2.text) || "",
          description: (_b2 = group[1]) == null ? void 0 : _b2.text
        };
      });
      content = {
        headline: (headline == null ? void 0 : headline.text) || "",
        stages
      };
    } else if (texts.length >= 3 && texts.length <= 5) {
      const headline = texts.find((t) => t.fontSize >= 60);
      const items = texts.filter((t) => t !== headline && t.fontSize >= 28 && t.fontSize <= 40);
      if (items.length >= 2) {
        archetype = "summary";
        if (headline) claimed.add(headline.node);
        items.forEach((t) => claimed.add(t.node));
        content = {
          headline: (headline == null ? void 0 : headline.text) || "",
          items: items.map((t) => t.text)
        };
      }
    } else if (largestText.fontSize >= 60 && texts.length === 2) {
      archetype = "big-idea";
      claimed.add(largestText.node);
      const subline = texts.find((t) => t !== largestText);
      if (subline) claimed.add(subline.node);
      content = {
        headline: largestText.text,
        subline: subline == null ? void 0 : subline.text
      };
    }
    if (archetype === "unknown") {
      if (texts[0]) claimed.add(texts[0].node);
      if (texts[1]) claimed.add(texts[1].node);
      content = {
        headline: ((_d = texts[0]) == null ? void 0 : _d.text) || "",
        subline: (_e = texts[1]) == null ? void 0 : _e.text
      };
    }
    const extras = texts.filter((t) => !claimed.has(t.node)).map((t) => t.text).filter((text) => text.trim().length > 0);
    return {
      archetype,
      content,
      extras: extras.length > 0 ? extras : void 0
    };
  }
  async function applyPatches(patches) {
    var _a, _b;
    let updated = 0;
    let added = 0;
    const failed = [];
    const fontSubstitutions = [];
    const newElements = [];
    await loadFontWithFallback();
    for (const patch of patches.changes) {
      const action = patch.action || "edit";
      try {
        const node = await figma.getNodeByIdAsync(patch.target);
        if (!node) {
          console.warn(`Node not found: ${patch.target}`);
          failed.push(patch.target);
          continue;
        }
        if (action === "add") {
          if (node.type !== "FRAME") {
            console.warn(`Add target ${patch.target} is not a frame (type: ${node.type})`);
            failed.push(patch.target);
            continue;
          }
          const frame = node;
          const textSiblings = frame.children.filter((c) => c.type === "TEXT");
          if (textSiblings.length === 0) {
            console.warn(`No text siblings found in ${patch.target} to copy styles from`);
            failed.push(patch.target);
            continue;
          }
          const sibling = textSiblings[textSiblings.length - 1];
          let fontName2 = sibling.fontName;
          let fontLoaded2 = false;
          if (fontName2 !== figma.mixed) {
            try {
              await figma.loadFontAsync(fontName2);
              fontLoaded2 = true;
            } catch (e) {
              const wasBold = fontName2.style.includes("Bold");
              const originalFontInfo = `${fontName2.family} ${fontName2.style}`;
              for (const fallbackFamily of FONT_FALLBACKS) {
                try {
                  const fallbackFont = { family: fallbackFamily, style: wasBold ? "Bold" : "Regular" };
                  await figma.loadFontAsync(fallbackFont);
                  fontName2 = fallbackFont;
                  fontLoaded2 = true;
                  fontSubstitutions.push(`${originalFontInfo} \u2192 ${fallbackFamily}`);
                  break;
                } catch (e2) {
                  continue;
                }
              }
            }
          }
          if (!fontLoaded2) {
            fontName2 = await getFontName(false);
          }
          const newText = figma.createText();
          newText.fontName = fontName2;
          newText.fontSize = typeof sibling.fontSize === "number" ? sibling.fontSize : 36;
          newText.fills = sibling.fills !== figma.mixed ? sibling.fills : [{ type: "SOLID", color: COLORS.body }];
          newText.characters = patch.text;
          if (sibling.textAutoResize) {
            newText.textAutoResize = sibling.textAutoResize;
          }
          if (sibling.width > 0) {
            newText.resize(sibling.width, newText.height);
            newText.textAutoResize = "HEIGHT";
          }
          const bulletMatch = (_a = textSiblings[0]) == null ? void 0 : _a.name.match(/^bullet-(\d+)$/);
          const itemMatch = (_b = textSiblings[0]) == null ? void 0 : _b.name.match(/^item-(\d+)$/);
          if (bulletMatch) {
            newText.name = `bullet-${textSiblings.length}`;
          } else if (itemMatch) {
            newText.name = `item-${textSiblings.length}`;
          } else {
            newText.name = `text-${textSiblings.length}`;
          }
          const pos = patch.position;
          if (pos !== void 0 && pos >= 0 && pos < frame.children.length) {
            frame.insertChild(pos, newText);
          } else {
            frame.appendChild(newText);
          }
          newElements.push({ id: newText.id, name: newText.name, container: frame.name });
          added++;
          console.log(`Added ${newText.name} to ${frame.name}: "${patch.text.substring(0, 30)}..."`);
          continue;
        }
        if (node.type !== "TEXT") {
          console.warn(`Node ${patch.target} is not a text node (type: ${node.type})`);
          failed.push(patch.target);
          continue;
        }
        const textNode = node;
        const fontName = textNode.fontName;
        let fontLoaded = false;
        if (fontName !== figma.mixed) {
          try {
            await figma.loadFontAsync(fontName);
            fontLoaded = true;
          } catch (e) {
            const originalFontInfo = `${fontName.family} ${fontName.style}`;
            const wasBold = fontName.style.includes("Bold");
            for (const fallbackFamily of FONT_FALLBACKS) {
              try {
                const fallbackFont = { family: fallbackFamily, style: wasBold ? "Bold" : "Regular" };
                await figma.loadFontAsync(fallbackFont);
                textNode.fontName = fallbackFont;
                fontLoaded = true;
                fontSubstitutions.push(`${originalFontInfo} \u2192 ${fallbackFamily}`);
                console.log(`Font fallback for ${patch.target}: ${originalFontInfo} \u2192 ${fallbackFamily}`);
                break;
              } catch (e2) {
                continue;
              }
            }
          }
        } else {
          const fallbackFont = await getFontName(false);
          textNode.fontName = fallbackFont;
          fontLoaded = true;
          fontSubstitutions.push(`mixed \u2192 ${fallbackFont.family}`);
        }
        if (!fontLoaded) {
          console.warn(`No fonts available for ${patch.target}`);
          failed.push(patch.target);
          continue;
        }
        textNode.characters = patch.text;
        updated++;
        console.log(`Patched ${patch.target}: "${patch.text.substring(0, 30)}..."`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`Failed to patch ${patch.target}:`, errorMsg);
        failed.push(patch.target);
      }
    }
    return { updated, added, failed, fontSubstitutions, newElements };
  }
  figma.ui.onmessage = async (msg) => {
    var _a, _b;
    try {
      if (msg.type === "apply-ir") {
        if (!msg.ir) {
          figma.notify("No IR provided", { error: true });
          return;
        }
        const ir = parseIR(msg.ir);
        if (!ir) {
          figma.notify("Failed to parse IR", { error: true });
          return;
        }
        const editorMode = isInSlides() ? "Figma Slides" : "Figma Design";
        console.log(`Editor: ${figma.editorType}, Mode: ${editorMode}`);
        await loadFontWithFallback();
        const pushMode = msg.mode || "append";
        let replacedCount = 0;
        if (pushMode === "replace") {
          console.log("Replace mode: deleting all existing slides");
          const slidesToDelete = [];
          if (isInSlides()) {
            let findAllSlides2 = function(node) {
              if (node.type === "SLIDE") {
                slidesToDelete.push(node);
              } else if ("children" in node) {
                for (const child of node.children) {
                  findAllSlides2(child);
                }
              }
            };
            var findAllSlides = findAllSlides2;
            for (const node of figma.currentPage.children) {
              findAllSlides2(node);
            }
          } else {
            for (const node of figma.currentPage.children) {
              if (node.type === "FRAME" && node.width === 1920 && node.height === 1080) {
                slidesToDelete.push(node);
              }
            }
          }
          for (const slide of slidesToDelete) {
            try {
              slide.remove();
              replacedCount++;
            } catch (e) {
              console.warn(`Failed to delete slide: ${e}`);
            }
          }
          console.log(`Deleted ${replacedCount} existing slides`);
          await figma.clientStorage.setAsync(MAPPING_KEY, {});
        }
        const existingMapping = pushMode === "replace" ? {} : await figma.clientStorage.getAsync(MAPPING_KEY) || {};
        const mapping = __spreadValues({}, existingMapping);
        const startIndex = msg.startIndex;
        let slideContainer = null;
        if (startIndex !== void 0 && isInSlides()) {
          let findSlideContainer2 = function(node) {
            if (node.type === "SLIDE_ROW") return node;
            if ("children" in node) {
              for (const child of node.children) {
                const found = findSlideContainer2(child);
                if (found) return found;
              }
            }
            return null;
          };
          var findSlideContainer = findSlideContainer2;
          for (const node of figma.currentPage.children) {
            slideContainer = findSlideContainer2(node);
            if (slideContainer) break;
          }
        }
        let created = 0;
        let updated = 0;
        let skipped = 0;
        const createdNames = [];
        const updatedNames = [];
        for (let i = 0; i < ir.slides.length; i++) {
          const slide = ir.slides[i];
          const existingFigmaId = mapping[slide.id];
          try {
            let existingNode = null;
            if (existingFigmaId) {
              existingNode = await figma.getNodeByIdAsync(existingFigmaId);
            }
            if (slide.status === "locked" && existingNode) {
              console.log(`Skipping locked slide: ${slide.id}`);
              skipped++;
              figma.notify(`Skipped ${slide.id} (locked)`);
              continue;
            }
            if (existingNode) {
              const existingArchetype = detectExistingArchetype(existingNode);
              if (existingArchetype === slide.archetype) {
                console.log(`Updating slide ${i + 1} in place: ${slide.archetype}`);
                const slideName = slide.content.headline || slide.archetype;
                existingNode.name = slideName;
                await updateContentInPlace(existingNode, slide);
                updated++;
                updatedNames.push(slideName);
                figma.notify(`Updated: "${slideName}"`);
              } else {
                console.log(`Re-rendering slide ${i + 1}: ${existingArchetype} \u2192 ${slide.archetype}`);
                const children = [...existingNode.children];
                for (const child of children) {
                  child.remove();
                }
                const slideName = slide.content.headline || slide.archetype;
                existingNode.name = slideName;
                if (isInSlides()) {
                  setSlideBackground(existingNode);
                }
                await addContentToParent(existingNode, slide);
                updated++;
                updatedNames.push(slideName);
                figma.notify(`Re-rendered: "${slideName}"`);
              }
            } else {
              console.log(`Creating slide ${i + 1}: ${slide.archetype}`);
              const node = await createSlideWithContent(slide, i);
              const slideName = slide.content.headline || slide.archetype;
              if (startIndex !== void 0 && slideContainer && isInSlides()) {
                const targetPosition = startIndex + created;
                const currentIndex = slideContainer.children.indexOf(node);
                if (currentIndex !== -1 && currentIndex !== targetPosition) {
                  const clampedTarget = Math.min(targetPosition, slideContainer.children.length - 1);
                  slideContainer.insertChild(clampedTarget, node);
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
        const summary = [];
        if (replacedCount > 0) {
          summary.push(`Replaced ${replacedCount} old slides`);
        }
        if (created > 0) {
          const createList = createdNames.length <= 2 ? createdNames.map((n) => `"${n}"`).join(", ") : `${created} slides`;
          summary.push(`Created: ${createList}`);
        }
        if (updated > 0) {
          const updateList = updatedNames.length <= 2 ? updatedNames.map((n) => `"${n}"`).join(", ") : `${updated} slides`;
          summary.push(`Updated: ${updateList}`);
        }
        if (skipped > 0) summary.push(`${skipped} skipped (locked)`);
        const positionText = pushMode === "append" && startIndex !== void 0 ? ` at position ${startIndex}` : "";
        figma.notify(`\u2713 ${summary.join(" \u2022 ")}${positionText}`, { timeout: 3e3 });
        figma.ui.postMessage({
          type: "applied",
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
      if (msg.type === "export-ir") {
        const slides = [];
        const storedMapping = await figma.clientStorage.getAsync(MAPPING_KEY) || {};
        const reverseMapping = {};
        for (const [irId, figmaId] of Object.entries(storedMapping)) {
          reverseMapping[figmaId] = irId;
        }
        const slideNodes = [];
        if (isInSlides()) {
          let findSlides2 = function(node) {
            if (node.type === "SLIDE") {
              slideNodes.push(node);
              return;
            }
            if ("children" in node) {
              for (const child of node.children) {
                findSlides2(child);
              }
            }
          };
          var findSlides = findSlides2;
          for (const node of figma.currentPage.children) {
            findSlides2(node);
          }
        } else {
          for (const node of figma.currentPage.children) {
            if (node.type === "FRAME" && node.name.includes("Slide")) {
              slideNodes.push(node);
            }
          }
        }
        const allContainers = [];
        for (const node of slideNodes) {
          try {
            const allTextInfos = getAllTextNodes(node);
            const elements = buildElementInfos(allTextInfos);
            const hasDiagram = elements.some((e) => e.isInDiagram) || elements.filter((e) => e.depth >= 2).length > 5;
            elements.sort((a, b) => {
              if (Math.abs(a.y - b.y) > 50) return a.y - b.y;
              return a.x - b.x;
            });
            const children = node.children || [];
            const directTextNodes = children.filter((n) => n.type === "TEXT");
            directTextNodes.sort((a, b) => {
              if (Math.abs(a.y - b.y) > 50) return a.y - b.y;
              return a.x - b.x;
            });
            const analysis = analyzeSlideContent(directTextNodes, node);
            const slideId = reverseMapping[node.id] || `slide-${slides.length + 1}`;
            slides.push({
              id: slideId,
              figma_id: node.id,
              archetype: analysis.archetype,
              status: "draft",
              content: analysis.content,
              extras: analysis.extras,
              // Rich read fields
              elements,
              has_diagram: hasDiagram
            });
            const slideContainers = findAddableContainers(node, node.name || slideId);
            allContainers.push(...slideContainers);
          } catch (err) {
            console.error(`Error processing slide "${node.name}":`, err);
          }
        }
        const ir = {
          deck: { title: "Pulled Deck" },
          slides,
          containers: allContainers.length > 0 ? allContainers : void 0
        };
        const richSlides = slides.filter((s) => {
          var _a2;
          return (((_a2 = s.elements) == null ? void 0 : _a2.length) || 0) > 0;
        }).length;
        const diagramSlides = slides.filter((s) => s.has_diagram).length;
        const containerCount = allContainers.length;
        figma.ui.postMessage({ type: "exported", ir: JSON.stringify(ir, null, 2) });
        const stats = [`${slides.length} slides`, `${richSlides} with elements`];
        if (diagramSlides > 0) stats.push(`${diagramSlides} with diagrams`);
        if (containerCount > 0) stats.push(`${containerCount} addable containers`);
        figma.notify(`Pulled ${stats.join(", ")}`);
      }
      if (msg.type === "patch-elements") {
        if (!msg.patches || !msg.patches.changes || msg.patches.changes.length === 0) {
          figma.notify("No patches provided", { error: true });
          figma.ui.postMessage({ type: "patched", updated: 0, failed: [], fontSubstitutions: [] });
          return;
        }
        const result = await applyPatches(msg.patches);
        const parts = [];
        if (result.updated > 0) parts.push(`${result.updated} edited`);
        if (result.added > 0) parts.push(`${result.added} added`);
        let notifyMsg = result.failed.length > 0 ? `Patched: ${parts.join(", ")} (${result.failed.length} failed)` : `\u2713 Patched: ${parts.join(", ") || "no changes"}`;
        if (result.fontSubstitutions.length > 0) {
          const uniqueSubs = [...new Set(result.fontSubstitutions)];
          notifyMsg += ` (${uniqueSubs.length} font sub${uniqueSubs.length > 1 ? "s" : ""})`;
        }
        figma.notify(notifyMsg, { error: result.failed.length > 0 });
        figma.ui.postMessage(__spreadValues({ type: "patched" }, result));
      }
      if (msg.type === "capture-template") {
        let countNodes2 = function(node) {
          let count = 1;
          if (node.children) {
            for (const child of node.children) {
              count += countNodes2(child);
            }
          }
          return count;
        };
        var countNodes = countNodes2;
        let targetNode = null;
        const requestedSlideId = msg.slideId;
        if (requestedSlideId) {
          targetNode = await figma.getNodeByIdAsync(requestedSlideId);
          if (!targetNode) {
            figma.notify(`Slide not found: ${requestedSlideId}`, { error: true });
            figma.ui.postMessage({ type: "template-captured", error: `Slide not found: ${requestedSlideId}` });
            return;
          }
        } else if (figma.currentPage.selection.length > 0) {
          targetNode = figma.currentPage.selection[0];
        } else {
          if (isInSlides()) {
            let findFirstSlide2 = function(node) {
              if (node.type === "SLIDE") return node;
              if ("children" in node) {
                for (const child of node.children) {
                  const found = findFirstSlide2(child);
                  if (found) return found;
                }
              }
              return null;
            };
            var findFirstSlide = findFirstSlide2;
            for (const node of figma.currentPage.children) {
              targetNode = findFirstSlide2(node);
              if (targetNode) break;
            }
          }
        }
        if (!targetNode) {
          figma.notify("No slide selected or found", { error: true });
          figma.ui.postMessage({ type: "template-captured", error: "No slide selected or found" });
          return;
        }
        const captured = captureNodeTree(targetNode);
        const nodeCount = countNodes2(captured);
        figma.ui.postMessage({
          type: "template-captured",
          template: JSON.stringify(captured, null, 2),
          nodeCount
        });
        figma.notify(`Captured template: ${nodeCount} nodes from "${targetNode.name}"`);
      }
      if (msg.type === "create-styled-slide") {
        const layout = msg.layout;
        const content = msg.content;
        const ds = msg.designSystem;
        try {
          const getBgColor = () => {
            var _a2;
            if ((_a2 = ds == null ? void 0 : ds.background) == null ? void 0 : _a2.color) return ds.background.color;
            return COLORS.bg;
          };
          const getAccentColor = () => {
            var _a2;
            const accent = (_a2 = ds == null ? void 0 : ds.colors) == null ? void 0 : _a2.find((c) => {
              var _a3, _b2;
              return ((_a3 = c.name) == null ? void 0 : _a3.includes("accent")) || ((_b2 = c.name) == null ? void 0 : _b2.includes("green"));
            });
            if (accent == null ? void 0 : accent.rgb) return accent.rgb;
            return { r: 0.8, g: 1, b: 0.24 };
          };
          const getTextColor = () => {
            var _a2;
            const light = (_a2 = ds == null ? void 0 : ds.colors) == null ? void 0 : _a2.find((c) => c.name === "light" || c.hex === "#ffffff");
            if (light == null ? void 0 : light.rgb) return light.rgb;
            return COLORS.white;
          };
          const getHeadlineFont = () => {
            var _a2;
            const headlineFont2 = (_a2 = ds == null ? void 0 : ds.fonts) == null ? void 0 : _a2.find(
              (f) => {
                var _a3;
                return (_a3 = f.usage) == null ? void 0 : _a3.some((u) => u.includes("headline") || u.includes("10"));
              }
            );
            if (headlineFont2) {
              return {
                family: headlineFont2.family,
                style: headlineFont2.style,
                size: Math.max(...headlineFont2.sizes || [48])
              };
            }
            return { family: "Inter", style: "Bold", size: 48 };
          };
          const getBodyFont = () => {
            var _a2, _b2;
            const bodyFont2 = (_a2 = ds == null ? void 0 : ds.fonts) == null ? void 0 : _a2.find(
              (f) => {
                var _a3;
                return f.family === "Geist" || ((_a3 = f.usage) == null ? void 0 : _a3.some((u) => u.includes("Card")));
              }
            );
            if (bodyFont2) {
              return {
                family: bodyFont2.family,
                style: bodyFont2.style,
                size: ((_b2 = bodyFont2.sizes) == null ? void 0 : _b2[0]) || 22
              };
            }
            return { family: "Inter", style: "Regular", size: 22 };
          };
          let slide;
          if (isInSlides()) {
            slide = figma.createSlide();
          } else {
            const frame = figma.createFrame();
            frame.resize(SLIDE_WIDTH, SLIDE_HEIGHT);
            slide = frame;
          }
          const bgColor = getBgColor();
          if ("fills" in slide) {
            slide.fills = [{ type: "SOLID", color: bgColor }];
          }
          const headlineFont = getHeadlineFont();
          const bodyFont = getBodyFont();
          let headlineFontName = { family: "Inter", style: "Bold" };
          let bodyFontName = { family: "Inter", style: "Regular" };
          try {
            await figma.loadFontAsync({ family: headlineFont.family, style: headlineFont.style });
            headlineFontName = { family: headlineFont.family, style: headlineFont.style };
          } catch (e) {
            headlineFontName = await getFontName(true);
          }
          try {
            await figma.loadFontAsync({ family: bodyFont.family, style: bodyFont.style });
            bodyFontName = { family: bodyFont.family, style: bodyFont.style };
          } catch (e) {
            bodyFontName = await getFontName(false);
          }
          const accentColor = getAccentColor();
          const textColor = getTextColor();
          const cornerRadius = ((_a = ds == null ? void 0 : ds.corners) == null ? void 0 : _a.cardRadius) || 8;
          switch (layout) {
            case "quote": {
              slide.name = content.attribution ? `Quote: ${content.attribution}` : "Quote";
              const quoteText = figma.createText();
              quoteText.fontName = headlineFontName;
              quoteText.fontSize = 36;
              quoteText.fills = [{ type: "SOLID", color: textColor }];
              quoteText.characters = `"${content.quote || "Quote goes here"}"`;
              quoteText.x = 200;
              quoteText.y = 400;
              quoteText.resize(1520, quoteText.height);
              quoteText.textAutoResize = "HEIGHT";
              quoteText.textAlignHorizontal = "CENTER";
              slide.appendChild(quoteText);
              if (content.attribution) {
                const attrText = figma.createText();
                attrText.fontName = bodyFontName;
                attrText.fontSize = 20;
                attrText.fills = [{ type: "SOLID", color: accentColor }];
                attrText.characters = `\u2014 ${content.attribution}`;
                attrText.x = 200;
                attrText.y = 550;
                attrText.resize(1520, attrText.height);
                attrText.textAlignHorizontal = "CENTER";
                slide.appendChild(attrText);
              }
              break;
            }
            case "bullets": {
              slide.name = content.headline || "Bullets";
              const headline = figma.createText();
              headline.fontName = headlineFontName;
              headline.fontSize = headlineFont.size;
              headline.fills = [{ type: "SOLID", color: textColor }];
              headline.characters = content.headline || "Headline";
              headline.x = 60;
              headline.y = 150;
              headline.resize(800, headline.height);
              headline.textAutoResize = "HEIGHT";
              slide.appendChild(headline);
              const bulletsFrame = figma.createFrame();
              bulletsFrame.name = "Bullets";
              bulletsFrame.layoutMode = "VERTICAL";
              bulletsFrame.itemSpacing = ((_b = ds == null ? void 0 : ds.spacing) == null ? void 0 : _b.itemSpacing) || 24;
              bulletsFrame.primaryAxisSizingMode = "AUTO";
              bulletsFrame.counterAxisSizingMode = "AUTO";
              bulletsFrame.fills = [];
              bulletsFrame.x = 60;
              bulletsFrame.y = 300;
              const bullets = content.bullets || ["First point", "Second point", "Third point"];
              for (const bullet of bullets) {
                const bulletText = figma.createText();
                bulletText.fontName = bodyFontName;
                bulletText.fontSize = bodyFont.size;
                bulletText.fills = [{ type: "SOLID", color: textColor }];
                bulletText.characters = `\u2022 ${bullet}`;
                bulletText.resize(800, bulletText.height);
                bulletText.textAutoResize = "HEIGHT";
                bulletsFrame.appendChild(bulletText);
              }
              slide.appendChild(bulletsFrame);
              break;
            }
            case "big-idea": {
              slide.name = content.headline || "Big Idea";
              const headline = figma.createText();
              headline.fontName = headlineFontName;
              headline.fontSize = 56;
              headline.fills = [{ type: "SOLID", color: textColor }];
              headline.characters = content.headline || "The big idea";
              headline.x = 200;
              headline.y = 380;
              headline.resize(1520, headline.height);
              headline.textAutoResize = "HEIGHT";
              slide.appendChild(headline);
              if (content.subline) {
                const subline = figma.createText();
                subline.fontName = bodyFontName;
                subline.fontSize = 24;
                subline.fills = [{ type: "SOLID", color: { r: textColor.r * 0.7, g: textColor.g * 0.7, b: textColor.b * 0.7 } }];
                subline.characters = content.subline;
                subline.x = 200;
                subline.y = 500;
                subline.resize(1520, subline.height);
                subline.textAutoResize = "HEIGHT";
                slide.appendChild(subline);
              }
              break;
            }
            case "section": {
              slide.name = content.headline || "Section";
              const labelFrame = figma.createFrame();
              labelFrame.name = "Section Label";
              labelFrame.layoutMode = "HORIZONTAL";
              labelFrame.paddingTop = 12;
              labelFrame.paddingBottom = 12;
              labelFrame.paddingLeft = 16;
              labelFrame.paddingRight = 16;
              labelFrame.primaryAxisSizingMode = "AUTO";
              labelFrame.counterAxisSizingMode = "AUTO";
              labelFrame.fills = [];
              labelFrame.strokes = [{ type: "SOLID", color: accentColor }];
              labelFrame.strokeWeight = 2;
              labelFrame.cornerRadius = cornerRadius;
              labelFrame.x = 60;
              labelFrame.y = 480;
              const labelText = figma.createText();
              labelText.fontName = headlineFontName;
              labelText.fontSize = 24;
              labelText.fills = [{ type: "SOLID", color: accentColor }];
              labelText.characters = (content.headline || "SECTION").toUpperCase();
              labelFrame.appendChild(labelText);
              slide.appendChild(labelFrame);
              break;
            }
          }
          figma.currentPage.selection = [slide];
          figma.viewport.scrollAndZoomIntoView([slide]);
          figma.notify(`\u2713 Created "${layout}" slide`);
          figma.ui.postMessage({
            type: "styled-slide-created",
            success: true,
            slideId: slide.id
          });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error("Create styled slide error:", errorMsg);
          figma.notify(`Error: ${errorMsg}`, { error: true });
          figma.ui.postMessage({ type: "styled-slide-created", success: false, error: errorMsg });
        }
      }
      if (msg.type === "instantiate-template") {
        const sourceId = msg.sourceId;
        const contentMap = msg.contentMap;
        if (!sourceId) {
          figma.notify("No source slide ID provided", { error: true });
          figma.ui.postMessage({ type: "instantiated", success: false, error: "No source ID" });
          return;
        }
        try {
          const sourceNode = await figma.getNodeByIdAsync(sourceId);
          if (!sourceNode) {
            figma.notify(`Source slide not found: ${sourceId}`, { error: true });
            figma.ui.postMessage({ type: "instantiated", success: false, error: "Source not found" });
            return;
          }
          const clonedSlide = sourceNode.clone();
          clonedSlide.name = `${sourceNode.name} (copy)`;
          if (sourceNode.type === "SLIDE") {
            const parent = sourceNode.parent;
            if (parent && "insertChild" in parent) {
              const sourceIndex = parent.children.indexOf(sourceNode);
              parent.insertChild(sourceIndex + 1, clonedSlide);
            }
          }
          await loadFontWithFallback();
          let updated = 0;
          const failed = [];
          const fontSubstitutions = [];
          async function updateTextNodes(original, cloned, contentMap2) {
            if (original.id in contentMap2 && cloned.type === "TEXT") {
              const textNode = cloned;
              const newText = contentMap2[original.id];
              try {
                const fontName = textNode.fontName;
                if (fontName === figma.mixed) {
                  const len = textNode.characters.length;
                  for (let i = 0; i < len; i++) {
                    const segmentFont = textNode.getRangeFontName(i, i + 1);
                    if (segmentFont !== figma.mixed) {
                      await figma.loadFontAsync(segmentFont);
                    }
                  }
                } else {
                  await figma.loadFontAsync(fontName);
                }
                textNode.characters = newText;
                updated++;
              } catch (fontError) {
                const originalFontInfo = textNode.fontName !== figma.mixed ? `${textNode.fontName.family} ${textNode.fontName.style}` : "mixed fonts";
                let fallbackSucceeded = false;
                for (const fallbackFamily of FONT_FALLBACKS) {
                  try {
                    const wasBold = textNode.fontName !== figma.mixed && textNode.fontName.style.includes("Bold");
                    const fallbackStyle = wasBold ? "Bold" : "Regular";
                    const fallbackFont = { family: fallbackFamily, style: fallbackStyle };
                    await figma.loadFontAsync(fallbackFont);
                    textNode.fontName = fallbackFont;
                    textNode.characters = newText;
                    updated++;
                    fallbackSucceeded = true;
                    fontSubstitutions.push(`${originalFontInfo} \u2192 ${fallbackFamily}`);
                    console.log(`Used fallback font ${fallbackFamily} for node ${original.id} (original: ${originalFontInfo})`);
                    break;
                  } catch (e) {
                    continue;
                  }
                }
                if (!fallbackSucceeded) {
                  console.warn(`Skipping text node ${original.id}: no fonts available (tried ${originalFontInfo} and fallbacks)`);
                  failed.push(`${original.id} (font: ${originalFontInfo})`);
                }
              }
            }
            if ("children" in original && "children" in cloned) {
              const origChildren = original.children;
              const clonedChildren = cloned.children;
              for (let i = 0; i < Math.min(origChildren.length, clonedChildren.length); i++) {
                await updateTextNodes(origChildren[i], clonedChildren[i], contentMap2);
              }
            }
          }
          await updateTextNodes(sourceNode, clonedSlide, contentMap || {});
          figma.currentPage.selection = [clonedSlide];
          figma.viewport.scrollAndZoomIntoView([clonedSlide]);
          let notifyMsg = `\u2713 Created new slide with ${updated} text updates`;
          if (fontSubstitutions.length > 0) {
            const uniqueSubs = [...new Set(fontSubstitutions)];
            notifyMsg += ` (${uniqueSubs.length} font substitution${uniqueSubs.length > 1 ? "s" : ""})`;
          }
          figma.notify(notifyMsg);
          figma.ui.postMessage({
            type: "instantiated",
            success: true,
            newSlideId: clonedSlide.id,
            updated,
            failed,
            fontSubstitutions: [...new Set(fontSubstitutions)]
            // Deduplicated
          });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error("Instantiate error:", errorMsg);
          figma.notify(`Error: ${errorMsg}`, { error: true });
          figma.ui.postMessage({ type: "instantiated", success: false, error: errorMsg });
        }
      }
      if (msg.type === "delete-slides") {
        const slideIds = msg.slideIds;
        if (!slideIds || slideIds.length === 0) {
          figma.notify("No slide IDs provided", { error: true });
          figma.ui.postMessage({ type: "slides-deleted", deleted: 0, failed: [], deletedNames: [] });
          return;
        }
        let deleted = 0;
        const failed = [];
        const deletedNames = [];
        for (const slideId of slideIds) {
          try {
            const node = await figma.getNodeByIdAsync(slideId);
            if (!node) {
              console.warn(`Slide not found: ${slideId}`);
              failed.push(slideId);
              continue;
            }
            if (node.type !== "SLIDE" && node.type !== "FRAME") {
              console.warn(`Node ${slideId} is not a slide (type: ${node.type})`);
              failed.push(slideId);
              continue;
            }
            const slideName = node.name || slideId;
            const mapping = await figma.clientStorage.getAsync(MAPPING_KEY) || {};
            for (const [irId, figmaId] of Object.entries(mapping)) {
              if (figmaId === slideId) {
                delete mapping[irId];
              }
            }
            await figma.clientStorage.setAsync(MAPPING_KEY, mapping);
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
        if (deleted > 0) {
          const nameList = deletedNames.length <= 3 ? deletedNames.map((n) => `"${n}"`).join(", ") : `"${deletedNames[0]}" + ${deletedNames.length - 1} more`;
          figma.notify(`\u2713 Deleted: ${nameList}`);
        }
        if (failed.length > 0) {
          figma.notify(`${failed.length} slides not found`, { error: true });
        }
        figma.ui.postMessage({ type: "slides-deleted", deleted, failed, deletedNames });
      }
      if (msg.type === "reorder-slides") {
        const slideIds = msg.slideIds;
        if (!slideIds || slideIds.length === 0) {
          figma.notify("No slide IDs provided", { error: true });
          figma.ui.postMessage({ type: "slides-reordered", success: false, error: "No slide IDs provided" });
          return;
        }
        try {
          const slides = [];
          const beforeOrder = [];
          const afterOrder = [];
          for (const slideId of slideIds) {
            const node = await figma.getNodeByIdAsync(slideId);
            if (node && (node.type === "SLIDE" || node.type === "FRAME")) {
              slides.push(node);
              afterOrder.push(node.name || slideId);
            } else {
              console.warn(`Slide not found or wrong type: ${slideId}`);
            }
          }
          if (slides.length === 0) {
            figma.ui.postMessage({ type: "slides-reordered", success: false, error: "No valid slides found" });
            return;
          }
          const parent = slides[0].parent;
          if (!parent || !("insertChild" in parent)) {
            figma.ui.postMessage({ type: "slides-reordered", success: false, error: "Cannot access slide container" });
            return;
          }
          const currentChildren = parent.children || [];
          for (const child of currentChildren) {
            if (child.type === "SLIDE" || child.type === "FRAME") {
              beforeOrder.push(child.name || child.id);
            }
          }
          for (let i = slides.length - 1; i >= 0; i--) {
            const slide = slides[i];
            parent.insertChild(0, slide);
          }
          const movedSlides = [];
          for (let i = 0; i < Math.min(beforeOrder.length, afterOrder.length); i++) {
            if (beforeOrder[i] !== afterOrder[i]) {
              movedSlides.push(afterOrder[i]);
            }
          }
          if (movedSlides.length > 0) {
            const moveList = movedSlides.length <= 2 ? movedSlides.map((n) => `"${n}"`).join(", ") : `${movedSlides.length} slides`;
            figma.notify(`\u2713 Reordered: ${moveList} moved`);
          } else {
            figma.notify(`\u2713 Order unchanged (${slides.length} slides)`);
          }
          figma.ui.postMessage({
            type: "slides-reordered",
            success: true,
            count: slides.length,
            beforeOrder,
            afterOrder
          });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error("Reorder error:", errorMsg);
          figma.notify(`Error: ${errorMsg}`, { error: true });
          figma.ui.postMessage({ type: "slides-reordered", success: false, error: errorMsg });
        }
      }
      if (msg.type === "export-screenshot") {
        const requestedSlideId = msg.slideId;
        const scale = msg.scale || 0.5;
        let targetNode = null;
        if (requestedSlideId) {
          targetNode = await figma.getNodeByIdAsync(requestedSlideId);
          if (!targetNode) {
            figma.notify(`Slide not found: ${requestedSlideId}`, { error: true });
            figma.ui.postMessage({ type: "screenshot-exported", error: `Slide not found: ${requestedSlideId}` });
            return;
          }
        } else if (figma.currentPage.selection.length > 0) {
          targetNode = figma.currentPage.selection[0];
        } else {
          if (isInSlides()) {
            let findFirstSlide2 = function(node) {
              if (node.type === "SLIDE") return node;
              if ("children" in node) {
                for (const child of node.children) {
                  const found = findFirstSlide2(child);
                  if (found) return found;
                }
              }
              return null;
            };
            var findFirstSlide = findFirstSlide2;
            for (const node of figma.currentPage.children) {
              targetNode = findFirstSlide2(node);
              if (targetNode) break;
            }
          }
        }
        if (!targetNode) {
          figma.notify("No slide found to screenshot", { error: true });
          figma.ui.postMessage({ type: "screenshot-exported", error: "No slide found" });
          return;
        }
        try {
          const pngData = await targetNode.exportAsync({
            format: "PNG",
            constraint: { type: "SCALE", value: scale }
          });
          const base64 = figma.base64Encode(pngData);
          figma.ui.postMessage({
            type: "screenshot-exported",
            success: true,
            slideId: targetNode.id,
            slideName: targetNode.name,
            base64,
            width: Math.round(targetNode.width * scale),
            height: Math.round(targetNode.height * scale)
          });
          figma.notify(`\u{1F4F7} Exported "${targetNode.name}" (${Math.round(scale * 100)}%)`);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error("Screenshot export error:", errorMsg);
          figma.notify(`Export failed: ${errorMsg}`, { error: true });
          figma.ui.postMessage({ type: "screenshot-exported", success: false, error: errorMsg });
        }
      }
      if (msg.type === "close") {
        figma.closePlugin();
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("Plugin error:", errorMsg);
      figma.notify(`Error: ${errorMsg}`, { error: true });
    }
  };
  console.log(`Monorail loaded. Editor: ${figma.editorType}`);
})();
