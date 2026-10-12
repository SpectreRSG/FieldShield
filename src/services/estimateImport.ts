/**
 * Estimate CSV import. Parsing → mapping → validation happens fully in memory;
 * nothing is saved until the user confirms, so an interrupted or failed import
 * never leaves half an estimate behind.
 */
import Papa from 'papaparse';
import type { EstimateLine, Inspection } from '../domain/models';
import { newId, nowIso } from '../domain/ids';

export const IMPORT_FIELDS = [
  { key: 'lineNo', label: 'Line number', required: false },
  { key: 'description', label: 'Description', required: true },
  { key: 'quantity', label: 'Quantity', required: true },
  { key: 'unit', label: 'Unit', required: true },
  { key: 'unitPrice', label: 'Unit price', required: false },
  { key: 'total', label: 'Line total', required: false },
  { key: 'area', label: 'Room / area', required: false },
  { key: 'component', label: 'Component', required: false }
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]['key'];
export type ColumnMapping = Partial<Record<ImportFieldKey, string>>;

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
  errors: string[];
}

export function parseCsv(text: string): ParsedCsv {
  const res = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim()
  });
  return {
    headers: (res.meta.fields ?? []).filter((h) => h !== ''),
    rows: res.data,
    errors: res.errors.slice(0, 20).map((e) => `Row ${(e.row ?? 0) + 2}: ${e.message}`)
  };
}

const GUESSES: Record<ImportFieldKey, RegExp> = {
  lineNo: /^(line|#|no\.?|line ?(no|number|#)|item ?#?)$/i,
  description: /desc|item|activity|line item/i,
  quantity: /^(qty|quantity|quan)/i,
  unit: /^(unit|uom|units|u\/m)$/i,
  unitPrice: /(unit ?(price|cost)|price|rate|cost each)/i,
  total: /(total|amount|extended|rcv|line ?total)/i,
  area: /(room|area|location|group)/i,
  component: /(component|category|cat|trade)/i
};

export function guessMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<string>();
  // Order matters: specific fields first so "Unit price" is not taken as "Unit".
  const order: ImportFieldKey[] = ['unitPrice', 'lineNo', 'quantity', 'unit', 'total', 'description', 'area', 'component'];
  for (const key of order) {
    const h = headers.find((x) => !used.has(x) && GUESSES[key].test(x));
    if (h) {
      mapping[key] = h;
      used.add(h);
    }
  }
  return mapping;
}

/** Parse "$1,234.50", "1 234,5" style values. Returns null for blanks, NaN for garbage. */
export function parseNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const s = raw.trim().replace(/[$€£\s]/g, '').replace(/,(?=\d{3}\b)/g, '');
  if (s === '') return null;
  const neg = /^\(.*\)$/.test(s);
  const n = Number.parseFloat(s.replace(/[()]/g, '').replace(',', '.'));
  if (!Number.isFinite(n)) return Number.NaN;
  return neg ? -n : n;
}

export interface MappedImport {
  lines: EstimateLine[];
  rowErrors: string[];
  skipped: number;
}

export function applyMapping(parsed: ParsedCsv, mapping: ColumnMapping, insp: Inspection): MappedImport {
  const missing = IMPORT_FIELDS.filter((f) => f.required && !mapping[f.key]).map((f) => f.label);
  if (missing.length) return { lines: [], rowErrors: [`Map these required columns first: ${missing.join(', ')}`], skipped: 0 };

  const now = nowIso();
  const lines: EstimateLine[] = [];
  const rowErrors: string[] = [];
  let skipped = 0;
  parsed.rows.forEach((row, i) => {
    const get = (k: ImportFieldKey) => (mapping[k] ? (row[mapping[k]!] ?? '').trim() : '');
    const description = get('description');
    if (!description) {
      skipped += 1;
      return;
    }
    const num = (k: ImportFieldKey) => {
      const v = parseNumber(get(k));
      if (v !== null && Number.isNaN(v)) {
        rowErrors.push(`Row ${i + 2}: "${get(k)}" in ${k} is not a number — left blank for review`);
        return null;
      }
      return v;
    };
    const areaText = get('area').toLowerCase();
    const area = areaText ? insp.areas.find((a) => a.name.toLowerCase() === areaText) ?? insp.areas.find((a) => a.name.toLowerCase().includes(areaText)) : undefined;
    if (areaText && !area) rowErrors.push(`Row ${i + 2}: area "${get('area')}" did not match an inspection area — link it manually`);
    lines.push({
      id: newId('line'),
      lineNo: get('lineNo') || String(lines.length + 1),
      description,
      quantity: num('quantity'),
      unit: get('unit'),
      unitPrice: num('unitPrice'),
      total: num('total'),
      areaId: area?.id,
      component: get('component'),
      source: 'imported',
      createdAt: now,
      updatedAt: now
    });
  });
  return { lines, rowErrors, skipped };
}

export const SAMPLE_ESTIMATE_CSV = `Line,Description,Qty,Unit,Unit Price,Total,Room
1,Remove laminated comp. shingle roofing,32.5,SQ,62.00,2015.00,Roof
2,Laminated comp. shingle roofing - w/out felt,36.0,SQ,268.00,9648.00,Roof
3,Drip edge,180,LF,3.10,558.00,Roof
4,Hip / Ridge cap - composition shingles,60,LF,8.25,495.00,Roof
5,Drywall - 1/2in hung taped floated ready for paint,180,SF,2.85,513.00,Kitchen
6,Paint the walls - two coats,412,SF,1.05,432.60,Kitchen
7,Paint the walls - two coats,412,SF,1.05,432.60,Kitchen
`;
