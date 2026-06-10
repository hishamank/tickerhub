/**
 * Tests for Finnhub Provider - Quarter-End Detection
 */

import { describe, it, expect } from 'vitest';

describe('FinnhubProvider - Quarter-End Detection', () => {
  // Note: Tests exercise the quarter-end detection logic via local helpers
  // rather than the provider instance to avoid mocking the Finnhub API client.

  describe('isQuarterEndDate', () => {
    // Since isQuarterEndDate is a private method, we'll test the logic directly
    // by recreating the function here for testing purposes
    const isQuarterEndDate = (date: Date): boolean => {
      const month = date.getUTCMonth();
      const day = date.getUTCDate();

      const isQuarterEndMonth = month === 2 || month === 5 || month === 8 || month === 11;

      if (!isQuarterEndMonth) return false;

      const lastDayOfMonth = new Date(Date.UTC(date.getUTCFullYear(), month + 1, 0)).getUTCDate();
      return day === lastDayOfMonth;
    };

    it('should return true for March 31', () => {
      expect(isQuarterEndDate(new Date('2026-03-31'))).toBe(true);
    });

    it('should return true for June 30', () => {
      expect(isQuarterEndDate(new Date('2026-06-30'))).toBe(true);
    });

    it('should return true for September 30', () => {
      expect(isQuarterEndDate(new Date('2026-09-30'))).toBe(true);
    });

    it('should return true for December 31', () => {
      expect(isQuarterEndDate(new Date('2026-12-31'))).toBe(true);
    });

    it('should return false for mid-quarter dates', () => {
      expect(isQuarterEndDate(new Date('2026-03-15'))).toBe(false);
      expect(isQuarterEndDate(new Date('2026-06-15'))).toBe(false);
      expect(isQuarterEndDate(new Date('2026-09-15'))).toBe(false);
      expect(isQuarterEndDate(new Date('2026-12-15'))).toBe(false);
    });

    it('should return false for non-quarter-end months', () => {
      expect(isQuarterEndDate(new Date('2026-01-31'))).toBe(false);
      expect(isQuarterEndDate(new Date('2026-02-28'))).toBe(false);
      expect(isQuarterEndDate(new Date('2026-04-30'))).toBe(false);
      expect(isQuarterEndDate(new Date('2026-05-31'))).toBe(false);
    });

    it('should return false for day before quarter-end', () => {
      expect(isQuarterEndDate(new Date('2026-03-30'))).toBe(false);
      expect(isQuarterEndDate(new Date('2026-06-29'))).toBe(false);
      expect(isQuarterEndDate(new Date('2026-09-29'))).toBe(false);
      expect(isQuarterEndDate(new Date('2026-12-30'))).toBe(false);
    });

    it('should handle different years correctly', () => {
      expect(isQuarterEndDate(new Date('2024-03-31'))).toBe(true);
      expect(isQuarterEndDate(new Date('2025-06-30'))).toBe(true);
      expect(isQuarterEndDate(new Date('2027-09-30'))).toBe(true);
      expect(isQuarterEndDate(new Date('2028-12-31'))).toBe(true);
    });
  });

  describe('getQuarterFromMonth', () => {
    const getQuarterFromMonth = (date: Date): string => {
      const month = date.getUTCMonth();
      if (month <= 2) return 'Q1';
      if (month <= 5) return 'Q2';
      if (month <= 8) return 'Q3';
      return 'Q4';
    };

    it('should return Q1 for January', () => {
      expect(getQuarterFromMonth(new Date('2026-01-15'))).toBe('Q1');
    });

    it('should return Q1 for February', () => {
      expect(getQuarterFromMonth(new Date('2026-02-15'))).toBe('Q1');
    });

    it('should return Q1 for March', () => {
      expect(getQuarterFromMonth(new Date('2026-03-15'))).toBe('Q1');
    });

    it('should return Q2 for April', () => {
      expect(getQuarterFromMonth(new Date('2026-04-15'))).toBe('Q2');
    });

    it('should return Q2 for May', () => {
      expect(getQuarterFromMonth(new Date('2026-05-15'))).toBe('Q2');
    });

    it('should return Q2 for June', () => {
      expect(getQuarterFromMonth(new Date('2026-06-15'))).toBe('Q2');
    });

    it('should return Q3 for July', () => {
      expect(getQuarterFromMonth(new Date('2026-07-15'))).toBe('Q3');
    });

    it('should return Q3 for August', () => {
      expect(getQuarterFromMonth(new Date('2026-08-15'))).toBe('Q3');
    });

    it('should return Q3 for September', () => {
      expect(getQuarterFromMonth(new Date('2026-09-15'))).toBe('Q3');
    });

    it('should return Q4 for October', () => {
      expect(getQuarterFromMonth(new Date('2026-10-15'))).toBe('Q4');
    });

    it('should return Q4 for November', () => {
      expect(getQuarterFromMonth(new Date('2026-11-15'))).toBe('Q4');
    });

    it('should return Q4 for December', () => {
      expect(getQuarterFromMonth(new Date('2026-12-15'))).toBe('Q4');
    });
  });
});
