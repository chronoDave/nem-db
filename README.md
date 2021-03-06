<div align="center">
  <img src="/assets/icon.svg" width="128" alt="leaf-db">

  <h1>leaf-db</h1>
  <p><b>leaf-db</b> is a modern, promise-based, strongly-typed, embeddable database for <a href="https://nodejs.org/en/">node.js</a>.</p>
</div>

<div align="center">
  <a href="/LICENSE">
    <img alt="License GPLv3" src="https://img.shields.io/badge/license-GPLv3-blue.svg" />
  </a>
  <a href="https://www.npmjs.com/package/leaf-db">
    <img alt="NPM" src="https://img.shields.io/npm/v/leaf-db?label=npm">
  </a>
  <a href="https://bundlephobia.com/result?p=leaf-db@latest">
    <img alt="Bundle size" src="https://img.shields.io/bundlephobia/minzip/leaf-db@latest.svg">
  </a>
  <a href="https://github.com/chronoDave/leaf-db/actions/workflows/ci.yml">
    <img alt="CI" src="https://github.com/chronoDave/leaf-db/workflows/ci/badge.svg?branch=master">
  </a>
  <a href="https://github.com/chronoDave/leaf-db/actions/workflows/codeql.yml">
     <img alt="CodeQL" src="https://github.com/chronoDave/leaf-db/actions/workflows/codeql.yml/badge.svg?branch=master">
  </a>
</div>

## Install

```
$ npm i leaf-db
```

_Note: This package requires Node >=14.5.0_

## Getting Started

**JS**

```JS
import LeafDB from 'leaf-db'; // ES6
// const LeafDB = require('leaf-db').default // ES5

const db = new LeafDB();

db.insert({ species: 'cat', name: 'whiskers' })
  .then(inserted => console.log(`added ${inserted[0].name} to the database!`))
  .catch(console.error)
```

**TS**

```TS
import LeafDB, { Doc } from 'leaf-db';

interface Document extends Doc {
  species: string,
  name?: string
}

const db = new LeafDB<Document>();
db.insert({ species: 'cat', name: 'whiskers' })
  .then(inserted => console.log(`added ${inserted[0].name} to the database!`))
  .catch(console.error)
```

