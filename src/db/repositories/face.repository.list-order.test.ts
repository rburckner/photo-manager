import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { FaceRepository } from './face.repository.js';
import { makeTestDb } from '../../test-helpers.js';

/**
 * Coverage for /people sort order:
 *   - Hidden people sort to the end of the visible list
 *   - Ignored people sort even further down (only visible when includeIgnored=true)
 *   - Within each status group: named first, then unnamed
 *   - Within named: alphabetical (case-insensitive)
 *   - Within unnamed: photo_count DESC as tiebreaker
 */
describe('FaceRepository.listPeople ordering', () => {
  let db: Database.Database;
  let faceRepo: FaceRepository;

  beforeEach(() => {
    db = makeTestDb();
    faceRepo = new FaceRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  function seed(name: string | null, status: string, photoCount: number): void {
    const id = faceRepo.createPerson(name, status);
    db.prepare('UPDATE people SET photo_count = ? WHERE id = ?').run(photoCount, id);
  }

  it('places hidden people after non-hidden people', () => {
    seed('Alice',     'named',      5);
    seed('HiddenBob', 'hidden',     100); // huge photo count, but still goes after non-hidden
    seed('Carol',     'named',      3);

    const list = faceRepo.listPeople(false);
    const names = list.map((p) => p.name);
    expect(names).toEqual(['Alice', 'Carol', 'HiddenBob']);
  });

  it('sorts named people alphabetically (case-insensitive)', () => {
    seed('charlie', 'named', 1);
    seed('Alice',   'named', 1);
    seed('bob',     'named', 1);

    const list = faceRepo.listPeople(false);
    expect(list.map((p) => p.name)).toEqual(['Alice', 'bob', 'charlie']);
  });

  it('places unnamed people after named ones, sorted by photo_count desc', () => {
    seed(null,    'unreviewed', 50);
    seed('Alice', 'named',      5);
    seed(null,    'unreviewed', 100); // bigger cluster among unnamed
    seed(null,    'unreviewed', 25);

    const list = faceRepo.listPeople(false);
    expect(list.length).toBe(4);
    expect(list[0]!.name).toBe('Alice');
    // Unnamed in order of photo_count desc: 100, 50, 25
    expect(list.slice(1).map((p) => p.photo_count)).toEqual([100, 50, 25]);
    expect(list.slice(1).every((p) => p.name === null)).toBe(true);
  });

  it('hidden + named combined: visible-named, then visible-unnamed, then hidden-named, then hidden-unnamed', () => {
    seed('Alice',         'named',      5);
    seed(null,            'unreviewed', 10);
    seed('HiddenZoe',     'hidden',     20);
    seed(null,            'hidden',     30); // unnamed hidden — even further back

    const list = faceRepo.listPeople(false);
    expect(list.map((p) => `${p.name ?? '(unnamed)'}/${p.status}`)).toEqual([
      'Alice/named',
      '(unnamed)/unreviewed',
      'HiddenZoe/hidden',
      '(unnamed)/hidden',
    ]);
  });

  it('ignored people only appear when includeIgnored=true and sort even further back than hidden', () => {
    seed('Alice',         'named',      1);
    seed('HiddenBob',     'hidden',     1);
    seed('IgnoredCarol',  'ignored',    1);

    expect(faceRepo.listPeople(false).map((p) => p.name)).toEqual(['Alice', 'HiddenBob']);
    expect(faceRepo.listPeople(true).map((p) => p.name)).toEqual(['Alice', 'HiddenBob', 'IgnoredCarol']);
  });
});
