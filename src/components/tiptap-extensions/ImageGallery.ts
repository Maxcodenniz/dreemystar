import { Node } from '@tiptap/core';

export interface GalleryImage {
  src: string;
  alt?: string;
}

export interface ImageGalleryOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    imageGallery: {
      setImageGallery: (options: { images: GalleryImage[] }) => ReturnType;
    };
  }
}

function parseGalleryImages(html: HTMLElement): GalleryImage[] {
  const imgs = html.querySelectorAll('img[data-src]');
  return Array.from(imgs).map((img) => ({
    src: img.getAttribute('data-src') || '',
    alt: img.getAttribute('alt') || undefined,
  }));
}

function serializeGalleryImages(images: GalleryImage[]): string {
  return JSON.stringify(images);
}

export const ImageGallery = Node.create<ImageGalleryOptions>({
  name: 'imageGallery',

  group: 'block',

  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      images: {
        default: [] as GalleryImage[],
        renderHTML: (attrs) => {
          const images = Array.isArray(attrs.images) ? attrs.images : [];
          if (images.length === 0) return {};
          return { 'data-images': serializeGalleryImages(images) };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div.article-gallery',
        getAttrs: (el) => {
          const raw = (el as HTMLElement).getAttribute('data-images');
          let images: GalleryImage[] = [];
          if (raw) {
            try {
              images = JSON.parse(raw);
            } catch {
              images = parseGalleryImages(el as HTMLElement);
            }
          } else {
            images = parseGalleryImages(el as HTMLElement);
          }
          return { images };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const images: GalleryImage[] = Array.isArray(node.attrs.images) ? node.attrs.images : [];
    const content = images.map((img) => ['img', { src: img.src, alt: img.alt || '', 'data-src': img.src }]);
    return [
      'div',
      {
        class: 'article-gallery',
        'data-images': serializeGalleryImages(images),
        ...this.options.HTMLAttributes,
      },
      ...content,
    ];
  },

  addCommands() {
    return {
      setImageGallery:
        (options: { images: GalleryImage[] }) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { images: options.images.filter((i) => i.src) },
          }),
    };
  },
});
