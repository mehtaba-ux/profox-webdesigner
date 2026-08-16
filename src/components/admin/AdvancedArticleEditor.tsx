import { useEffect, useRef, useState } from 'react';
import { Bold, Code2, Heading2, Heading3, ImagePlus, Italic, Link2, List, ListOrdered, Minus, Pilcrow, Quote, Redo2, RemoveFormatting, Table2, Underline, Undo2, Video } from 'lucide-react';
import ImageUploader from './ImageUploader';

interface AdvancedArticleEditorProps {
  value: string;
  onChange: (value: string) => void;
}

const buttonClass = 'grid h-9 w-9 place-items-center rounded-lg text-slate-600 transition-colors hover:bg-[#000080]/10 hover:text-[#000080]';

export default function AdvancedArticleEditor({ value, onChange }: AdvancedArticleEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [sourceMode, setSourceMode] = useState(false);
  const [showImage, setShowImage] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [imageAlt, setImageAlt] = useState('');

  useEffect(() => {
    if (!sourceMode && editorRef.current && editorRef.current.innerHTML !== value) editorRef.current.innerHTML = value || '<p><br></p>';
  }, [value, sourceMode]);

  const emit = () => onChange(editorRef.current?.innerHTML || '');
  const command = (name: string, commandValue?: string) => {
    editorRef.current?.focus();
    document.execCommand(name, false, commandValue);
    emit();
  };
  const block = (tag: string) => command('formatBlock', tag);
  const insertHtml = (html: string) => command('insertHTML', html);
  const addLink = () => {
    const href = window.prompt('Enter the complete link URL');
    if (href) command('createLink', href);
  };
  const addTable = () => insertHtml('<div class="article-table-wrap"><table><thead><tr><th>Heading 1</th><th>Heading 2</th></tr></thead><tbody><tr><td>Content</td><td>Content</td></tr><tr><td>Content</td><td>Content</td></tr></tbody></table></div><p><br></p>');
  const addVideo = () => {
    const source = window.prompt('Paste a YouTube, Vimeo, or direct video URL');
    if (!source) return;
    let embedUrl = source.trim();
    const youtube = embedUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^?&/]+)/i);
    const vimeo = embedUrl.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
    if (youtube) embedUrl = `https://www.youtube.com/embed/${youtube[1]}`;
    if (vimeo) embedUrl = `https://player.vimeo.com/video/${vimeo[1]}`;
    const safeUrl = embedUrl.replace(/"/g, '&quot;');
    if (/youtube\.com\/embed|player\.vimeo\.com\/video/i.test(safeUrl)) insertHtml(`<div class="article-video"><iframe src="${safeUrl}" title="Embedded article video" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div><p><br></p>`);
    else insertHtml(`<div class="article-video"><video src="${safeUrl}" controls preload="metadata"></video></div><p><br></p>`);
  };
  const addImage = () => {
    if (!imageUrl.trim()) return;
    const safeUrl = imageUrl.replace(/"/g, '&quot;');
    const safeAlt = imageAlt.replace(/"/g, '&quot;');
    insertHtml(`<figure><img src="${safeUrl}" alt="${safeAlt}" loading="lazy"><figcaption>${safeAlt || 'Add an image caption'}</figcaption></figure><p><br></p>`);
    setImageUrl('');
    setImageAlt('');
    setShowImage(false);
  };

  const tools = [
    { title: 'Paragraph', icon: Pilcrow, action: () => block('p') },
    { title: 'Heading 2', icon: Heading2, action: () => block('h2') },
    { title: 'Heading 3', icon: Heading3, action: () => block('h3') },
    { title: 'Bold', icon: Bold, action: () => command('bold') },
    { title: 'Italic', icon: Italic, action: () => command('italic') },
    { title: 'Underline', icon: Underline, action: () => command('underline') },
    { title: 'Bullet list', icon: List, action: () => command('insertUnorderedList') },
    { title: 'Numbered list', icon: ListOrdered, action: () => command('insertOrderedList') },
    { title: 'Quote', icon: Quote, action: () => block('blockquote') },
    { title: 'Add link', icon: Link2, action: addLink },
    { title: 'Horizontal rule', icon: Minus, action: () => insertHtml('<hr><p><br></p>') },
    { title: 'Table', icon: Table2, action: addTable },
    { title: 'Embed video', icon: Video, action: addVideo },
    { title: 'Clear formatting', icon: RemoveFormatting, action: () => command('removeFormat') },
    { title: 'Undo', icon: Undo2, action: () => command('undo') },
    { title: 'Redo', icon: Redo2, action: () => command('redo') },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b border-slate-200 bg-white/95 p-2.5 backdrop-blur">
        {tools.map(({ title, icon: Icon, action }) => <button key={title} type="button" title={title} aria-label={title} onMouseDown={event => event.preventDefault()} onClick={action} className={buttonClass}><Icon className="h-4 w-4" /></button>)}
        <span className="mx-1 h-6 w-px bg-slate-200" />
        <button type="button" onClick={() => setShowImage(value => !value)} className={`${buttonClass} ${showImage ? 'bg-[#000080] text-white hover:text-white' : ''}`} title="Insert image"><ImagePlus className="h-4 w-4" /></button>
        <button type="button" onClick={() => setSourceMode(mode => !mode)} className={`${buttonClass} ${sourceMode ? 'bg-slate-900 text-white hover:text-white' : ''}`} title="HTML source"><Code2 className="h-4 w-4" /></button>
        <span className="ml-auto pr-2 text-xs font-semibold text-slate-400">Visual article editor</span>
      </div>

      {showImage && <div className="grid gap-4 border-b border-slate-200 bg-slate-50 p-5 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
        <ImageUploader label="Upload or select article image" value={imageUrl} onChange={setImageUrl} />
        <label className="space-y-2"><span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Alt text / caption</span><input value={imageAlt} onChange={event => setImageAlt(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-[#000080]" placeholder="Describe the image for accessibility" /></label>
        <button type="button" disabled={!imageUrl.trim()} onClick={addImage} className="min-h-11 rounded-xl bg-[#000080] px-5 text-sm font-bold text-white disabled:opacity-40">Insert Image</button>
      </div>}

      {sourceMode ? <textarea value={value} onChange={event => onChange(event.target.value)} rows={24} spellCheck={false} className="min-h-[560px] w-full resize-y bg-slate-950 p-6 font-mono text-sm leading-7 text-slate-100 outline-none" /> : <div ref={editorRef} contentEditable suppressContentEditableWarning onInput={emit} onBlur={emit} data-placeholder="Start writing your insight…" className="article-editor-content min-h-[620px] p-7 text-base leading-7 text-slate-700 outline-none sm:p-10" />}
    </div>
  );
}
