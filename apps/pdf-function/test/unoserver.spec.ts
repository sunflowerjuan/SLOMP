import { describe, expect, it } from 'vitest';
import { convertRequest, parseConvertResponse } from '../src/unoserver.ts';

describe('unoserver XML-RPC', () => {
  it('sends the .docx as indata and asks for a PDF back', () => {
    const body = convertRequest(Buffer.from('docx bytes'));
    const params = [
      ...body.matchAll(/<param><value>(.*?)<\/value><\/param>/g),
    ].map((match) => match[1]);
    expect(body).toContain('<methodName>convert</methodName>');
    expect(params).toEqual([
      '<nil/>',
      `<base64>${Buffer.from('docx bytes').toString('base64')}</base64>`,
      '<nil/>',
      '<string>pdf</string>',
    ]);
  });

  it('reads the PDF back and turns a fault into a conversion error', () => {
    const pdf = Buffer.from('%PDF-1.7 ... %%EOF');
    const encoded = pdf.toString('base64').replace(/(.{8})/g, '$1\n');
    expect(
      parseConvertResponse(
        `<methodResponse><params><param><value><base64>\n${encoded}\n</base64></value></param></params></methodResponse>`,
      ),
    ).toEqual(pdf);
    expect(() =>
      parseConvertResponse(
        "<methodResponse><fault><value><struct><member><name>faultCode</name><value><int>1</int></value></member><member><name>faultString</name><value><string>&lt;class 'RuntimeError'&gt;:Could not load</string></value></member></struct></value></fault></methodResponse>",
      ),
    ).toThrow(expect.objectContaining({ code: 'PDF_CONVERSION_FAILED' }));
    expect(() =>
      parseConvertResponse(
        "<methodResponse><fault><value><struct><member><name>faultString</name><value><string>&lt;class 'concurrent.futures._base.TimeoutError'&gt;:</string></value></member></struct></value></fault></methodResponse>",
      ),
    ).toThrow(expect.objectContaining({ code: 'PDF_CONVERSION_TIMEOUT' }));
  });
});
