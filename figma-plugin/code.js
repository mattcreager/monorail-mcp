"use strict";
// Monorail Figma Plugin
// Converts IR (deck spec) into Figma Slides
// Show the UI
figma.showUI(__html__, { width: 320, height: 280 });
// Colors - dark theme
const COLORS = {
    bg: { r: 0.06, g: 0.06, b: 0.1 }, // Dark blue-black background
    headline: { r: 0.996, g: 0.953, b: 0.78 }, // Warm cream for headlines
    body: { r: 0.83, g: 0.83, b: 0.85 }, // Light gray for body text
    muted: { r: 0.61, g: 0.64, b: 0.69 }, // Muted gray for sublines
    accent: { r: 0.86, g: 0.15, b: 0.15 }, // Red accent
    white: { r: 0.98, g: 0.98, b: 0.98 }, // Near white
    blue: { r: 0.05, g: 0.6, b: 1 }, // Accent blue
    dimmed: { r: 0.3, g: 0.3, b: 0.35 }, // Dimmed elements
};
// Slide dimensions
const SLIDE_WIDTH = 1920;
const SLIDE_HEIGHT = 1080;
// ID mapping storage key
const MAPPING_KEY = 'monorail_id_mapping';
// Clear mapping
async function clearMapping() {
    await figma.clientStorage.setAsync(MAPPING_KEY, {});
}
// Save mapping
async function saveMapping(mapping) {
    await figma.clientStorage.setAsync(MAPPING_KEY, mapping);
}
// Check if we're in Figma Slides
function isInSlides() {
    return figma.editorType === 'slides';
}
// Helper to add text (with optional name for update-in-place)
async function addText(parent, text, x, y, fontSize, bold = false, color = COLORS.white, maxWidth, nodeName) {
    const textNode = figma.createText();
    textNode.x = x;
    textNode.y = y;
    // Set node name for update-in-place (allows finding node later)
    if (nodeName) {
        textNode.name = nodeName;
    }
    const fontName = { family: 'Inter', style: bold ? 'Bold' : 'Regular' };
    await figma.loadFontAsync(fontName);
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
function addRect(parent, x, y, w, h, fill, stroke, dashed) {
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
function createAutoLayoutFrame(parent, name, x, y, direction = 'VERTICAL', spacing = 24, padding = 0) {
    const frame = figma.createFrame();
    frame.name = name;
    frame.x = x;
    frame.y = y;
    // Enable Auto Layout
    frame.layoutMode = direction;
    frame.primaryAxisSizingMode = 'AUTO'; // Height adjusts to content
    frame.counterAxisSizingMode = 'AUTO'; // Width adjusts to content
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
    parent.appendChild(frame);
    return frame;
}
// Helper to add text inside Auto Layout (no x/y - layout handles position)
async function addAutoLayoutText(parent, text, fontSize, bold = false, color = COLORS.white, maxWidth, nodeName) {
    const textNode = figma.createText();
    if (nodeName) {
        textNode.name = nodeName;
    }
    const fontName = { family: 'Inter', style: bold ? 'Bold' : 'Regular' };
    await figma.loadFontAsync(fontName);
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
function setSlideBackground(node) {
    // SlideNode has a fills property we can set directly
    if ('fills' in node) {
        node.fills = [{ type: 'SOLID', color: COLORS.bg }];
    }
}
// Add dark background rectangle (fallback for frames)
function addBackgroundRect(parent) {
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
async function createSlideWithContent(slide, index) {
    let container;
    if (isInSlides()) {
        // Use Figma Slides API
        container = figma.createSlide();
        container.name = `${slide.content.headline || slide.archetype}`;
        // Set background color directly on the slide
        setSlideBackground(container);
    }
    else {
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
async function addContentToParent(parent, slide) {
    var _a;
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
                            { position: 0, color: Object.assign(Object.assign({}, COLORS.bg), { a: 1 }) },
                            { position: 1, color: { r: 0.1, g: 0.1, b: 0.18, a: 1 } }
                        ],
                        gradientTransform: [[0.7, 0.7, 0], [-0.7, 0.7, 0.5]] // 135deg diagonal
                    }];
                parent.appendChild(gradientBg);
            }
            if (c.headline)
                await addText(parent, c.headline, 200, 420, 96, true, COLORS.headline, undefined, 'headline');
            if (c.subline)
                await addText(parent, c.subline, 200, 550, 36, false, COLORS.muted, undefined, 'subline');
            break;
        case 'section':
            if (c.headline)
                await addText(parent, c.headline, 200, 480, 72, true, COLORS.headline, undefined, 'headline');
            break;
        case 'big-idea':
            if (c.headline)
                await addText(parent, c.headline, 200, 380, 72, true, COLORS.white, 1520, 'headline');
            if (c.subline)
                await addText(parent, c.subline, 200, 520, 32, false, COLORS.muted, 1520, 'subline');
            break;
        case 'bullets':
            if (c.headline)
                await addText(parent, c.headline, 200, 180, 56, true, COLORS.headline, undefined, 'headline');
            if (c.bullets) {
                // Create Auto Layout container for bullets
                const bulletsContainer = createAutoLayoutFrame(parent, 'bullets-container', 200, // x position
                300, // y position (below headline)
                'VERTICAL', 32 // spacing between bullets
                );
                // Add bullets as children (Auto Layout handles positioning)
                for (let i = 0; i < c.bullets.length; i++) {
                    await addAutoLayoutText(bulletsContainer, `• ${c.bullets[i]}`, 36, false, COLORS.body, 1520, // max width for text wrapping
                    `bullet-${i}`);
                }
            }
            break;
        case 'two-column':
            if (c.headline)
                await addText(parent, c.headline, 200, 150, 56, true, COLORS.headline, undefined, 'headline');
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
            if (c.quote)
                await addText(parent, `"${c.quote}"`, 200, 380, 48, true, COLORS.white, 1520, 'quote');
            if (c.attribution)
                await addText(parent, `— ${c.attribution}`, 200, 560, 28, false, COLORS.muted, undefined, 'attribution');
            break;
        case 'summary':
            if (c.headline)
                await addText(parent, c.headline, 200, 200, 72, true, COLORS.headline, undefined, 'headline');
            if (c.items) {
                for (let i = 0; i < c.items.length; i++) {
                    await addText(parent, c.items[i], 200, 380 + i * 100, 36, false, COLORS.body, undefined, `item-${i}`);
                }
            }
            break;
        case 'chart':
            if (c.headline)
                await addText(parent, c.headline, 200, 150, 56, true, COLORS.headline, undefined, 'headline');
            addRect(parent, 200, 280, 1520, 500, { r: 0.1, g: 0.1, b: 0.13 }, COLORS.dimmed, true);
            await addText(parent, `[Chart: ${((_a = c.chart) === null || _a === void 0 ? void 0 : _a.type) || 'data'}]`, 860, 500, 28, false, COLORS.muted, undefined, 'chart-placeholder');
            if (c.takeaway)
                await addText(parent, c.takeaway, 200, 820, 28, false, COLORS.muted, undefined, 'takeaway');
            break;
        case 'timeline':
            if (c.headline)
                await addText(parent, c.headline, 200, 150, 56, true, COLORS.headline, undefined, 'headline');
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
            if (c.headline)
                await addText(parent, c.headline, 200, 150, 56, true, COLORS.headline, undefined, 'headline');
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
        default:
            if (c.headline)
                await addText(parent, c.headline, 200, 200, 64, true, COLORS.headline, undefined, 'headline');
    }
}
// Parse IR
function parseIR(irString) {
    try {
        return JSON.parse(irString);
    }
    catch (e) {
        console.error('Failed to parse IR:', e);
        return null;
    }
}
// Find a named text node within a parent (searches recursively for Auto Layout containers)
function findNamedTextNode(parent, name) {
    const children = parent.children || [];
    for (const child of children) {
        if (child.type === 'TEXT' && child.name === name) {
            return child;
        }
        // Recursively search inside frames (for Auto Layout containers)
        if (child.type === 'FRAME' && 'children' in child) {
            const found = findNamedTextNode(child, name);
            if (found)
                return found;
        }
    }
    return null;
}
// Find a named frame within a parent
function findNamedFrame(parent, name) {
    const children = parent.children || [];
    for (const child of children) {
        if (child.type === 'FRAME' && child.name === name) {
            return child;
        }
    }
    return null;
}
// Update text node content in place (preserves position, font, color)
async function updateTextInPlace(node, newText) {
    // Load the font that's already on the node
    const fontName = node.fontName;
    if (fontName !== figma.mixed) {
        await figma.loadFontAsync(fontName);
    }
    node.characters = newText;
}
// Update slide content in place (preserves human formatting)
async function updateContentInPlace(parent, slide) {
    const c = slide.content;
    // Helper to update a named node if it exists
    async function updateNamed(name, text) {
        if (!text)
            return;
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
function detectExistingArchetype(parent) {
    const children = parent.children || [];
    const textNodes = children.filter((n) => n.type === 'TEXT');
    const frameNodes = children.filter((n) => n.type === 'FRAME');
    const names = new Set(textNodes.map(t => t.name));
    const frameNames = new Set(frameNodes.map(f => f.name));
    // Check for Auto Layout container (new style)
    if (frameNames.has('bullets-container'))
        return 'bullets';
    // Check for archetype-specific node names
    if (names.has('quote') && names.has('attribution'))
        return 'quote';
    if (names.has('left-title') || names.has('right-title'))
        return 'two-column';
    // Legacy bullets detection (old style without container)
    if (Array.from(names).some(n => n.startsWith('bullet-')))
        return 'bullets';
    if (Array.from(names).some(n => n.startsWith('item-')))
        return 'summary';
    if (Array.from(names).some(n => n.startsWith('stage-')))
        return 'timeline';
    if (Array.from(names).some(n => n.startsWith('col-') || n.startsWith('cell-')))
        return 'comparison';
    if (names.has('chart-placeholder'))
        return 'chart';
    if (names.has('headline') && names.has('subline')) {
        // Could be title or big-idea - check font size
        const headline = textNodes.find(t => t.name === 'headline');
        if (headline && typeof headline.fontSize === 'number' && headline.fontSize >= 90) {
            return 'title';
        }
        return 'big-idea';
    }
    if (names.has('headline') && names.size === 1)
        return 'section';
    return 'unknown';
}
function analyzeSlideContent(textNodes) {
    var _a, _b, _c;
    // Extract text info with reference to original node for tracking
    const texts = textNodes.map(t => ({
        text: t.characters,
        x: t.x,
        y: t.y,
        fontSize: typeof t.fontSize === 'number' ? t.fontSize : 24,
        isBold: t.fontName !== figma.mixed && t.fontName.style.includes('Bold'),
        width: t.width,
        node: t,
    }));
    if (texts.length === 0) {
        return { archetype: 'unknown', content: {} };
    }
    // Track which texts are "claimed" by archetype detection
    const claimed = new Set();
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
    let content = {};
    // TITLE: Large centered headline, maybe subline
    if (largestText.fontSize >= 80 && texts.length <= 2) {
        archetype = 'title';
        claimed.add(largestText.node);
        const sublineText = texts.find(t => t !== largestText);
        if (sublineText)
            claimed.add(sublineText.node);
        content = {
            headline: largestText.text,
            subline: sublineText === null || sublineText === void 0 ? void 0 : sublineText.text,
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
        if (quoteText)
            claimed.add(quoteText.node);
        if (attrText)
            claimed.add(attrText.node);
        content = {
            quote: (quoteText === null || quoteText === void 0 ? void 0 : quoteText.text.replace(/^[""]|[""]$/g, '')) || '',
            attribution: (attrText === null || attrText === void 0 ? void 0 : attrText.text.replace(/^[—-]\s*/, '')) || '',
        };
    }
    // BULLETS: Has bullet points
    else if (bulletTexts.length >= 2) {
        archetype = 'bullets';
        const headline = texts.find(t => t.fontSize >= 48 && !t.text.startsWith('•'));
        if (headline)
            claimed.add(headline.node);
        bulletTexts.forEach(t => claimed.add(t.node));
        content = {
            headline: (headline === null || headline === void 0 ? void 0 : headline.text) || '',
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
        if (headline)
            claimed.add(headline.node);
        if (leftBold)
            claimed.add(leftBold.node);
        if (leftBody)
            claimed.add(leftBody.node);
        if (rightBold)
            claimed.add(rightBold.node);
        if (rightBody)
            claimed.add(rightBody.node);
        content = {
            headline: (headline === null || headline === void 0 ? void 0 : headline.text) || '',
            left: {
                title: (leftBold === null || leftBold === void 0 ? void 0 : leftBold.text) || '',
                body: (leftBody === null || leftBody === void 0 ? void 0 : leftBody.text) || ''
            },
            right: {
                title: (rightBold === null || rightBold === void 0 ? void 0 : rightBold.text) || '',
                body: (rightBody === null || rightBody === void 0 ? void 0 : rightBody.text) || ''
            },
        };
    }
    // CHART: Has chart placeholder
    else if (hasChartPlaceholder) {
        archetype = 'chart';
        const headline = texts.find(t => t.fontSize >= 48);
        const takeaway = texts.find(t => t.y > 700);
        const chartText = texts.find(t => t.text.includes('[Chart'));
        if (headline)
            claimed.add(headline.node);
        if (takeaway)
            claimed.add(takeaway.node);
        if (chartText)
            claimed.add(chartText.node);
        const chartType = ((_a = chartText === null || chartText === void 0 ? void 0 : chartText.text.match(/\[Chart:\s*(\w+)\]/)) === null || _a === void 0 ? void 0 : _a[1]) || 'data';
        content = {
            headline: (headline === null || headline === void 0 ? void 0 : headline.text) || '',
            chart: { type: chartType, placeholder: true },
            takeaway: takeaway === null || takeaway === void 0 ? void 0 : takeaway.text,
        };
    }
    // TIMELINE: Multiple items in a row pattern
    else if (hasTimelinePattern) {
        archetype = 'timeline';
        const headline = texts.find(t => t.fontSize >= 48);
        if (headline)
            claimed.add(headline.node);
        const stageTexts = texts.filter(t => t !== headline && t.y > 350);
        stageTexts.forEach(t => claimed.add(t.node));
        // Group by x position
        const stageGroups = new Map();
        for (const t of stageTexts) {
            const bucket = Math.round(t.x / 300) * 300;
            if (!stageGroups.has(bucket))
                stageGroups.set(bucket, []);
            stageGroups.get(bucket).push(t);
        }
        const stages = Array.from(stageGroups.values()).map(group => {
            var _a, _b;
            group.sort((a, b) => a.y - b.y);
            return {
                label: ((_a = group[0]) === null || _a === void 0 ? void 0 : _a.text) || '',
                description: (_b = group[1]) === null || _b === void 0 ? void 0 : _b.text,
            };
        });
        content = {
            headline: (headline === null || headline === void 0 ? void 0 : headline.text) || '',
            stages,
        };
    }
    // SUMMARY: Headline + list of items (no bullets)
    else if (texts.length >= 3 && texts.length <= 5) {
        const headline = texts.find(t => t.fontSize >= 60);
        const items = texts.filter(t => t !== headline && t.fontSize >= 28 && t.fontSize <= 40);
        if (items.length >= 2) {
            archetype = 'summary';
            if (headline)
                claimed.add(headline.node);
            items.forEach(t => claimed.add(t.node));
            content = {
                headline: (headline === null || headline === void 0 ? void 0 : headline.text) || '',
                items: items.map(t => t.text),
            };
        }
    }
    // BIG-IDEA: Large headline + subline
    else if (largestText.fontSize >= 60 && texts.length === 2) {
        archetype = 'big-idea';
        claimed.add(largestText.node);
        const subline = texts.find(t => t !== largestText);
        if (subline)
            claimed.add(subline.node);
        content = {
            headline: largestText.text,
            subline: subline === null || subline === void 0 ? void 0 : subline.text,
        };
    }
    // Fallback: unknown with all text as headline/subline
    if (archetype === 'unknown') {
        if (texts[0])
            claimed.add(texts[0].node);
        if (texts[1])
            claimed.add(texts[1].node);
        content = {
            headline: ((_b = texts[0]) === null || _b === void 0 ? void 0 : _b.text) || '',
            subline: (_c = texts[1]) === null || _c === void 0 ? void 0 : _c.text,
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
// Main message handler
figma.ui.onmessage = async (msg) => {
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
            const mode = isInSlides() ? 'Figma Slides' : 'Figma Design';
            console.log(`Editor: ${figma.editorType}, Mode: ${mode}`);
            // Load fonts upfront
            await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
            await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
            // Load existing mapping (for updates)
            const existingMapping = await figma.clientStorage.getAsync(MAPPING_KEY) || {};
            const mapping = Object.assign({}, existingMapping);
            let created = 0;
            let updated = 0;
            let skipped = 0;
            for (let i = 0; i < ir.slides.length; i++) {
                const slide = ir.slides[i];
                const existingFigmaId = mapping[slide.id];
                try {
                    // Check if slide exists and is valid
                    let existingNode = null;
                    if (existingFigmaId) {
                        existingNode = await figma.getNodeByIdAsync(existingFigmaId);
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
                        const existingArchetype = detectExistingArchetype(existingNode);
                        // If archetype matches, update in place (preserves human formatting)
                        if (existingArchetype === slide.archetype) {
                            console.log(`Updating slide ${i + 1} in place: ${slide.archetype}`);
                            // Update name
                            existingNode.name = `${slide.content.headline || slide.archetype}`;
                            // Update content in place (preserves position, font, color)
                            await updateContentInPlace(existingNode, slide);
                            updated++;
                            figma.notify(`Updated ${updated}: ${slide.archetype} (in-place)`);
                        }
                        // If archetype changed, clear and re-render
                        else {
                            console.log(`Re-rendering slide ${i + 1}: ${existingArchetype} → ${slide.archetype}`);
                            // Clear existing children
                            const children = [...existingNode.children];
                            for (const child of children) {
                                child.remove();
                            }
                            // Update name
                            existingNode.name = `${slide.content.headline || slide.archetype}`;
                            // Re-apply background (for slides)
                            if (isInSlides()) {
                                setSlideBackground(existingNode);
                            }
                            // Re-add content
                            await addContentToParent(existingNode, slide);
                            updated++;
                            figma.notify(`Updated ${updated}: ${slide.archetype} (re-rendered)`);
                        }
                    }
                    // CREATE: New slide
                    else {
                        console.log(`Creating slide ${i + 1}: ${slide.archetype}`);
                        const node = await createSlideWithContent(slide, i);
                        mapping[slide.id] = node.id;
                        created++;
                        figma.notify(`Created ${created}: ${slide.archetype}`);
                    }
                }
                catch (err) {
                    const errorMsg = err instanceof Error ? err.message : String(err);
                    console.error(`Error on slide ${i + 1}:`, errorMsg);
                    figma.notify(`Error on slide ${i + 1}: ${errorMsg}`, { error: true });
                }
            }
            await saveMapping(mapping);
            const summary = [];
            if (created > 0)
                summary.push(`${created} created`);
            if (updated > 0)
                summary.push(`${updated} updated`);
            if (skipped > 0)
                summary.push(`${skipped} skipped`);
            figma.notify(`✓ ${summary.join(', ')}!`, { timeout: 3000 });
            figma.ui.postMessage({ type: 'applied', count: created + updated });
        }
        if (msg.type === 'export-ir') {
            const slides = [];
            // Load stored mapping to preserve IDs
            const storedMapping = await figma.clientStorage.getAsync(MAPPING_KEY) || {};
            const reverseMapping = {};
            for (const [irId, figmaId] of Object.entries(storedMapping)) {
                reverseMapping[figmaId] = irId;
            }
            // Collect all slide nodes
            const slideNodes = [];
            if (isInSlides()) {
                // In Figma Slides: traverse to find SLIDE nodes
                // Structure is: Page -> SLIDE_GRID -> SLIDE_ROW -> SLIDE
                function findSlides(node) {
                    if (node.type === 'SLIDE') {
                        slideNodes.push(node);
                        return;
                    }
                    if ('children' in node) {
                        for (const child of node.children) {
                            findSlides(child);
                        }
                    }
                }
                for (const node of figma.currentPage.children) {
                    findSlides(node);
                }
            }
            else {
                // In Figma Design: look for frames named "Slide"
                for (const node of figma.currentPage.children) {
                    if (node.type === 'FRAME' && node.name.includes('Slide')) {
                        slideNodes.push(node);
                    }
                }
            }
            for (const node of slideNodes) {
                try {
                    const children = node.children || [];
                    const textNodes = children.filter((n) => n.type === 'TEXT');
                    // Sort text nodes by position (top to bottom, left to right)
                    textNodes.sort((a, b) => {
                        if (Math.abs(a.y - b.y) > 50)
                            return a.y - b.y;
                        return a.x - b.x;
                    });
                    // Analyze text nodes to detect archetype
                    const analysis = analyzeSlideContent(textNodes);
                    // Get or generate slide ID
                    const slideId = reverseMapping[node.id] || `slide-${slides.length + 1}`;
                    slides.push({
                        id: slideId,
                        archetype: analysis.archetype,
                        status: 'draft',
                        content: analysis.content,
                        extras: analysis.extras, // Human-added text not in archetype
                    });
                }
                catch (err) {
                    console.error(`Error processing slide "${node.name}":`, err);
                }
            }
            const ir = {
                deck: { title: 'Exported Deck' },
                slides
            };
            figma.ui.postMessage({ type: 'exported', ir: JSON.stringify(ir, null, 2) });
            figma.notify(`Exported ${slides.length} slides`);
        }
        if (msg.type === 'close') {
            figma.closePlugin();
        }
    }
    catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error('Plugin error:', errorMsg);
        figma.notify(`Error: ${errorMsg}`, { error: true });
    }
};
console.log(`Monorail loaded. Editor: ${figma.editorType}`);
