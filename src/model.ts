import fs, { PathLike } from 'fs';
import path from 'path';

// Types
import type {
  OneOrMore,
  Doc,
  DocValue,
  Projection,
  Query,
  Update
} from './types';

// Modifiers
import { modify, project } from './modifiers';

// Utils
import { generateUid, toArray } from './utils';

// Validation
import {
  isId,
  isObject,
  isQueryMatch,
  isValidDoc,
  isValidUpdate,
  hasOperators
} from './validation';

export type {
  JSON,
  ValueOf,
  OneOrMore,
  Never,
  DocBase,
  DocValue,
  Doc,
  Tags,
  Operators,
  Query,
  Projection,
  Modifiers,
  Update
} from './types';

export default class LeafDB<T extends DocValue> {
  root?: string;
  strict: boolean;
  file?: PathLike;

  private map: Record<string, Doc<T>>;
  private list: Set<string>;

  constructor(options?: {
    name?: string,
    root?: string,
    disableAutoload?: boolean,
    strict?: boolean
  }) {
    this.strict = !!options?.strict;
    this.map = {};
    this.list = new Set();

    if (options?.root) {
      fs.mkdirSync(options.root, { recursive: true });
      this.file = path.resolve(options.root, `${options?.name || 'leafdb'}.txt`);
      if (!options?.disableAutoload) this.load();
    }
  }

  /** Initialize data */
  private flush() {
    this.map = {};
    this.list = new Set();
  }

  /**
   * Initialize database
   * @returns {string[]} List of corrupt items
   * */
  load() {
    const corrupted: string[] = [];

    if (!this.file) throw new Error('Cannot load file in memory mode');

    if (fs.existsSync(this.file)) {
      this.flush();

      const rawDocs = fs
        .readFileSync(this.file, 'utf-8')
        .split('\n');

      for (let i = 0; i < rawDocs.length; i += 1) {
        const rawDoc = rawDocs[i];

        if (rawDoc) {
          try {
            const doc: Doc<T> = JSON.parse(rawDoc);

            if (!isValidDoc(doc, true)) throw new Error(`Invalid doc: ${doc}`);

            this.list.add(doc._id);
            this.map[doc._id] = doc;
          } catch (err) {
            if (this.strict) throw err;

            corrupted.push(rawDoc);
          }
        }
      }
    } else {
      fs.writeFileSync(this.file, '');
    }

    return corrupted;
  }

  /** Persist database */
  persist() {
    if (!this.file) throw new Error('Tried to call `persist()` in memory mode');

    const payload: string[] = [];

    this.list.forEach(_id => {
      try {
        const doc = this.map[_id];

        if (!doc.$deleted) payload.push(JSON.stringify(doc));
      } catch (err) {
        this.list.delete(_id);
        delete this.map[_id];

        if (this.strict) throw err;
      }
    });

    fs.writeFileSync(this.file, payload.join('\n'));
  }

  /**
   * Insert new document(s)
   * @param {object|object[]} newDocs
   * */
  insert(payload: OneOrMore<T>): Promise<T[]> {
    return new Promise(resolve => {
      if (
        !Array.isArray(payload) &&
        !isObject(payload)
      ) throw new Error(`Invalid payload: ${JSON.stringify(payload)}`);

      const inserted: T[] = [];
      const newDocs = toArray(payload);

      for (let i = 0; i < newDocs.length; i += 1) {
        const newDoc = newDocs[i];

        if (!isValidDoc(newDoc)) {
          throw new Error(`newDoc is not a valid document: ${JSON.stringify(newDoc)}`);
        }

        if (!newDoc._id) {
          newDoc._id = generateUid();
        } else if (this.list.has(newDoc._id)) {
          throw new Error(`'_id' already exists: ${newDoc._id}`);
        }

        this.list.add(newDoc._id);
        this.map[newDoc._id] = newDoc as Doc<T>;

        inserted.push(newDoc as T);
      }

      resolve(inserted);
    });
  }

  /**
   * Find doc matching `id`
   * @param {string} id - Doc id
   * @param {string[]} projection - Projection array
   */
  findOne(id: string, projection?: Projection): Promise<Partial<T> | null> {
    return new Promise(resolve => {
      if (!isId(id)) throw new Error(`Invalid _id: ${id}`);

      const doc = this.map[id];
      if (doc && !doc.$deleted) return resolve(project(doc, projection));
      return resolve(null);
    });
  }

