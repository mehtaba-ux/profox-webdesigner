import assert from 'node:assert/strict';
import test from 'node:test';
import { scanAttachmentBytes } from '../../worker/attachmentScanner';

function bytes(values: number[]): ArrayBuffer {
  return Uint8Array.from(values).buffer;
}

function ascii(value: string): ArrayBuffer {
  return new TextEncoder().encode(value).buffer;
}

function concat(...parts: Uint8Array[]): ArrayBuffer {
  const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result.buffer;
}

test('accepts a clean PNG signature', () => {
  const result = scanAttachmentBytes(bytes([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00,0x01]), 'image/png');
  assert.equal(result.safe, true);
});

test('blocks an executable disguised as a PNG', () => {
  const result = scanAttachmentBytes(bytes([0x4d,0x5a,0x90,0x00,0x03,0x00]), 'image/png');
  assert.equal(result.safe, false);
  assert.deepEqual(result.signals, ['executable-signature']);
});

test('blocks the EICAR antivirus test marker', () => {
  const marker = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
  const result = scanAttachmentBytes(ascii(`%PDF-1.7\n${marker}\n%%EOF`), 'application/pdf');
  assert.equal(result.safe, false);
  assert.deepEqual(result.signals, ['eicar']);
});

test('blocks active-content PDFs', () => {
  const result = scanAttachmentBytes(ascii('%PDF-1.7\n1 0 obj << /JavaScript (alert) >> endobj\n%%EOF'), 'application/pdf');
  assert.equal(result.safe, false);
  assert.ok(result.signals.some(signal => signal.startsWith('pdf:')));
});

test('accepts a passive PDF', () => {
  const result = scanAttachmentBytes(ascii('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF'), 'application/pdf');
  assert.equal(result.safe, true);
});

test('blocks legacy macro-capable Office formats', () => {
  const result = scanAttachmentBytes(ascii('ordinary document bytes'), 'application/msword');
  assert.equal(result.safe, false);
  assert.deepEqual(result.signals, ['legacy-office']);
});

test('blocks a file whose declared MIME does not match its signature', () => {
  const result = scanAttachmentBytes(ascii('not really a jpeg'), 'image/jpeg');
  assert.equal(result.safe, false);
  assert.deepEqual(result.signals, ['magic-mismatch']);
});

test('accepts a structurally recognizable DOCX container', () => {
  const result = scanAttachmentBytes(
    concat(
      Uint8Array.from([0x50,0x4b,0x03,0x04]),
      new TextEncoder().encode('payload/[Content_Types].xml/word/document.xml')
    ),
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
  assert.equal(result.safe, true);
});

test('blocks a macro payload inside a modern Office container', () => {
  const result = scanAttachmentBytes(
    concat(
      Uint8Array.from([0x50,0x4b,0x03,0x04]),
      new TextEncoder().encode('payload/[Content_Types].xml/word/vbaProject.bin')
    ),
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
  assert.equal(result.safe, false);
  assert.ok(result.signals.includes('archive:vbaproject.bin'));
});
