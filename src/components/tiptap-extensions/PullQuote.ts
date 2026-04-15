import { Node } from '@tiptap/core';

export const PullQuote = Node.create({
  name: 'pullQuote',

  group: 'block',

  content: 'block+',

  defining: true,

  parseHTML() {
    return [{ tag: 'aside.pull-quote' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['aside', { class: 'pull-quote', ...HTMLAttributes }, 0];
  },

  addCommands() {
    return {
      setPullQuote:
        () =>
        ({ commands }) =>
          commands.wrapIn(this.name),
      togglePullQuote:
        () =>
        ({ commands }) =>
          commands.toggleWrap(this.name),
    };
  },
});
