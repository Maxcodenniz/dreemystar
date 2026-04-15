/**
 * Adaptive Image Layout: orientation from dimensions.
 * portrait = height > width, landscape = width > height, square = ≈equal.
 */
export type ImageOrientation = 'portrait' | 'landscape' | 'square';

const RATIO_SQUARE_TOLERANCE = 0.15; // within 15% of 1:1 treated as square

export function getOrientationFromDimensions(
  width: number,
  height: number
): ImageOrientation {
  if (!width || !height) return 'landscape';
  const ratio = width / height;
  if (Math.abs(ratio - 1) <= RATIO_SQUARE_TOLERANCE) return 'square';
  return ratio > 1 ? 'landscape' : 'portrait';
}

export function clampFocal(value: number | null | undefined): number {
  if (value == null || Number.isNaN(value)) return 50;
  return Math.min(100, Math.max(0, Number(value)));
}

/** Load image from URL and return dimensions + orientation (for upload flow). */
export function getImageDimensions(
  url: string
): Promise<{ width: number; height: number; orientation: ImageOrientation }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const width = img.naturalWidth || 0;
      const height = img.naturalHeight || 0;
      resolve({
        width,
        height,
        orientation: getOrientationFromDimensions(width, height),
      });
    };
    img.onerror = () => reject(new Error('Failed to load image for dimensions'));
    img.src = url;
  });
}
