import { chipWidth, splitIntoRows } from './chipRows';

const w = (s: string) => chipWidth(s);

describe('splitIntoRows', () => {
  it('uses at most the number of rows asked for, and no more rows than chips', () => {
    expect(splitIntoRows(['#A', '#B'], 3, w)).toEqual([['#A'], ['#B']]);
    expect(splitIntoRows([], 3, w)).toEqual([]);
    expect(splitIntoRows(['#A', '#B', '#C', '#D', '#E'], 3, w)).toHaveLength(3);
  });

  it('puts the first chips at the left, top to bottom', () => {
    const rows = splitIntoRows(['#New', '#Two', '#Three', '#Four'], 3, w);
    expect(rows.map((r) => r[0])).toEqual(['#New', '#Two', '#Three']);
  });

  it('keeps every chip once, in order within each row', () => {
    const tags = ['#LiveMusic', '#Comedy', '#FarmersMarket', '#Pickleball', '#Cycling', '#Hiking', '#Networking', '#FamilyFriendly'];
    const rows = splitIntoRows(tags, 3, w);
    expect(rows.flat().sort()).toEqual([...tags].sort());
    for (const row of rows) expect(row).toEqual(tags.filter((t) => row.includes(t)));
  });

  it('balances the rows by width', () => {
    const tags = ['#FarmersMarket', '#A', '#B', '#C', '#D', '#E'];
    const rows = splitIntoRows(tags, 3, w);
    const lengths = rows.map((r) => r.reduce((sum, t) => sum + w(t), 0));
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThanOrEqual(w('#FarmersMarket'));
  });
});
