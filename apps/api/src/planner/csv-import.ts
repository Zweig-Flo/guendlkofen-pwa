import { createHash } from 'node:crypto';
import Papa from 'papaparse';
import { HomeAway } from '../generated/prisma/client';
import type { ImportRowErrorDto } from './dto/import-result.dto';

/**
 * Pure CSV parsing + validation for the planner import (§3 of the design doc).
 * No database access lives here so it is trivially unit-testable: parse a
 * string, get back the valid rows plus a row-level error report.
 */

/** The canonical columns after header-alias resolution. */
type CanonicalColumn =
  'date' | 'time' | 'opponent' | 'location' | 'homeAway' | 'notes';

const REQUIRED_COLUMNS: CanonicalColumn[] = ['date', 'time', 'opponent'];

/** Normalised header alias → canonical column. de + en, case-insensitive. */
const HEADER_ALIASES: Record<string, CanonicalColumn> = {
  // date
  datum: 'date',
  date: 'date',
  // time
  zeit: 'time',
  uhrzeit: 'time',
  time: 'time',
  // opponent
  gegner: 'opponent',
  opponent: 'opponent',
  // location
  ort: 'location',
  spielort: 'location',
  location: 'location',
  venue: 'location',
  // homeAway
  'heim/auswärts': 'homeAway',
  heimauswaerts: 'homeAway',
  'h/a': 'homeAway',
  'home/away': 'homeAway',
  homeaway: 'homeAway',
  // notes
  notizen: 'notes',
  hinweis: 'notes',
  notes: 'notes',
  comment: 'notes',
};

/** Used when the uploader sends no (or an invalid) IANA timezone. */
export const DEFAULT_IMPORT_TIMEZONE = 'Europe/Berlin';

/** A validated data row ready to upsert. */
export interface ParsedEventRow {
  /** 1-based data-row index (header excluded). */
  row: number;
  /** Kickoff instant (UTC), built from date+time interpreted in the import timezone. */
  startsAt: Date;
  /** Date-only ISO (`YYYY-MM-DD`) used for the dedupe key. */
  dateISO: string;
  opponent: string;
  location: string | null;
  homeAway: HomeAway;
  notes: string | null;
  /** sha1(dateISO|opponent.trim().toLowerCase()) — time-insensitive. */
  importKey: string;
  /** The raw row, for error/debug display. */
  raw: string;
}

export interface CsvParseResult {
  /** Number of data rows parsed (valid + errored). */
  totalRows: number;
  valid: ParsedEventRow[];
  errors: ImportRowErrorDto[];
}

/** Thrown when the file itself is unusable (unparseable / missing headers). */
export class CsvImportFatalError extends Error {}

/** Strip a UTF-8 BOM, trim, lowercase — used for both headers and cells. */
function normalize(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase();
}

/** Resolve a raw header to its canonical column, or keep the normalised form. */
export function resolveHeader(header: string): string {
  const key = normalize(header);
  return HEADER_ALIASES[key] ?? key;
}

/** sha1(dateISO + '|' + opponent.trim().toLowerCase()) — the dedupe key. */
export function computeImportKey(dateISO: string, opponent: string): string {
  return createHash('sha1')
    .update(`${dateISO}|${opponent.trim().toLowerCase()}`)
    .digest('hex');
}

/** True when the value is an IANA timezone name Node's ICU data knows. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert a wall-clock time in the given IANA timezone to a UTC Date,
 * DST-aware, with no external timezone library. The offset is resolved at the
 * row's own date (never the import moment): formats a candidate instant back
 * into the zone to discover the offset, then corrects once for DST-boundary
 * edge cases.
 */
export function wallClockToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute);
  const offset1 = zoneOffsetMs(timeZone, new Date(asIfUtc));
  let ts = asIfUtc - offset1;
  const offset2 = zoneOffsetMs(timeZone, new Date(ts));
  if (offset2 !== offset1) {
    ts = asIfUtc - offset2;
  }
  return new Date(ts);
}

/** Offset (ms) of the given timezone from UTC at the given instant. */
function zoneOffsetMs(timeZone: string, instant: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });
  const parts: Record<string, number> = {};
  for (const part of dtf.formatToParts(instant)) {
    if (part.type !== 'literal') {
      parts[part.type] = Number(part.value);
    }
  }
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour % 24,
    parts.minute,
    parts.second,
  );
  return asUtc - instant.getTime();
}