## API

 - [Database](#database)
   - [Create / load](#create-load)
   - [Persistence](#persistence)
   - [Corruption](#corruption)
 - [Inserting docs](#inserting-docs)
 - [Finding docs](#finding-docs)
   - [Basic query](#basic-query)
   - [Dot notation](#dot-notation)
   - [Operators](#operators)
   - [Projection](#projection)
   - [Indexing](#indexing)
 - [Updating docs](#updating-docs)
   - [Modifiers](#modifiers)
 - [Deleting docs](#deleting-docs)
 - [Dropping database](#drop)

## Database

### Create / load

`const db = new LeafDB({ name, root, autoload, strict })`

 - `options.name` - Database name
 - `options.root` - Database root path, will create in-memory if not provided
 - `options.disableAutoload` - Should database not be loaded on creation
 - `options.strict` - Should database throw silent errors

```JS
// Memory-only database
const db = new Datastore()

// Persistent database with autoload
const db = new Datastore({ root: process.cwd() });

// Persistent database with manual load
const db = new Datastore({ name: 'db', root: process.cwd(), disableAutoload: true })
// Loading is not neccesary, but recommended
// Not loading means the data from file isn't read,
// which can cause data loss when `persist()` is called (as it overwrites the file)
db.load()
```

### Persistence

By default, `leaf-db` does not write directly to file after operations. To make sure the data is persisted, call `persist()`, which will write valid data to disk. `persist()` also cleans out invalid data from memory.

If `strict` is enabled, `persist()` will throw an error if corrupted data is found.

### Corruption

Calling `load()` will return an array of corrupted raw data (string), which can be re-inserted before calling `persist()`.

## Inserting docs

`await db.insert(OneOrMore<NewDoc>) => Promise<Doc[]>`

Inserts doc(s) into the database. `_id` is automatically generated if the _id does not exist.

Fields cannot start with `$` (modifier field) or contain `.` (dot-queries). Values cannot be `undefined`.

`insert()` will reject on the first invalid doc if `strict` is enabled, otherwise invalid docs are ignored.

Insertion takes place _after_ all docs are validated, meaning no data will be inserted if `insert()` rejects.

`leaf-db` does not keep track of when docs are inserted, updated or deleted.

<b>Example</b>

```JS
const newDoc = {
  crud: 'create',
  data: [{
    field: 1
  }]
}

try {
  const doc = await db.insert(newDoc) // [newDoc]
} catch (err) {
  console.error(err)
}
```

## Finding docs

### Basic query

`await db.find(Query | string[], Projection) => Promise<Doc[]>`

`await db.findById(string, Projection) => Promise<Doc>`

Find doc(s) matching query. Operators and dot notation are supported and can be mixed together.

```JS
// Data
// { _id: 1, type: 'normal', important: false, variants: ['weak', 'strong'] }
// { _id: 2, type: 'normal', important: true, variants: ['weak', 'strong'] }
// { _id: 3, type: 'strong', important: false, variants: ['weak', 'strong'] }
// { _id: 4, type: 'weak', variants: ['weak'], properties: { type: 'weak', parent: 3 } }

// Find docs matching type 'normal'
// [1, 2, 3] (Doc _id's)
await db.find({ type: 'normal' })

// Find all docs matching type 'normal' and important 'true'
// [2], all fields must match
await db.find({ type: 'normal', important: 'true' })

// Find all docs with variants 'weak'
// [4], note how only 4 matches, even though all entries contain weak
// Array content and order must mach
await db.find({ variant: ['weak'] })

// Find all docs with variants 'strong', 'weak', in that order
// []
await db.find({ variant: ['strong', 'weak'] })

// Find all docs with parent '3'
// [], all keys must be present
await db.find({ properties: { parent: 3 } })
// [4], key order does not matter
await db.find({ properties: { parent: 3, type: 'weak' } })
```

### Dot notation

Dot notation can be used to match nested fields

```JS
// Data
// { _id: 1, variants: ['normal', 'strong'], properties: { type: 'weak', parent: 3 } }
// { _id: 2, variants: ['strong', 'normal'], properties: { type: 'weak', parent: 3 } }
// { _id: 3, variants: [{ id: 'strong', properties: [{ type: 'weak' }] }] }

// Find all docs with properties.type 'weak'
// [1, 2]
await db.find({ 'properties.type': 'weak' })

// Find all docs where first entry of variants is `strong`
// [2]
await db.find({ 'variants.0': 'strong' })

// Find all docs where type of first entry of properties of first entry of variants is 'weak'
// [3]
await db.find({ 'variants.0.properties.0.type': 'weak' })
```

### Operators

Operators can be used to create advanced queries. The following operators are supported:

<b>Logic operators</b>

 - `$gt` - Is greater than
 - `$gte` - Is greater or equal than
 - `$lt` - Is less than
 - `$lte` - Is less or equal than
 - `$not` - Is not equal

<b>String operators</b>

 - `$string` - Does string include string
 - `$stringStrict` - Does string include string, case sensitive

<b>Object operators</b>

 - `$keys` - Does object have keys

<b>Array operators</b>

These operators will return false if the queries field is not an array

 - `$includes` - Does array contain value
 - `$or` - Do any of the queries match

<b>Example</b>

```JS
// Data
// { _id: 1, type: 'normal', important: false, variants: ['weak', 'strong'] }
// { _id: 2, type: 'normal', important: true, variants: ['weak', 'strong'] }
// { _id: 3, type: 'strong', important: false, variants: ['weak', 'strong'] }
// { _id: 4, type: 'weak', variants: ['weak'], properties: { type: 'weak', parent: 3, variants: ['strong'] } }
// { _id: 5, properties: [{ variants: ['weak', 'normal' ] }, { type: 'strong' }] }

// $gt / $gte / $lt / $lte
// [3, 4]
await db.find({ $gt: { _id: 2 } })
// [4], all fields within '$lte' must match
await db.find({ $lte: { _id: 4, 'properties.parent': 3 }})

// $not
// [2, 3, 4, 5]
await db.find({ $not: { _id: 1 } })

// $string
// [1, 2]
await db.find({ $string: { type: 'mal' } })
// []
await db.find({ $string: { type: 'MAL' } })
// [1, 2]
await db.find({ $stringStrict: { type: 'MAL' } })

// $keys
// [1, 2, 3, 4]
await db.find({ $keys: ['type'] })
// [1, 2, 3]
await db.find({ $keys: ['type', 'important'] })

// $includes
// [1, 2, 3, 4]
await db.find({ $includes: { variants: 'weak' } })
// [4]
await db.find({ $includes: { 'properties.variants': 'strong' } })
// Error, field is not an array
await db.find({ $includes: { type: 'weak' } })
// Error, dot notation isn't a valid object field
await db.find({ $includes: { properties: { 'variants.0': 'weak' } } })

// $or
// [1, 2, 4]
await db.find({ $or: [{ type: 'weak' }, { type: 'normal' }] })
// [1, 2, 3, 4, 5]
await db.find({ $or: [{ $includes: { variants: 'weak' } }, { _id: 5 }] })
```

### Projection

`leaf-db` supports projection. When using projection, only the specified fields will be returned. Empty objects can be returned if `projection` is `[]`, or when none of the fields provided exist on the found objects.

<b>Example</b>

```JS
// Data
// { _id: 1, type: 'normal', important: false, variants: ['weak', 'strong'] }
// { _id: 2, type: 'normal', important: true, variants: ['weak', 'strong'] }
// { _id: 3, type: 'strong', important: false, variants: ['weak', 'strong'] }
// { _id: 4, type: 'weak', variants: ['weak'], properties: { type: 'weak', parent: 3, variants: ['strong'] } }
// { _id: 5, properties: [{ variants: ['weak', 'normal' ] }, { type: 'strong' }] }

// [{ _id: 1 }, { _id: 2 }]
await db.find({ type: 'normal' }, ['_id'])

// [{ type: 'normal' }, { type: 'normal' }, { type: 'strong' }, { type: 'weak' }, {}]
await db.find({}, ['type'])
```

### Indexing

`leaf-db` uses a hash table under the hood to store docs. All docs are indexed by `_id`, meaning using any `byId` query is considerably faster than its regular counterpart.

The `byId` queries accept a single `_id` string, or an array of `_id` strings.

## Updating docs

`await db.update(Query | string[], Update | NewDoc) => Promise<Doc[]>`

`await db.updateById(string, Update) => Promise<Doc>`

Find doc(s) matching query object. `update()` supports modifiers, but fields and modifiers cannot be mixed together. `update` cannot create invalid field names, such as fields containing dots or fields starting with `$`. Returns the updated docs.

If no modifiers are provided, `update()` will override the found doc(s) with `update`

`_id` fields cannot be overwritten. Trying to do so will throw an error.

<b>Example</b>

```JS
// Data
// { _id: 1, type: 'normal', important: false, variants: ['weak', 'strong'] }
// { _id: 2, type: 'normal', important: true, variants: ['weak', 'strong'] }
// { _id: 3, type: 'strong', important: false, variants: ['weak', 'strong'] }
// { _id: 4, type: 'weak', variants: ['weak'], properties: { type: 'weak', parent: 3, variants: ['strong'] } }

// Set all docs to {}
await db.update()

// Set matching docs to { type: 'strong' }
// { _id: 1, type: 'strong' }
// { _id: 2, type: 'strong' }
// { _id: 3, type: 'strong', important: false, variants: ['weak', 'strong'] }
// { _id: 4, type: 'weak', variants: ['weak'], properties: { type: 'weak', parent: 3, variants: ['strong'] } }
await db.update({ type: 'normal' }, { type: 'strong' })

// _id fields will not be overwritten
// { _id: 1, type: 'strong' }
// { _id: 2, type: 'strong' }
// { _id: 3, type: 'strong', important: false, variants: ['weak', 'strong'] }
// { _id: 4, type: 'weak', variants: ['weak'], properties: { type: 'weak', parent: 3, variants: ['strong'] } }
await db.update({ type: 'normal' }, { type: 'strong', _id: 1 })

// Error, dot notation isn't a valid field
await db.update({ type: 'normal' }, { 'properties.type': 'strong', _id: 1 })
```

### Modifiers

Modifiers can be used to set specific values

 - `$add` - Add value (number)
 - `$push` - Add value (array)
 - `$set` - Set value

<b>Example</b>

```JS
// Data
// { _id: 1 }
// { _id: 2 }
// { _id: 3, count: 3 }

// $add
// { _id: 3, count: 9 }
await db.update({} }, { $add: { count: 3 } })
// { _id: 3, count: 3 }
await db.update({}, { $add: { count: -3 } })

// $push
// { _id: 3, fruits: ['banana'] }
await db.update({} }, { $push: { count: 'orange' } })
// { _id: 3 , fuits: ['banana', 'orange'] }

// $set
// { _id: 3, count: 'count' }
await db.update({ $keys: ['count'] }, { $set: { count: 'count' } })
// { _id: 1, value: 3 }
// { _id: 2, value: 3 }
// { _id: 3, count: 3, value: 3 }
// Keys will be created if it does not exist
await db.update({}, { $set: { value: 3 } })
```

## Deleting docs

`await db.delete(Query | string[]) => Promise<number>`

`await db.deleteById(string) => Promise<number>`

Delete doc(s) matching query object.

<b>Example</b>

```JS
// Data in database
// { _id: 1, type: 'normal', important: false, variants: ['weak', 'strong'] }
// { _id: 2, type: 'normal', important: true, variants: ['weak', 'strong'] }
// { _id: 3, type: 'strong', important: false, variants: ['weak', 'strong'] }
// { _id: 4, type: 'weak', variants: ['weak'], properties: { type: 'weak', parent: 3, variants: ['strong'] } }

// Delete all data
// []
await db.delete()

// Delete first match
// [1, 3, 4]
await db.delete({ _id: 2 })

// Delete all matches
// [3, 4]
await db.delete({ type: 'normal' })
```

### Drop

`drop() => void`

Clears both memory and database file.

## Donating

[![ko-fi](https://www.ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/Y8Y41E23T)

## Acknowledgements
 
 - This project is heavily inspired by [louischatriot/nedb](https://github.com/louischatriot/nedb).
 - <div>Icon made by <a href="https://www.freepik.com" title="Freepik">Freepik</a> from <a href="https://www.flaticon.com/" title="Flaticon">www.flaticon.com</a></div>
