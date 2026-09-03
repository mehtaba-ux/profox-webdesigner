/// <reference types="@cloudflare/workers-types" />

export const ATTACHMENT_SCAN_ENGINE = 'profox-attachment-guard-v1';

export type AttachmentScanResult = {
  safe: boolean;
  engine: string;
  reason?: string;
  signals: string[];
};

const LEGACY_OFFICE_TYPES = new Set([
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
]);

const ZIP_OFFICE_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

const DANGEROUS_ARCHIVE_NAMES = [
  'vbaproject.bin', '.exe', '.dll', '.com', '.scr', '.msi', '.jar', '.lnk',
  '.js', '.jse', '.vbs', '.vbe', '.ps1', '.bat', '.cmd', '.hta',
];

const ACTIVE_PDF_TOKENS = ['/javascript', '/launch', '/embeddedfile', '/richmedia'];
const EICAR_MARKER = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  if (bytes.length < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[offset + i] !== signature[i]) return false;
  }
  return true;
}

function asciiLowerWindow(bytes: Uint8Array) {
  let value = '';
  const chunkSize = 0x4000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    value += String.fromCharCode(...chunk);
  }
  return value.toLowerCase();
}

function containsAscii(bytes: Uint8Array, needle: string) {
  if (!needle || bytes.length < needle.length) return false;
  const pattern = new TextEncoder().encode(needle);
  outer: for (let i = 0; i <= bytes.length - pattern.length; i += 1) {
    for (let j = 0; j < pattern.length; j += 1) {
      if (bytes[i + j] !== pattern[j]) continue outer;
    }
    return true;
  }
  return false;
}

function executableSignature(bytes: Uint8Array) {
  if (startsWith(bytes, [0x4d, 0x5a])) return 'Windows executable (MZ/PE)';
  if (startsWith(bytes, [0x7f, 0x45, 0x4c, 0x46])) return 'ELF executable';
  if (startsWith(bytes, [0xca, 0xfe, 0xba, 0xbe])) return 'Java class / Mach-O universal executable';
  if (startsWith(bytes, [0xfe, 0xed, 0xfa, 0xce]) || startsWith(bytes, [0xfe, 0xed, 0xfa, 0xcf]) || startsWith(bytes, [0xce, 0xfa, 0xed, 0xfe]) || startsWith(bytes, [0xcf, 0xfa, 0xed, 0xfe])) return 'Mach-O executable';
  return '';
}

function validateMagic(bytes: Uint8Array, contentType: string): string {
  if (contentType === 'image/jpeg' && !startsWith(bytes, [0xff, 0xd8, 0xff])) return 'JPEG signature mismatch';
  if (contentType === 'image/png' && !startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'PNG signature mismatch';
  if (contentType === 'image/gif' && !(startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))) return 'GIF signature mismatch';
  if (contentType === 'image/webp' && !(startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8))) return 'WebP signature mismatch';
  if (contentType === 'application/pdf' && !startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'PDF signature mismatch';
  if (contentType === 'video/webm' && !startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return 'WebM signature mismatch';
  if ((contentType === 'video/mp4' || contentType === 'video/quicktime') && !(bytes.length >= 12 && startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4))) return 'MP4/MOV signature mismatch';
  if (ZIP_OFFICE_TYPES.has(contentType) && !(startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06]) || startsWith(bytes, [0x50, 0x4b, 0x07, 0x08]))) return 'Office Open XML signature mismatch';
  if ((contentType === 'text/plain' || contentType === 'text/csv') && bytes.subarray(0, Math.min(bytes.length, 1024 * 1024)).some(byte => byte === 0)) return 'Text file contains binary NUL bytes';
  return '';
}

export function scanAttachmentBytes(buffer: ArrayBuffer, contentType: string): AttachmentScanResult {
  const bytes = new Uint8Array(buffer);
  const type = (contentType || '').toLowerCase();
  const signals: string[] = [];

  if (!bytes.length) return { safe: false, engine: ATTACHMENT_SCAN_ENGINE, reason: 'Empty files are not accepted.', signals: ['empty'] };

  const executable = executableSignature(bytes);
  if (executable) return { safe: false, engine: ATTACHMENT_SCAN_ENGINE, reason: `Blocked executable content: ${executable}.`, signals: ['executable-signature'] };

  if (LEGACY_OFFICE_TYPES.has(type)) {
    return { safe: false, engine: ATTACHMENT_SCAN_ENGINE, reason: 'Legacy Office files are blocked because they can carry difficult-to-audit macros. Convert the file to DOCX, XLSX, PPTX or PDF.', signals: ['legacy-office'] };
  }

  const magicProblem = validateMagic(bytes, type);
  if (magicProblem) return { safe: false, engine: ATTACHMENT_SCAN_ENGINE, reason: `Blocked disguised or malformed file: ${magicProblem}.`, signals: ['magic-mismatch'] };

  if (containsAscii(bytes, EICAR_MARKER)) {
    return { safe: false, engine: ATTACHMENT_SCAN_ENGINE, reason: 'Known antivirus test/malware marker detected.', signals: ['eicar'] };
  }

  const head = bytes.subarray(0, Math.min(bytes.length, 8 * 1024 * 1024));
  const tail = bytes.subarray(Math.max(0, bytes.length - 4 * 1024 * 1024));

  if (type === 'application/pdf') {
    const pdfWindow = `${asciiLowerWindow(head)}\n${asciiLowerWindow(tail)}`;
    const token = ACTIVE_PDF_TOKENS.find(value => pdfWindow.includes(value));
    if (token) return { safe: false, engine: ATTACHMENT_SCAN_ENGINE, reason: 'Active or embedded executable PDF content is not allowed in chat attachments.', signals: [`pdf:${token}`] };
  }

  if (ZIP_OFFICE_TYPES.has(type)) {
    const archiveDirectory = asciiLowerWindow(tail);
    const dangerous = DANGEROUS_ARCHIVE_NAMES.find(value => archiveDirectory.includes(value));
    if (dangerous) return { safe: false, engine: ATTACHMENT_SCAN_ENGINE, reason: 'The Office document contains a macro, executable, script or shortcut payload and was quarantined.', signals: [`archive:${dangerous}`] };
    const familyMarker = type.includes('wordprocessingml') ? 'word/' : type.includes('spreadsheetml') ? 'xl/' : 'ppt/';
    if (!archiveDirectory.includes('[content_types].xml') || !archiveDirectory.includes(familyMarker)) {
      return { safe: false, engine: ATTACHMENT_SCAN_ENGINE, reason: 'The Office document structure does not match its declared file type.', signals: ['office-structure-mismatch'] };
    }
  }

  signals.push('magic-ok', 'active-content-screened', 'executable-screened', 'eicar-screened');
  return { safe: true, engine: ATTACHMENT_SCAN_ENGINE, signals };
}

export async function scanMultipartUpload(request: Request): Promise<AttachmentScanResult | null> {
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.toLowerCase().includes('multipart/form-data')) return null;
  const form = await request.clone().formData();
  const file = form.get('file');
  if (!(file instanceof File)) return null;
  const bytes = await file.arrayBuffer();
  return scanAttachmentBytes(bytes, (file.type || '').toLowerCase());
}
