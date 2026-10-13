import { describe, expect, it } from 'vitest';
import { findMissingPeriods } from './missing-periods.js';

const PROPERTY = 1;
const OTHER_PROPERTY = 2;

const periods = (propertyId: number, from: number, to: number, firstId = 1) =>
  Array.from({ length: to - from + 1 }, (_, index) => ({
    id: firstId + index,
    propertyId,
    period: from + index,
  }));

describe('findMissingPeriods', () => {
  it('reports the period that came in the previous import and is absent from the new one', () => {
    const current = periods(PROPERTY, 2010, 2021);
    const incoming = current.filter((row) => row.period !== 2015);

    expect(findMissingPeriods(current, incoming)).toEqual([
      { id: 6, propertyId: PROPERTY, period: 2015 },
    ]);
  });

  it('reports nothing when the new import brings every period again', () => {
    const current = periods(PROPERTY, 2010, 2021);

    expect(findMissingPeriods(current, current)).toEqual([]);
  });

  it('does not report periods that are new in this import', () => {
    const current = periods(PROPERTY, 2020, 2021);
    const incoming = periods(PROPERTY, 2020, 2023);

    expect(findMissingPeriods(current, incoming)).toEqual([]);
  });

  it('reports several missing periods of the same property', () => {
    const current = periods(PROPERTY, 2018, 2021);
    const incoming = [{ propertyId: PROPERTY, period: 2021 }];

    expect(
      findMissingPeriods(current, incoming).map((row) => row.period),
    ).toEqual([2018, 2019, 2020]);
  });

  it('compares each property on its own: the same year in another property does not count', () => {
    const current = [
      ...periods(PROPERTY, 2015, 2016, 1),
      ...periods(OTHER_PROPERTY, 2015, 2016, 10),
    ];
    const incoming = [
      { propertyId: PROPERTY, period: 2016 },
      { propertyId: OTHER_PROPERTY, period: 2015 },
      { propertyId: OTHER_PROPERTY, period: 2016 },
    ];

    expect(findMissingPeriods(current, incoming)).toEqual([
      { id: 1, propertyId: PROPERTY, period: 2015 },
    ]);
  });

  it('does not report a property that does not come in the new import at all', () => {
    const current = [
      ...periods(PROPERTY, 2015, 2016, 1),
      ...periods(OTHER_PROPERTY, 2015, 2016, 10),
    ];
    const incoming = periods(PROPERTY, 2015, 2016);

    expect(findMissingPeriods(current, incoming)).toEqual([]);
  });

  it('reports nothing for a first import', () => {
    expect(findMissingPeriods([], periods(PROPERTY, 2015, 2016))).toEqual([]);
  });
});
