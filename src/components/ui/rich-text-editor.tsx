import React, { useRef, useCallback, useEffect } from 'react';
import { Button } from './button';
import { 
  Bold, 
  Italic, 
  Underline, 
  List, 
  ListOrdered, 
  Link, 
  AlignLeft, 
  AlignCenter, 
  AlignRight,
  Heading2,
  Pilcrow,
  Undo,
  Redo
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

export const RichTextEditor = ({ 
  value, 
  onChange, 
  placeholder = "Escreva aqui...",
  className,
  minHeight = "200px"
}: RichTextEditorProps) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalChange = useRef(false);

  // Sync external value changes to editor
  useEffect(() => {
    if (editorRef.current && !isInternalChange.current) {
      if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value;
      }
    }
    isInternalChange.current = false;
  }, [value]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      isInternalChange.current = true;
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const execCommand = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleInput();
  }, [handleInput]);

  const formatBold = () => execCommand('bold');
  const formatItalic = () => execCommand('italic');
  const formatUnderline = () => execCommand('underline');
  const formatUnorderedList = () => execCommand('insertUnorderedList');
  const formatOrderedList = () => execCommand('insertOrderedList');
  const formatHeading = () => execCommand('formatBlock', 'h2');
  const formatParagraph = () => execCommand('formatBlock', 'p');
  const alignLeft = () => execCommand('justifyLeft');
  const alignCenter = () => execCommand('justifyCenter');
  const alignRight = () => execCommand('justifyRight');
  const undo = () => execCommand('undo');
  const redo = () => execCommand('redo');

  const insertLink = () => {
    const url = prompt('Digite a URL do link:');
    if (url) {
      execCommand('createLink', url);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'b':
          e.preventDefault();
          formatBold();
          break;
        case 'i':
          e.preventDefault();
          formatItalic();
          break;
        case 'u':
          e.preventDefault();
          formatUnderline();
          break;
        case 'k':
          e.preventDefault();
          insertLink();
          break;
        case 'z':
          if (e.shiftKey) {
            e.preventDefault();
            redo();
          } else {
            e.preventDefault();
            undo();
          }
          break;
      }
    }
  };

  const ToolbarButton = ({ 
    onClick, 
    children, 
    title 
  }: { 
    onClick: () => void; 
    children: React.ReactNode; 
    title: string;
  }) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      title={title}
      className="h-8 w-8 p-0 hover:bg-muted"
    >
      {children}
    </Button>
  );

  const Separator = () => (
    <div className="w-px h-6 bg-border mx-1" />
  );

  return (
    <div className={cn("border border-border rounded-lg overflow-hidden bg-background", className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 p-2 border-b border-border bg-muted/30 flex-wrap">
        <ToolbarButton onClick={formatBold} title="Negrito (Ctrl+B)">
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={formatItalic} title="Itálico (Ctrl+I)">
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={formatUnderline} title="Sublinhado (Ctrl+U)">
          <Underline className="h-4 w-4" />
        </ToolbarButton>
        
        <Separator />
        
        <ToolbarButton onClick={formatHeading} title="Título">
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={formatParagraph} title="Parágrafo">
          <Pilcrow className="h-4 w-4" />
        </ToolbarButton>
        
        <Separator />
        
        <ToolbarButton onClick={formatUnorderedList} title="Lista com marcadores">
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={formatOrderedList} title="Lista numerada">
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        
        <Separator />
        
        <ToolbarButton onClick={alignLeft} title="Alinhar à esquerda">
          <AlignLeft className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={alignCenter} title="Centralizar">
          <AlignCenter className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={alignRight} title="Alinhar à direita">
          <AlignRight className="h-4 w-4" />
        </ToolbarButton>
        
        <Separator />
        
        <ToolbarButton onClick={insertLink} title="Inserir link (Ctrl+K)">
          <Link className="h-4 w-4" />
        </ToolbarButton>
        
        <Separator />
        
        <ToolbarButton onClick={undo} title="Desfazer (Ctrl+Z)">
          <Undo className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={redo} title="Refazer (Ctrl+Shift+Z)">
          <Redo className="h-4 w-4" />
        </ToolbarButton>
      </div>

      {/* Editor Area */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        className="p-4 outline-none prose prose-sm dark:prose-invert max-w-none overflow-auto"
        style={{ minHeight }}
        data-placeholder={placeholder}
        suppressContentEditableWarning
      />

      <style>{`
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: hsl(var(--muted-foreground));
          pointer-events: none;
        }
        [contenteditable] a {
          color: hsl(var(--primary));
          text-decoration: underline;
        }
        [contenteditable] h2 {
          font-size: 1.25rem;
          font-weight: 600;
          margin: 0.5rem 0;
        }
        [contenteditable] ul, [contenteditable] ol {
          padding-left: 1.5rem;
          margin: 0.5rem 0;
        }
        [contenteditable] p {
          margin: 0.25rem 0;
        }
      `}</style>
    </div>
  );
};
