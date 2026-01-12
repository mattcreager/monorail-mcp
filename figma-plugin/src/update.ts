// Update and patch functionality

import type { Slide, SlideContent } from '../../shared/types';
import type { DeckIR } from '../../shared/types';
import { getFontName, loadFontWithFallback } from './fonts';

// Font fallbacks for patch operations
const FONT_FALLBACKS = ['Supply', 'Inter', 'SF Pro Display', 'Helvetica Neue', 'Arial'];

// Parse IR JSON string
export function parseIR(irString: string): DeckIR | null {
  try {
    return JSON.parse(irString);
  } catch (e) {
    console.error('Failed to parse IR:', e);
    return null;
  }
}

// Find a named text node within a parent (searches recursively for Auto Layout containers)
export function findNamedTextNode(parent: SceneNode & ChildrenMixin, name: string): TextNode | null {
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
export function findNamedFrame(parent: SceneNode & ChildrenMixin, name: string): FrameNode | null {
  const children = (parent as any).children || [];
  for (const child of children) {
    if (child.type === 'FRAME' && child.name === name) {
      return child as FrameNode;
    }
  }
  return null;
}

// Update text node content in place (preserves position, font, color)
export async function updateTextInPlace(node: TextNode, newText: string): Promise<void> {
  // Load the font that's already on the node
  const fontName = node.fontName;
  if (fontName !== figma.mixed) {
    await figma.loadFontAsync(fontName);
  }
  node.characters = newText;
}

// Update slide content in place (preserves human formatting)
export async function updateContentInPlace(parent: SceneNode & ChildrenMixin, slide: Slide): Promise<void> {
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

// Patch request types
export interface ElementPatch {
  target: string;      // Figma node ID (from rich read)
  text: string;        // New text content
}

export interface PatchRequest {
  slide_id?: string;   // Optional: for logging/context
  changes: ElementPatch[];
}

// Apply patches to specific elements by ID
export async function applyPatches(patches: PatchRequest): Promise<{ updated: number; failed: string[]; fontSubstitutions: string[] }> {
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