/** Parse a `YYYY-MM-DD` or `DD.MM.YYYY` date; null on invalid. */
function parseDate(
  value: string,
): { year: number; month: number; day: number; iso: string } | null {
  const trimmed = value.trim();
  let year: number, month: number, day: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const de = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(trimmed);
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (de) {
    day = Number(de[1]);
    month = Number(de[2]);
    year = Number(de[3]);
  } else {
    return null;
  }
  // Reject impossible calendar dates (e.g. 2026-13-40, 31.02.2026).
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return { year, month, day, iso: `${year}-${pad(month)}-${pad(day)}` };
}

/** Parse an `HH:mm` (24h) time; null on invalid. */
function parseTime(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    return null;
  }
  return { hour, minute };
}

/** Map a homeAway cell to the enum; blank → HOME; unknown → null (error). */
function parseHomeAway(value: string | undefined): HomeAway | null {
  const v = (value ?? '').trim().toLowerCase();
  if (v === '') {
    return HomeAway.HOME;
  }
  if (v === 'h' || v === 'heim' || v === 'home') {
    return HomeAway.HOME;
  }
  if (v === 'a' || v === 'auswärts' || v === 'auswaerts' || v === 'away') {
    return HomeAway.AWAY;
  }
  if (v === 'n' || v === 'neutral') {
    return HomeAway.NEUTRAL;
  }
  return null;
}

// Cell text (opponent/location/notes) is stored VERBATIM — including leading
// `=`, `+`, `-`, `@` that spreadsheets treat as formulas. Harmless in the app,
// but any future CSV/Excel EXPORT endpoint must neutralize those prefixes
// (e.g. prepend a single quote) to prevent formula injection on the way out.
function optionalText(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

function rawOf(record: Record<string, string>): string {
  return Object.values(record).join(';');
}

/**
 * Parse and validate the CSV. Throws {@link CsvImportFatalError} when the file
 * is unparseable or is missing a required header; otherwise returns valid rows
 * plus a per-row error report (partial success).
 */
export function parseEventsCsv(
  content: string,
  timeZone: string = DEFAULT_IMPORT_TIMEZONE,
): CsvParseResult {
  const parsed = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: resolveHeader,
  });

  const fields = parsed.meta.fields ?? [];
  if (fields.length === 0) {
    throw new CsvImportFatalError('import.error.unparseable');
  }
  const missing = REQUIRED_COLUMNS.filter((c) => !fields.includes(c));
  if (missing.length > 0) {
    throw new CsvImportFatalError(
      `import.error.missingColumns:${missing.join(',')}`,
    );
  }

  const valid: ParsedEventRow[] = [];
  const errors: ImportRowErrorDto[] = [];

  parsed.data.forEach((record, index) => {
    const row = index + 1; // 1-based data row (header excluded)
    const raw = rawOf(record);
    const fail = (field: string, message: string): void => {
      errors.push({ row, field, message, raw });
    };

    const dateParts = parseDate(record.date ?? '');
    if (!dateParts) {
      fail('date', 'import.error.badDate');
      return;
    }
    const timeParts = parseTime(record.time ?? '');
    if (!timeParts) {
      fail('time', 'import.error.badTime');
      return;
    }
    const opponent = (record.opponent ?? '').trim();
    if (opponent === '') {
      fail('opponent', 'import.error.missingOpponent');
      return;
    }
    const homeAway = parseHomeAway(record.homeAway);
    if (homeAway === null) {
      fail('homeAway', 'import.error.badHomeAway');
      return;
    }

    valid.push({
      row,
      startsAt: wallClockToUtc(
        timeZone,
        dateParts.year,
        dateParts.month,
        dateParts.day,
        timeParts.hour,
        timeParts.minute,
      ),
      dateISO: dateParts.iso,
      opponent,
      location: optionalText(record.location),
      homeAway,
      notes: optionalText(record.notes),
      importKey: computeImportKey(dateParts.iso, opponent),
      raw,
    });
  });

  return { totalRows: parsed.data.length, valid, errors };
}
