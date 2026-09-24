import { useEffect, useState } from 'react';
import { Download, FileText, Film, Image as ImageIcon, Loader2, Paperclip } from 'lucide-react';
import {
  downloadCommunicationAttachment,
  fetchCommunicationAttachmentBlob,
  formatAttachmentSize,
  type CommunicationAttachment,
} from '../../lib/communicationAttachmentService';

function isStoredAttachment(attachment: CommunicationAttachment) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(attachment.id || ''));
}

function AttachmentPreview({ attachment, conversationId, inverse }: {
  attachment: CommunicationAttachment;
  conversationId?: string;
  inverse: boolean;
}) {
  const [previewUrl, setPreviewUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const previewable = attachment.contentType?.startsWith('image/') || attachment.contentType?.startsWith('video/');
  const stored = isStoredAttachment(attachment);

  useEffect(() => {
    if (!previewable || !stored) return;
    let active = true;
    let objectUrl = '';
    setLoading(true);
    void fetchCommunicationAttachmentBlob({ attachment, conversationId })
      .then(blob => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
        setError('');
      })
      .catch(err => { if (active) setError(err?.message || 'Preview unavailable.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id, attachment.contentType, conversationId, previewable, stored]);

  const textColor = inverse ? 'text-white/80' : 'text-slate-600';
  const borderColor = inverse ? 'border-white/20 bg-white/10' : 'border-slate-200 bg-white';
  const icon = attachment.contentType?.startsWith('video/') ? <Film className="h-4 w-4" /> : attachment.contentType?.startsWith('image/') ? <ImageIcon className="h-4 w-4" /> : attachment.contentType === 'application/pdf' ? <FileText className="h-4 w-4" /> : <Paperclip className="h-4 w-4" />;

  return <div className={`overflow-hidden rounded-xl border ${borderColor}`}>
    {loading && <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin opacity-60" /></div>}
    {!loading && previewUrl && attachment.contentType?.startsWith('image/') && <img src={previewUrl} alt={attachment.name} className="max-h-64 w-full object-contain" />}
    {!loading && previewUrl && attachment.contentType?.startsWith('video/') && <video src={previewUrl} controls preload="metadata" className="max-h-72 w-full bg-black" />}
    {!loading && error && <div className={`px-3 pt-2 text-[10px] ${textColor}`}>{error}</div>}
    <div className="flex items-center gap-2 p-2.5">
      <span className="shrink-0 opacity-70">{icon}</span>
      <div className="min-w-0 flex-1"><div className="truncate text-[11px] font-bold">{attachment.name || 'Attachment'}</div><div className={`text-[9px] ${textColor}`}>{formatAttachmentSize(Number(attachment.sizeBytes || 0)) || attachment.contentType || 'File'}</div></div>
      {stored && <button type="button" title="Download attachment" onClick={() => void downloadCommunicationAttachment({ attachment, conversationId })} className="rounded-lg p-1.5 opacity-70 transition hover:bg-black/5 hover:opacity-100"><Download className="h-4 w-4" /></button>}
    </div>
  </div>;
}

export default function CommunicationAttachmentList({ attachments, conversationId, inverse = false }: {
  attachments?: CommunicationAttachment[] | null;
  conversationId?: string;
  inverse?: boolean;
}) {
  const rows = Array.isArray(attachments) ? attachments.filter(item => item && (item.name || item.id)) : [];
  if (!rows.length) return null;
  return <div className="mt-2 grid gap-2 sm:grid-cols-2">
    {rows.map((attachment, index) => <AttachmentPreview key={`${attachment.id || attachment.name}-${index}`} attachment={attachment} conversationId={conversationId} inverse={inverse} />)}
  </div>;
}
