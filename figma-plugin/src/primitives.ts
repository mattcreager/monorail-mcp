// Primitive Figma node creation helpers

import { COLORS, SLIDE_WIDTH, SLIDE_HEIGHT, RGB } from './constants';
import { getFontName } from './fonts';

// Helper to add text (with optional name for update-in-place)
export async function addText(
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
export function addRect(
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
export function createAutoLayoutFrame(
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
export async function addAutoLayoutText(
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
export function setSlideBackground(node: SceneNode): void {
  // SlideNode has a fills property we can set directly
  if ('fills' in node) {
    (node as any).fills = [{ type: 'SOLID', color: COLORS.bg }];
  }
}

// Add dark background rectangle (fallback for frames)
export function addBackgroundRect(parent: SceneNode & ChildrenMixin): void {
  const bg = figma.createRectangle();
  bg.name = 'Background';
  bg.x = 0;
  bg.y = 0;
  bg.resize(SLIDE_WIDTH, SLIDE_HEIGHT);
  bg.fills = [{ type: 'SOLID', color: COLORS.bg }];
  bg.locked = true;
  parent.appendChild(bg);
}

// Check if we're in Figma Slides
export function isInSlides(): boolean {
  return figma.editorType === 'slides';
}
