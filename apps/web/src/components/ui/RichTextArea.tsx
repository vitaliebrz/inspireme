import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, List } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

function ToolbarBtn({
  onClick, active, title, children,
}: {
  onClick: () => void;
  active: boolean;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className="p-1.5 rounded-lg transition-colors"
      style={{
        color: active ? 'var(--orange)' : 'var(--text-2)',
        backgroundColor: active ? 'rgba(246,166,35,0.12)' : 'transparent',
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = 'var(--bg-4)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = active ? 'rgba(246,166,35,0.12)' : 'transparent'; }}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({ value, onChange, placeholder, minHeight = 120 }: Props) {
  const [focused, setFocused] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        strike: false,
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        orderedList: false,
      }),
    ],
    content: value || '',
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    editorProps: {
      attributes: { class: 'rich-editor-content', spellcheck: 'true' },
    },
  });

  // Sincronizează valoarea externă (draft restore, date API încărcate async)
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value || '', false);
    }
  }, [editor, value]);

  return (
    <div
      className="overflow-hidden"
      style={{
        borderRadius: 18,
        border: `1px solid ${focused ? 'var(--orange)' : 'var(--border)'}`,
        transition: 'border-color 150ms ease-out',
      }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center gap-0.5 px-2 py-1.5"
        style={{ backgroundColor: 'var(--bg-3)', borderBottom: '1px solid var(--border)' }}
      >
        <ToolbarBtn
          onClick={() => editor?.chain().focus().toggleBold().run()}
          active={editor?.isActive('bold') ?? false}
          title="Îngroșat (Ctrl+B)"
        >
          <Bold size={13} />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          active={editor?.isActive('italic') ?? false}
          title="Cursiv (Ctrl+I)"
        >
          <Italic size={13} />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          active={editor?.isActive('bulletList') ?? false}
          title="Listă punctată"
        >
          <List size={13} />
        </ToolbarBtn>
      </div>

      {/* Zona editorului */}
      <div
        className="relative cursor-text"
        style={{ backgroundColor: 'var(--bg-4)', minHeight }}
        onClick={() => editor?.chain().focus().run()}
      >
        {/* Placeholder CSS-only — apare doar când editorul e gol */}
        {(editor?.isEmpty ?? true) && placeholder && (
          <span
            className="absolute top-3 left-4 text-sm pointer-events-none select-none"
            style={{ color: 'var(--text-2)', opacity: 0.65 }}
          >
            {placeholder}
          </span>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
