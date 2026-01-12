// Diagram rendering (cycle diagrams, icons)

import { RGB } from './constants';
import { loadFontWithFallback } from './fonts';

// Color mapping for diagram nodes
export const DIAGRAM_COLORS: Record<string, RGB> = {
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
export function renderIcon(
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
export async function renderCycleDiagram(
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
