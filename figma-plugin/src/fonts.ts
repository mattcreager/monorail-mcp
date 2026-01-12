// Font Fallback Chain
// Try fonts in order until one loads successfully.
// This prevents failures when custom fonts aren't available.

const FONT_FALLBACKS = ['Supply', 'Inter', 'SF Pro Display', 'Helvetica Neue', 'Arial'];

export interface LoadedFont {
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
export async function loadFontWithFallback(): Promise<LoadedFont> {
  // Return cached font if available
  if (loadedFontCache) {
    return loadedFontCache;
  }
  
  // Try each font in the fallback chain
  for (const family of FONT_FALLBACKS) {
    const loaded = await tryLoadFont(family);
    if (loaded) {
      loadedFontCache = loaded;
      console.log(`Loaded font: ${family}`);
      return loaded;
    }
  }
  
  // This should never happen if Arial is available
  throw new Error('No fonts available from fallback chain');
}

/**
 * Get the appropriate FontName for text (bold or regular).
 */
export async function getFontName(bold: boolean = false): Promise<FontName> {
  const fonts = await loadFontWithFallback();
  return bold ? fonts.bold : fonts.regular;
}

/**
 * Clear the font cache (useful for testing or font changes)
 */
export function clearFontCache(): void {
  loadedFontCache = null;
}
