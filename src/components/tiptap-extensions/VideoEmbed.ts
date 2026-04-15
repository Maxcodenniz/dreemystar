import { Node } from '@tiptap/core';

export interface VideoEmbedOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    videoEmbed: {
      setVideoEmbed: (options: { src: string; title?: string }) => ReturnType;
    };
  }
}

function toEmbedUrl(url: string): string | null {
  const u = url.trim();
  // YouTube: watch?v=, youtu.be/
  const ytMatch = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
  // Vimeo
  const vimeoMatch = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  // Already an embed URL
  if (u.includes('/embed/')) return u;
  return null;
}

export const VideoEmbed = Node.create<VideoEmbedOptions>({
  name: 'videoEmbed',

  group: 'block',

  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-src'),
        renderHTML: (attrs) => (attrs.src ? { 'data-src': attrs.src } : {}),
      },
      title: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-title') || 'Video',
        renderHTML: (attrs) => (attrs.title ? { 'data-title': attrs.title } : {}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div.video-embed[data-src]',
        getAttrs: (el) => ({
          src: (el as HTMLElement).getAttribute('data-src'),
          title: (el as HTMLElement).getAttribute('data-title') || 'Video',
        }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const src = node.attrs.src;
    const title = node.attrs.title || 'Video';
    return [
      'div',
      { class: 'video-embed', 'data-src': src, 'data-title': title, ...this.options.HTMLAttributes },
      ['iframe', { src: src || '', title, frameborder: '0', allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture', allowfullscreen: 'true' }],
    ];
  },

  addCommands() {
    return {
      setVideoEmbed:
        (options: { src: string; title?: string }) =>
        ({ commands }) => {
          const embedUrl = toEmbedUrl(options.src);
          if (!embedUrl) return false;
          return commands.insertContent({
            type: this.name,
            attrs: { src: embedUrl, title: options.title || 'Video' },
          });
        },
    };
  },
});

export { toEmbedUrl };
