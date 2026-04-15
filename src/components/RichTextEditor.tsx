import React, { useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Quote,
  Heading1,
  Heading2,
  Heading3,
  Link as LinkIcon,
  Image as ImageIcon,
  Minus,
  Video,
  User,
  LayoutGrid,
  LayoutPanelTop,
} from 'lucide-react';
import { PullQuote, VideoEmbed, ArtistLink, ImageGallery } from './tiptap-extensions';

export interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
  className?: string;
  /** Optional: allow image uploads via URL prompt */
  allowImages?: boolean;
}

const Toolbar: React.FC<{ editor: ReturnType<typeof useEditor>['editor'] }> = ({ editor }) => {
  if (!editor) return null;

  const setLink = useCallback(() => {
    const url = window.prompt('URL:', editor.getAttributes('link').href || 'https://');
    if (url) editor.chain().focus().setLink({ href: url }).run();
  }, [editor]);

  const addImage = useCallback(() => {
    const url = window.prompt('Image URL:');
    if (url) editor.chain().focus().setImage({ src: url }).run();
  }, [editor]);

  const addVideo = useCallback(() => {
    const url = window.prompt('Video URL (YouTube or Vimeo):');
    if (url) editor.chain().focus().setVideoEmbed({ src: url }).run();
  }, [editor]);

  const addArtistLink = useCallback(() => {
    const { from, to } = editor.state.selection;
    const selectedText = from !== to ? editor.state.doc.textBetween(from, to) : '';
    const artistId = window.prompt('Artist ID (from profile URL /artist/ID):', '');
    if (!artistId?.trim()) return;
    const linkLabel = (window.prompt('Link text (optional):', selectedText || artistId) || artistId).trim();
    if (from === to) {
      editor.chain().focus().insertContent({ type: 'text', text: linkLabel, marks: [{ type: 'artistLink', attrs: { artistId: artistId.trim(), label: linkLabel } }] }).run();
    } else {
      editor.chain().focus().setArtistLink({ artistId: artistId.trim(), label: linkLabel || undefined }).run();
    }
  }, [editor]);

  const addGallery = useCallback(() => {
    const input = window.prompt('Image URLs (one per line or comma-separated):');
    if (!input?.trim()) return;
    const urls = input
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const images = urls.map((src) => ({ src, alt: '' }));
    if (images.length) editor.chain().focus().setImageGallery({ images }).run();
  }, [editor]);

  return (
    <div className="flex flex-wrap items-center gap-1 p-2 border-b border-white/10 bg-white/5 rounded-t-xl">
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        className={`p-2 rounded-lg hover:bg-white/10 ${editor.isActive('heading', { level: 1 }) ? 'bg-purple-500/30 text-purple-300' : 'text-gray-400'}`}
        title="Heading 1"
      >
        <Heading1 className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={`p-2 rounded-lg hover:bg-white/10 ${editor.isActive('heading', { level: 2 }) ? 'bg-purple-500/30 text-purple-300' : 'text-gray-400'}`}
        title="Heading 2"
      >
        <Heading2 className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={`p-2 rounded-lg hover:bg-white/10 ${editor.isActive('heading', { level: 3 }) ? 'bg-purple-500/30 text-purple-300' : 'text-gray-400'}`}
        title="Heading 3"
      >
        <Heading3 className="w-4 h-4" />
      </button>
      <span className="w-px h-5 bg-white/20 mx-1" />
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`p-2 rounded-lg hover:bg-white/10 ${editor.isActive('bold') ? 'bg-purple-500/30 text-purple-300' : 'text-gray-400'}`}
        title="Bold"
      >
        <Bold className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`p-2 rounded-lg hover:bg-white/10 ${editor.isActive('italic') ? 'bg-purple-500/30 text-purple-300' : 'text-gray-400'}`}
        title="Italic"
      >
        <Italic className="w-4 h-4" />
      </button>
      <span className="w-px h-5 bg-white/20 mx-1" />
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={`p-2 rounded-lg hover:bg-white/10 ${editor.isActive('bulletList') ? 'bg-purple-500/30 text-purple-300' : 'text-gray-400'}`}
        title="Bullet list"
      >
        <List className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={`p-2 rounded-lg hover:bg-white/10 ${editor.isActive('orderedList') ? 'bg-purple-500/30 text-purple-300' : 'text-gray-400'}`}
        title="Numbered list"
      >
        <ListOrdered className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={`p-2 rounded-lg hover:bg-white/10 ${editor.isActive('blockquote') ? 'bg-purple-500/30 text-purple-300' : 'text-gray-400'}`}
        title="Quote"
      >
        <Quote className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().togglePullQuote().run()}
        className={`p-2 rounded-lg hover:bg-white/10 ${editor.isActive('pullQuote') ? 'bg-purple-500/30 text-purple-300' : 'text-gray-400'}`}
        title="Pull quote"
      >
        <LayoutPanelTop className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        className="p-2 rounded-lg hover:bg-white/10 text-gray-400"
        title="Horizontal rule"
      >
        <Minus className="w-4 h-4" />
      </button>
      <span className="w-px h-5 bg-white/20 mx-1" />
      <button
        type="button"
        onClick={setLink}
        className={`p-2 rounded-lg hover:bg-white/10 ${editor.isActive('link') ? 'bg-purple-500/30 text-purple-300' : 'text-gray-400'}`}
        title="Link"
      >
        <LinkIcon className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={addImage}
        className="p-2 rounded-lg hover:bg-white/10 text-gray-400"
        title="Image"
      >
        <ImageIcon className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={addVideo}
        className="p-2 rounded-lg hover:bg-white/10 text-gray-400"
        title="Embed video (YouTube/Vimeo)"
      >
        <Video className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={addArtistLink}
        className={`p-2 rounded-lg hover:bg-white/10 ${editor.isActive('artistLink') ? 'bg-purple-500/30 text-purple-300' : 'text-gray-400'}`}
        title="Link to artist profile"
      >
        <User className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={addGallery}
        className="p-2 rounded-lg hover:bg-white/10 text-gray-400"
        title="Image gallery"
      >
        <LayoutGrid className="w-4 h-4" />
      </button>
    </div>
  );
};

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  placeholder = 'Write your article…',
  minHeight = '320px',
  className = '',
  allowImages = true,
}) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
      }),
      ...(allowImages ? [Image.configure({ allowBase64: true })] : []),
      Placeholder.configure({ placeholder }),
      PullQuote,
      VideoEmbed,
      ArtistLink,
      ImageGallery,
    ],
    content: value || '',
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none min-h-[200px] px-4 py-3 focus:outline-none text-gray-200',
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  useEffect(() => {
    return () => editor?.destroy();
  }, [editor]);

  return (
    <div className={`rounded-xl border border-white/10 overflow-hidden ${className}`}>
      <Toolbar editor={editor} />
      <div style={{ minHeight }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};

export default RichTextEditor;
