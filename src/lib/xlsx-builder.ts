// src/lib/xlsx-builder.ts
// Generador OOXML (.xlsx) nativo sin dependencias externas usando node:zlib
// Compatible 100% con Microsoft Excel, LibreOffice Calc y Google Sheets

import { deflateRawSync } from 'node:zlib';

export type XlsxStyleId = 0 | 1 | 2 | 3 | 4 | 5 | 6;
// 0 = Normal, 1 = Banner Verde (#00594E blanco negrita), 2 = Header Tabla (#00594E),
// 3 = Subheader Dorado (#F7F5EE texto #786832), 4 = Fila Zebra Menta (#F2F7F6),
// 5 = Fila Blanca con Borde (#FFFFFF), 6 = Indicador Destacado (#00594E negrita)

export interface XlsxCell {
  value: string | number | null | undefined;
  style?: XlsxStyleId;
}

export interface XlsxSheetSpec {
  name: string;
  colWidths?: number[];
  rows: XlsxCell[][];
}

const CRC_TABLE = (() => {
  const tbl = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    tbl[n] = c >>> 0;
  }
  return tbl;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8)) >>> 0;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function escapeXml(str: string): string {
  return str
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sanitizeSheetName(raw: string, index: number): string {
  const cleaned = String(raw || `Hoja ${index + 1}`)
    .replace(/[\\/*?:[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 31);
  return cleaned || `Hoja${index + 1}`;
}

function colIndexToLetter(colIdx: number): string {
  let n = colIdx + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function buildWorksheetXml(sheet: XlsxSheetSpec): string {
  const rows = sheet.rows || [];
  const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 1);

  const widths: number[] = Array.from({ length: maxCols }, (_, ci) => {
    if (sheet.colWidths && sheet.colWidths[ci]) return sheet.colWidths[ci]!;
    let longest = 12;
    for (const row of rows) {
      const val = String(row[ci]?.value ?? '');
      longest = Math.max(longest, Math.min(48, val.length + 4));
    }
    return longest;
  });

  const colsXml = widths
    .map((w, idx) => `<col min="${idx + 1}" max="${idx + 1}" width="${w}" customWidth="1"/>`)
    .join('');

  const rowsXml = rows
    .map((row, rIdx) => {
      const rNum = rIdx + 1;
      const isBanner = row.some((c) => c?.style === 1);
      const isHeader = row.some((c) => c?.style === 2 || c?.style === 3);
      const ht = isBanner ? 26 : isHeader ? 22 : 19;
      const cellsXml = row
        .map((cell, cIdx) => {
          const ref = `${colIndexToLetter(cIdx)}${rNum}`;
          const s = cell?.style ?? 5;
          const v = cell?.value;
          if (typeof v === 'number' && Number.isFinite(v)) {
            return `<c r="${ref}" s="${s}"><v>${v}</v></c>`;
          }
          const txt = escapeXml(String(v ?? ''));
          return `<c r="${ref}" t="inlineStr" s="${s}"><is><t xml:space="preserve">${txt}</t></is></c>`;
        })
        .join('');
      return `<row r="${rNum}" ht="${ht}" customHeight="1">${cellsXml}</row>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="19"/>
  <cols>${colsXml}</cols>
  <sheetData>${rowsXml}</sheetData>
</worksheet>`;
}

function buildStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="5">
    <font><sz val="10"/><color rgb="FF111827"/><name val="Calibri"/></font>
    <font><b/><sz val="13"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FF786832"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FF00594E"/><name val="Calibri"/></font>
  </fonts>
  <fills count="6">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF00594E"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF7F5EE"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF2F7F6"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/></patternFill></fill>
  </fills>
  <borders count="3">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFDCE4E3"/></left>
      <right style="thin"><color rgb="FFDCE4E3"/></right>
      <top style="thin"><color rgb="FFDCE4E3"/></top>
      <bottom style="thin"><color rgb="FFDCE4E3"/></bottom>
    </border>
    <border>
      <left style="thin"><color rgb="FF00423A"/></left>
      <right style="thin"><color rgb="FF00423A"/></right>
      <top style="thin"><color rgb="FF00423A"/></top>
      <bottom style="medium"><color rgb="FFB5A160"/></bottom>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="7">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
  </cellXfs>
</styleSheet>`;
}

interface ZipEntry {
  name: string;
  data: Buffer;
}

function buildZipBuffer(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const rawBuf = entry.data;
    const compBuf = deflateRawSync(rawBuf, { level: 6 });
    const crc = crc32(rawBuf);

    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
    localHeader.writeUInt16LE(20, 4);         // Version needed
    localHeader.writeUInt16LE(0x0800, 6);     // UTF-8 flag
    localHeader.writeUInt16LE(8, 8);          // Compression: Deflate
    localHeader.writeUInt16LE(0, 10);         // Mod time
    localHeader.writeUInt16LE(0x5421, 12);    // Mod date
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compBuf.length, 18);
    localHeader.writeUInt32LE(rawBuf.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);
    nameBuf.copy(localHeader, 30);

    localParts.push(localHeader, compBuf);

    const centralHeader = Buffer.alloc(46 + nameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0x5421, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compBuf.length, 20);
    centralHeader.writeUInt32LE(rawBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    nameBuf.copy(centralHeader, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + compBuf.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, eocd]);
}

export function buildXlsxWorkbookBuffer(sheets: XlsxSheetSpec[]): Buffer {
  const safeSheets = sheets.length > 0 ? sheets : [{ name: 'Resumen', rows: [[{ value: 'Sin datos' }]] }];

  const sheetFiles: ZipEntry[] = safeSheets.map((s, idx) => ({
    name: `xl/worksheets/sheet${idx + 1}.xml`,
    data: Buffer.from(buildWorksheetXml(s), 'utf8'),
  }));

  const overrideEntries = safeSheets
    .map(
      (_, idx) =>
        `<Override PartName="/xl/worksheets/sheet${idx + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join('');

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${overrideEntries}
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookSheetsXml = safeSheets
    .map(
      (s, idx) =>
        `<sheet name="${escapeXml(sanitizeSheetName(s.name, idx))}" sheetId="${idx + 1}" r:id="rId${idx + 1}"/>`
    )
    .join('');

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${workbookSheetsXml}</sheets>
</workbook>`;

  const sheetRelsXml = safeSheets
    .map(
      (_, idx) =>
        `<Relationship Id="rId${idx + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${idx + 1}.xml"/>`
    )
    .join('');

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheetRelsXml}
  <Relationship Id="rId${safeSheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: Buffer.from(contentTypesXml, 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(rootRelsXml, 'utf8') },
    { name: 'xl/workbook.xml', data: Buffer.from(workbookXml, 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(workbookRelsXml, 'utf8') },
    { name: 'xl/styles.xml', data: Buffer.from(buildStylesXml(), 'utf8') },
    ...sheetFiles,
  ];

  return buildZipBuffer(entries);
}

