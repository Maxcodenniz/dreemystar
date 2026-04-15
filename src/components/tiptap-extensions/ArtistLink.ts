import { Mark } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    artistLink: {
      setArtistLink: (attributes: { artistId: string; label?: string }) => ReturnType;
      unsetArtistLink: () => ReturnType;
    };
  }
}

export const ArtistLink = Mark.create({
  name: 'artistLink',

  addAttributes() {
    return {
      artistId: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-artist-id'),
        renderHTML: (attrs) => (attrs.artistId ? { 'data-artist-id': attrs.artistId } : {}),
      },
      label: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-label') || (el as HTMLElement).textContent,
        renderHTML: (attrs) => (attrs.label ? { 'data-label': attrs.label } : {}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'a.artist-profile-link[data-artist-id]',
        getAttrs: (el) => ({
          artistId: (el as HTMLElement).getAttribute('data-artist-id'),
          label: (el as HTMLElement).getAttribute('data-label') || (el as HTMLElement).textContent,
        }),
      },
      {
        tag: 'a[href^="/artist/"]',
        getAttrs: (el) => {
          const href = (el as HTMLElement).getAttribute('href') || '';
          const id = href.replace(/^\/artist\//, '').split('/')[0];
          return id ? { artistId: id, label: (el as HTMLElement).textContent } : false;
        },
      },
    ];
  },

  renderHTML({ mark }) {
    const artistId = mark.attrs.artistId;
    const label = mark.attrs.label || artistId;
    const href = `/artist/${artistId}`;
    return [
      'a',
      {
        href,
        class: 'artist-profile-link',
        'data-artist-id': artistId,
        'data-label': label,
        rel: undefined,
        target: undefined,
      },
      label,
    ];
  },

  addCommands() {
    return {
      setArtistLink:
        (attributes: { artistId: string; label?: string }) =>
        ({ commands }) =>
          commands.setMark(this.name, attributes),
      unsetArtistLink:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});
