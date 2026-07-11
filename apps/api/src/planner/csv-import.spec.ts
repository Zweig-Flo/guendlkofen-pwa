import { HomeAway } from '../generated/prisma/client';
import {
  computeImportKey,
  CsvImportFatalError,
  isValidTimeZone,
  parseEventsCsv,
  resolveHeader,
  wallClockToUtc,
} from './csv-import';

describe('csv-import', () => {
  describe('resolveHeader (alias resolution)', () => {
    it('maps de and en headers to canonical columns, case-insensitively', () => {
      expect(resolveHeader('Datum')).toBe('date');
      expect(resolveHeader(' DATE ')).toBe('date');
      expect(resolveHeader('Uhrzeit')).toBe('time');
      expect(resolveHeader('Gegner')).toBe('opponent');
      expect(resolveHeader('Spielort')).toBe('location');
      expect(resolveHeader('Heim/Auswärts')).toBe('homeAway');
      expect(resolveHeader('Notizen')).toBe('notes');
    });

    it('keeps an unknown header as its normalised form', () => {
      expect(resolveHeader('Something Else')).toBe('something else');
    });
  });

  describe('computeImportKey (stability, time-insensitive)', () => {
    it('is stable for the same date + opponent regardless of case/space', () => {
      const a = computeImportKey('2026-09-12', 'SV Musterhausen');
      const b = computeImportKey('2026-09-12', '  sv musterhausen ');
      expect(a).toBe(b);
    });

    it('differs for a different opponent or date', () => {
      const base = computeImportKey('2026-09-12', 'SV Musterhausen');
      expect(computeImportKey('2026-09-12', 'TSV Beispieldorf')).not.toBe(base);
      expect(computeImportKey('2026-09-19', 'SV Musterhausen')).not.toBe(base);
    });
  });

  describe('wallClockToUtc', () => {
    it('applies CEST (UTC+2) in summer', () => {
      // 2026-09-12 15:00 Berlin (CEST) === 13:00 UTC
      expect(
        wallClockToUtc('Europe/Berlin', 2026, 9, 12, 15, 0).toISOString(),
      ).toBe('2026-09-12T13:00:00.000Z');
    });

    it('applies CET (UTC+1) in winter', () => {
      // 2026-01-10 15:00 Berlin (CET) === 14:00 UTC
      expect(
        wallClockToUtc('Europe/Berlin', 2026, 1, 10, 15, 0).toISOString(),
      ).toBe('2026-01-10T14:00:00.000Z');
    });

    it('resolves the offset per row date, not per import moment', () => {
      // A mixed winter+summer file converts each game with ITS date's offset,
      // so importing in January vs July yields identical results.
      const csv = [
        'Datum;Zeit;Gegner',
        '10.01.2026;14:00;SV Winter',
        '12.09.2026;14:00;SV Sommer',
      ].join('\n');
      const result = parseEventsCsv(csv, 'Europe/Berlin');
      expect(result.valid.map((r) => r.startsAt.toISOString())).toEqual([
        '2026-01-10T13:00:00.000Z', // CET +1
        '2026-09-12T12:00:00.000Z', // CEST +2
      ]);
    });

    it('honors a non-Berlin uploader timezone', () => {
      // 2026-09-12 15:00 in Lisbon (WEST, UTC+1) === 14:00 UTC
      expect(
        wallClockToUtc('Europe/Lisbon', 2026, 9, 12, 15, 0).toISOString(),
      ).toBe('2026-09-12T14:00:00.000Z');
    });
  });

  describe('isValidTimeZone', () => {
    it('accepts IANA names and rejects garbage', () => {
      expect(isValidTimeZone('Europe/Berlin')).toBe(true);
      expect(isValidTimeZone('America/New_York')).toBe(true);
      expect(isValidTimeZone('Mars/OlympusMons')).toBe(false);
      expect(isValidTimeZone('')).toBe(false);
    });
  });

  describe('parseEventsCsv', () => {
    const HEADER = 'Datum;Zeit;Gegner;Ort;Heim/Auswärts;Notizen';

    it('parses a ;-delimited German file, both date formats and homeAway', () => {
      const csv = [
        HEADER,
        '2026-09-12;15:00;SV Musterhausen;Sportplatz Gündlkofen;Heim;Treffen 14:15',
        '19.09.2026;11:00;TSV Beispieldorf;Auswärtsplatz;A;',
        '2026-09-26;15:00;FC Nachbarort;;N;Trikot rot',
      ].join('\n');

      const result = parseEventsCsv(csv);

      expect(result.totalRows).toBe(3);
      expect(result.errors).toHaveLength(0);
      expect(result.valid).toHaveLength(3);

      const [first, second, third] = result.valid;
      expect(first.opponent).toBe('SV Musterhausen');
      expect(first.location).toBe('Sportplatz Gündlkofen');
      expect(first.homeAway).toBe(HomeAway.HOME);
      expect(first.notes).toBe('Treffen 14:15');
      expect(first.startsAt.toISOString()).toBe('2026-09-12T13:00:00.000Z');
      expect(first.dateISO).toBe('2026-09-12');

      // DD.MM.YYYY parsed, blank notes -> null, away mapping.
      expect(second.dateISO).toBe('2026-09-19');
      expect(second.homeAway).toBe(HomeAway.AWAY);
      expect(second.notes).toBeNull();

      // Blank location -> null, neutral mapping.
      expect(third.location).toBeNull();
      expect(third.homeAway).toBe(HomeAway.NEUTRAL);
    });

    it('defaults a blank homeAway cell to HOME', () => {
      const csv = [HEADER, '2026-09-12;15:00;SV Musterhausen;;;'].join('\n');
      const result = parseEventsCsv(csv);
      expect(result.valid).toHaveLength(1);
      expect(result.valid[0].homeAway).toBe(HomeAway.HOME);
    });

    it('resolves English headers too', () => {
      const csv = [
        'date,time,opponent,location,homeAway,notes',
        '2026-09-12,15:00,SV Musterhausen,Field,home,hi',
      ].join('\n');
      const result = parseEventsCsv(csv);
      expect(result.valid).toHaveLength(1);
      expect(result.valid[0].opponent).toBe('SV Musterhausen');
    });

    it('collects row-level errors and still imports the valid rows', () => {
      const csv = [
        HEADER,
        '2026-13-40;15:00;SV Musterhausen;;Heim;', // bad date
        '2026-09-12;25:99;TSV Beispieldorf;;A;', // bad time
        '2026-09-19;11:00;;;Heim;', // missing opponent
        '2026-09-26;15:00;FC Nachbarort;;Heim;ok', // valid
      ].join('\n');

      const result = parseEventsCsv(csv);

      expect(result.totalRows).toBe(4);
      expect(result.valid).toHaveLength(1);
      expect(result.valid[0].opponent).toBe('FC Nachbarort');
      expect(result.errors).toHaveLength(3);
      expect(result.errors.map((e) => e.field)).toEqual([
        'date',
        'time',
        'opponent',
      ]);
      expect(result.errors.map((e) => e.row)).toEqual([1, 2, 3]);
      expect(result.errors[0].message).toBe('import.error.badDate');
    });

    it('throws a fatal error when a required header is missing', () => {
      const csv = ['Datum;Gegner', '2026-09-12;SV Musterhausen'].join('\n');
      expect(() => parseEventsCsv(csv)).toThrow(CsvImportFatalError);
    });
  });
});
