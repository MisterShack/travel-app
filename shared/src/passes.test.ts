import { describe, expect, it } from 'vitest';
import { MAX_PASS_BYTES, passBindingSchema, safeFilename, sniffContentType } from './passes';

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new TextEncoder().encode(text);

describe('sniffContentType', () => {
  it('recognises each accepted format by its own first bytes', () => {
    expect(sniffContentType(ascii('%PDF-1.7\n...'))).toBe('application/pdf');
    expect(sniffContentType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe('image/png');
    expect(sniffContentType(bytes(0xff, 0xd8, 0xff, 0xe0, 0))).toBe('image/jpeg');
    expect(sniffContentType(ascii('PK\u0003\u0004rest of a zip'))).toBe(
      'application/vnd.apple.pkpass',
    );
  });

  /**
   * The point of the allowlist. What is dangerous is not accepting a document —
   * it is serving one back from our own origin, where anything the browser will
   * render is script holding the reader's session cookie.
   */
  it('refuses the formats that can carry script', () => {
    expect(sniffContentType(ascii('<!doctype html><script>1</script>'))).toBeNull();
    expect(sniffContentType(ascii('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffContentType(ascii('#!/bin/sh\nrm -rf /'))).toBeNull();
    expect(sniffContentType(ascii('GIF89a'))).toBeNull();
  });

  it('refuses a file too short to have a signature', () => {
    expect(sniffContentType(new Uint8Array(0))).toBeNull();
    expect(sniffContentType(bytes(0x25, 0x50))).toBeNull();
  });

  /**
   * Leading whitespace does not make a file a PDF. A browser's own sniffing is
   * lenient about this and that leniency is exactly what is not wanted here.
   */
  it('matches only at the very start', () => {
    expect(sniffContentType(ascii('   %PDF-1.7'))).toBeNull();
    expect(sniffContentType(ascii('\n%PDF-1.7'))).toBeNull();
  });
});

describe('safeFilename', () => {
  it('keeps an ordinary name', () => {
    expect(safeFilename('boarding pass.pdf')).toBe('boarding pass.pdf');
  });

  /** The name reaches a `Content-Disposition`, and one day maybe a filesystem. */
  it('keeps only the last path segment', () => {
    expect(safeFilename('../../etc/passwd')).toBe('passwd');
    expect(safeFilename('C:\\Windows\\System32\\config')).toBe('config');
    expect(safeFilename('/absolute/path/pass.pkpass')).toBe('pass.pkpass');
  });

  /** The header is quoted, so a quote or a newline in the name would break out. */
  it('strips quotes, backslashes and control characters', () => {
    expect(safeFilename('a"b.pdf')).toBe('ab.pdf');
  });

  /**
   * A header-injection attempt loses to the *path* step before the control
   * characters are even reached: the slash in `text/html` is a separator, so
   * only the last segment survives and the CRLFs go with everything before it.
   */
  it('defeats a Content-Disposition injection', () => {
    expect(safeFilename('a\r\nContent-Type: text/html\r\n\r\n.pdf')).toBe('html.pdf');
  });

  it('falls back rather than returning nothing', () => {
    expect(safeFilename('')).toBe('pass');
    expect(safeFilename('..')).toBe('pass');
    expect(safeFilename('///')).toBe('pass');
    expect(safeFilename('"""')).toBe('pass');
  });

  it('bounds the length', () => {
    expect(safeFilename('x'.repeat(500))).toHaveLength(120);
  });
});

describe('passBindingSchema', () => {
  it('accepts a whole binding, and none at all', () => {
    expect(passBindingSchema.safeParse({ relatedType: 'segment', relatedId: 'flt_1' }).success).toBe(true);
    expect(passBindingSchema.safeParse({ relatedType: null, relatedId: null }).success).toBe(true);
  });

  /** Half a binding is a row nothing can resolve. */
  it('refuses half of one', () => {
    expect(passBindingSchema.safeParse({ relatedType: 'segment', relatedId: null }).success).toBe(false);
    expect(passBindingSchema.safeParse({ relatedType: null, relatedId: 'flt_1' }).success).toBe(false);
  });

  it('refuses a kind that is not a timeline entity', () => {
    expect(passBindingSchema.safeParse({ relatedType: 'trip', relatedId: 'trp_1' }).success).toBe(false);
  });
});

describe('the ceiling', () => {
  it('is generous for a ticket and mean for a file host', () => {
    expect(MAX_PASS_BYTES).toBe(2 * 1024 * 1024);
  });
});
