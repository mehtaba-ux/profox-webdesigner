import { useRef } from 'react';
import { Link2, Paperclip, X } from 'lucide-react';
import {
  COMMUNICATION_ATTACHMENT_ACCEPT,
  COMMUNICATION_ATTACHMENT_MAX_COUNT,
  formatAttachmentSize,
  validateCommunicationAttachmentSelection,
} from '../../lib/communicationAttachmentService';
import { appendCommunicationUrl } from './RichMessageText';

export default function CommunicationComposerTools({
  files,
  onFilesChange,
  text,
  onTextChange,
  disabled = false,
  attachmentsEnabled = true,
  maxTotalBytes,
  compact = false,
}: {
  files: File[];
  onFilesChange: (files: File[]) => void;
  text: string;
  onTextChange: (text: string) => void;
  disabled?: boolean;
  attachmentsEnabled?: boolean;
  maxTotalBytes?: number;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (incoming: File[]) => {
    const next = [...files, ...incoming].slice(0, COMMUNICATION_ATTACHMENT_MAX_COUNT);
    validateCommunicationAttachmentSelection(next, maxTotalBytes);
    onFilesChange(next);
  };

  const addLink = () => {
    try { onTextChange(appendCommunicationUrl(text)); }
    catch (error: any) { window.alert(error?.message || 'That URL could not be added.'); }
  };

  return <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
    <input
      ref={inputRef}
      type="file"
      multiple
      accept={COMMUNICATION_ATTACHMENT_ACCEPT}
      className="hidden"
      onChange={event => {
        const selected = Array.from(event.target.files || []);
        event.currentTarget.value = '';
        if (!selected.length) return;
        try { addFiles(selected); }
        catch (error: any) { window.alert(error?.message || 'The selected files cannot be attached.'); }
      }}
    />
    <div className="flex flex-wrap items-center gap-1.5">
      {attachmentsEnabled && <button type="button" disabled={disabled || files.length >= COMMUNICATION_ATTACHMENT_MAX_COUNT} onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-600 hover:border-[#000080]/40 hover:text-[#000080] disabled:cursor-not-allowed disabled:opacity-40"><Paperclip className="h-3.5 w-3.5" />Attach</button>}
      <button type="button" disabled={disabled} onClick={addLink} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-600 hover:border-[#000080]/40 hover:text-[#000080] disabled:cursor-not-allowed disabled:opacity-40"><Link2 className="h-3.5 w-3.5" />Add URL</button>
      {attachmentsEnabled && <span className="text-[9px] text-slate-400">Images, video, PDF & documents · max 5 · 50 MB each</span>}
    </div>
    {files.length > 0 && <div className="flex flex-wrap gap-1.5">
      {files.map((file, index) => <span key={`${file.name}-${file.size}-${index}`} className="inline-flex max-w-full items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[9px] font-semibold text-slate-600"><span className="max-w-48 truncate">{file.name}</span><span className="text-slate-400">{formatAttachmentSize(file.size)}</span><button type="button" aria-label={`Remove ${file.name}`} disabled={disabled} onClick={() => onFilesChange(files.filter((_, i) => i !== index))} className="rounded p-0.5 hover:bg-slate-200"><X className="h-3 w-3" /></button></span>)}
    </div>}
  </div>;
}
