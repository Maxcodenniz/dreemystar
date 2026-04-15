import React, { useState, useMemo } from 'react';
import { getOrientationFromDimensions, clampFocal, type ImageOrientation } from '../utils/imageOrientation';

export type SmartImageVariant =
  | 'hero'           // Article/feature hero: portrait = contain + blur, landscape = banner
  | 'card'           // Adaptive card: portrait 3/4, landscape 16/9
  | 'cardPortrait'   // Force portrait card 3/4
  | 'cardLandscape'  // Force landscape card 16/9
  | 'banner'         // Full-width cover
  | 'thumbnail'     // Small square or fixed small size
  | 'square';       // 1:1 aspect, cover

export interface SmartImageProps {
  src: string | null | undefined;
  alt: string;
  /** Prefer stored orientation; if not set, inferred from width/height or defaults to landscape */
  orientation?: ImageOrientation | null;
  /** 0–100, default 50. Used for object-position. */
  focalX?: number | null;
  /** 0–100, default 50. */
  focalY?: number | null;
  /** Layout variant. */
  variant?: SmartImageVariant;
  /** If orientation unknown, optional dimensions to infer it (e.g. from backend). */
  width?: number | null;
  height?: number | null;
  /** Disable lazy loading for above-the-fold hero images. */
  eager?: boolean;
  className?: string;
  /** Optional wrapper className (e.g. for rounded overflow). */
  containerClassName?: string;
  /** Placeholder while loading (e.g. blur hash or color). */
  placeholderClassName?: string;
  /** Called when the image fails to load. */
  onError?: () => void;
}

const DEFAULT_PLACEHOLDER = 'bg-gray-800';

export const SmartImage: React.FC<SmartImageProps> = ({
  src,
  alt,
  orientation: propOrientation,
  focalX: propFocalX,
  focalY: propFocalY,
  variant = 'card',
  width: propWidth,
  height: propHeight,
  eager = false,
  className = '',
  containerClassName = '',
  placeholderClassName = DEFAULT_PLACEHOLDER,
  onError,
}) => {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const [inferredSize, setInferredSize] = useState<{ width: number; height: number } | null>(null);

  const orientation: ImageOrientation = useMemo(() => {
    if (propOrientation) return propOrientation;
    if (inferredSize)
      return getOrientationFromDimensions(inferredSize.width, inferredSize.height);
    if (propWidth != null && propHeight != null)
      return getOrientationFromDimensions(propWidth, propHeight);
    return 'landscape';
  }, [propOrientation, inferredSize, propWidth, propHeight]);

  const focalX = clampFocal(propFocalX);
  const focalY = clampFocal(propFocalY);
  const objectPosition = `${focalX}% ${focalY}%`;

  const onLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth && img.naturalHeight && !inferredSize)
      setInferredSize({ width: img.naturalWidth, height: img.naturalHeight });
    setLoaded(true);
  };

  const resolvedVariant = useMemo((): SmartImageVariant => {
    if (variant !== 'card') return variant;
    return orientation === 'portrait' ? 'cardPortrait' : 'cardLandscape';
  }, [variant, orientation]);

  const containerStyle = useMemo((): React.CSSProperties => {
    switch (resolvedVariant) {
      case 'hero':
        return { width: '100%', height: '100%', minHeight: '100%' };
      case 'cardPortrait':
        return { aspectRatio: '3/4' };
      case 'cardLandscape':
        return { aspectRatio: '16/9' };
      case 'square':
      case 'thumbnail':
        return { aspectRatio: '1/1' };
      case 'banner':
        return { width: '100%', height: 'auto' };
      default:
        return {};
    }
  }, [resolvedVariant, orientation]);

  const imgStyle = useMemo(() => {
    const base: React.CSSProperties = { objectPosition };
    switch (resolvedVariant) {
      case 'hero':
        if (orientation === 'portrait') {
          base.objectFit = 'contain';
          base.maxHeight = '650px';
          base.width = '100%';
          base.height = '100%';
        } else {
          base.objectFit = 'cover';
          base.width = '100%';
          base.height = '100%';
        }
        break;
      case 'cardPortrait':
      case 'cardLandscape':
      case 'square':
      case 'thumbnail':
        base.objectFit = 'cover';
        base.width = '100%';
        base.height = '100%';
        break;
      case 'banner':
        base.objectFit = 'cover';
        base.width = '100%';
        base.height = '100%';
        break;
      default:
        base.objectFit = 'cover';
        base.width = '100%';
        base.height = '100%';
    }
    return base;
  }, [resolvedVariant, orientation, objectPosition]);

  const isHeroPortrait = resolvedVariant === 'hero' && orientation === 'portrait';

  if (!src) {
    return (
      <div
        className={`${placeholderClassName} ${containerClassName} ${className}`}
        style={{ aspectRatio: resolvedVariant === 'cardPortrait' ? '3/4' : resolvedVariant === 'cardLandscape' ? '16/9' : resolvedVariant === 'square' || resolvedVariant === 'thumbnail' ? '1/1' : undefined }}
        aria-hidden
      />
    );
  }

  return (
    <div
      className={`relative overflow-hidden ${containerClassName}`}
      style={containerStyle}
    >
      {isHeroPortrait && (
        <div
          className="absolute inset-0 -z-10 scale-110 blur-2xl opacity-60"
          aria-hidden
        >
          <img
            src={src}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            fetchPriority="low"
          />
        </div>
      )}
      {(!loaded || errored) && (
        <div
          className={`absolute inset-0 ${placeholderClassName}`}
          aria-hidden
        />
      )}
      {!errored && (
        <img
          src={src}
          alt={alt}
          className={`${className} transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          style={imgStyle}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={onLoad}
          onError={() => {
            setErrored(true);
            onError?.();
          }}
        />
      )}
    </div>
  );
};

export default SmartImage;
