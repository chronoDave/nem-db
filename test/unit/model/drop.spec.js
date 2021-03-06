const fs = require('fs');

const test = require('tape');

const { setup, mockMemory } = require('../_utils');

test('[drop] should drop data', async t => {
  const { db } = setup({ memory: mockMemory });

  await db.drop();

  t.strictEqual(Object.keys(db.map).length, 0);
  t.strictEqual(db.list.size, 0);

  t.end();
});

test('[drop] should drop data and persist if not in memory mode', async t => {
  const { db, file } = setup({ memory: mockMemory, root: __dirname });

  await db.drop();

  t.strictEqual(Object.keys(db.map).length, 0);
  t.strictEqual(db.list.size, 0);

  const fileData = fs.readFileSync(file, 'utf-8').split('\n');

  t.strictEqual(fileData.length, 1);
  t.strictEqual(fileData[0], '');

  t.end();
});