  /**
   * Find doc(s) matching `ids`
   * @param {string[]} ids - Array of doc id's
   * @param {string[]} projection - Projection array
   */
  findMany(ids: string[], projection?: Projection): Promise<Partial<T>[]> {
    return new Promise(resolve => {
      if (!Array.isArray(ids)) throw new Error(`Invalid ids, must be of type Array: ${ids}`);

      const payload: Partial<T>[] = [];
      const _ids = toArray(ids);

      for (let i = 0; i < _ids.length; i += 1) {
        const _id = _ids[i];
        if (!isId(_id)) throw new Error(`Invalid _id: ${_id}`);

        const doc = this.map[_id];
        if (doc && !doc.$deleted) payload.push(project(doc, projection));
      }

      resolve(payload);
    });
  }

  /**
   * Find all documents matching `query`
   * @param {object} query - Query object (default `{}`)
   * @param {string[]} projection - Projection array
   */
  find(query: Query = {}, projection?: Projection): Promise<Partial<T>[]> {
    return new Promise(resolve => {
      if (!isObject(query)) throw new Error(`Invalid query: ${JSON.stringify(query)}`);

      const payload: Partial<T>[] = [];

      this.list.forEach(_id => {
        const doc = this.map[_id];

        if (!doc.$deleted && (isQueryMatch(doc, query))) {
          payload.push(project(doc, projection));
        }
      });

      resolve(payload);
    });
  }

  /**
   * Update single doc matching `_id`
   * @param {string|string[]} query - Doc _id
   * @param {object} update - New document (default `{}`) / Update query
   * @param {string[]} projection - Projection array
  */
  updateById(
    query: OneOrMore<string>,
    update: Update<T> = {},
    projection?: Projection
  ): Promise<Partial<T>[]> {
    return new Promise(resolve => {
      if (!isValidUpdate(update)) throw new Error(`Invalid update: ${JSON.stringify(update)}`);

      const payload: Partial<T>[] = [];
      const _ids = toArray(query);

      for (let i = 0; i < _ids.length; i += 1) {
        const _id = _ids[i];

        if (!isId(_id)) throw new Error(`Invalid _id: ${_id}`);

        const doc = this.map[_id];

        if (doc && !doc.$deleted) {
          const newDoc = hasOperators(update) ?
            modify(doc, update) :
            update as T;

          const _doc = { ...newDoc, _id };
          this.map[_id] = _doc;
          payload.push(project(_doc, projection));
        }
      }

      resolve(payload);
    });
  }

  /**
   * Update documents matching `query`
   * @param {object} query - Query object (default `{}`)
   * @param {object} update - New document (default `{}`) / Update query
   * @param {string[]} projection - Projection array
   */
  update(
    query: Query = {},
    update: Update<T> = {},
    projection?: Projection
  ): Promise<Partial<T>[]> {
    return new Promise(resolve => {
      if (!isObject(query)) throw new Error(`Invalid query: ${JSON.stringify(query)}`);
      if (!isValidUpdate(update)) throw new Error(`Invalid update: ${JSON.stringify(update)}`);

      const payload: Partial<T>[] = [];

      this.list.forEach(_id => {
        const doc = this.map[_id];

        if (!doc.$deleted && isQueryMatch(doc, query)) {
          const newDoc = hasOperators(update) ?
            modify(doc, update) :
            update as T;

          const _doc = { ...newDoc, _id };
          this.map[_id] = _doc;
          payload.push(project(_doc, projection));
        }
      });

      resolve(payload);
    });
  }

  /**
   * Delete doc matching `_id`
   * @param {string} query - Doc _id
  */
  deleteById(query: OneOrMore<string>): Promise<number> {
    return new Promise(resolve => {
      let payload = 0;
      const _ids = toArray(query);

      for (let i = 0; i < _ids.length; i += 1) {
        const _id = _ids[i];

        if (!isId(_id)) throw new Error(`Invalid _id: ${_id}`);

        const doc = this.map[_id];

        if (doc && !doc.$deleted) {
          this.map[_id] = { ...doc, $deleted: true };
          payload += 1;
        }
      }

      resolve(payload);
    });
  }

  /**
   * Delete documents matching `query`
   * @param {object} query - Query object (default `{}`)
   */
  delete(query: Query = {}): Promise<number> {
    return new Promise(resolve => {
      if (!isObject(query)) throw new Error(`Invalid query: ${JSON.stringify(query)}`);

      let payload = 0;
      this.list.forEach(_id => {
        const doc = this.map[_id];

        if (!doc.$deleted && isQueryMatch(doc, query)) {
          this.map[_id] = { ...doc, $deleted: true };
          payload += 1;
        }
      });

      resolve(payload);
    });
  }

  /** Drop database */
  drop() {
    this.flush();
    if (this.file) this.persist();
  }
}
