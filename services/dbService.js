import NodeCache from 'node-cache';
import { isMongoReady, initMongo } from './mongoInit.js';
import Profile from '../models/Profile.js';
import TestScore from '../models/TestScore.js';
import { flatToNested, nestedToFlat, extractColumnsFromNestedTests } from '../utils/testColumns.js';

const GLOBAL_DATA_CACHE_KEY = 'globalData';

function readCacheTtlMs() {
  const raw = process.env.DB_READ_CACHE_TTL_MS || process.env.FIRESTORE_READ_CACHE_TTL_MS;
  if (raw === '0' || raw === '') return 0;
  const n = parseInt(raw ?? '90000', 10);
  return Number.isFinite(n) && n >= 0 ? n : 90000;
}

function readCacheTtlSeconds() {
  const ms = readCacheTtlMs();
  return ms <= 0 ? 0 : Math.max(1, Math.floor(ms / 1000));
}

const ttlSec = readCacheTtlSeconds() || 90;
const globalDataCache = new NodeCache({
  stdTTL: ttlSec,
  checkperiod: Math.min(120, Math.max(20, Math.floor(ttlSec / 2))),
  useClones: true,
});

export function invalidateDataCache() {
  globalDataCache.del(GLOBAL_DATA_CACHE_KEY);
}

// Keep the same export name as the old one so server.js doesn't break if anything still imports it
export const invalidateFirestoreReadCache = invalidateDataCache;

export function getReadCacheStatus() {
  const ttlMs = readCacheTtlMs();
  return {
    backend: 'node-cache',
    ttlMs,
    ttlSeconds: ttlMs > 0 ? ttlSec : 0,
    enabled: ttlMs > 0,
    key: GLOBAL_DATA_CACHE_KEY,
  };
}

export function isDbEnabled() {
  // Try to init, and it returns true if URI exists
  initMongo();
  return process.env.MONGODB_URI !== undefined;
}

export const isFirestoreEnabled = isDbEnabled;

function stripUndefined(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

// MongoDB does not allow dots in field names (treats them as path separators).
// We encode dots as '___dot___' on write and restore them on read.
function sanitizeKeysForMongo(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const safeKey = k.replace(/\./g, '___dot___');
    out[safeKey] = v;
  }
  return out;
}

function restoreKeysFromMongo(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const origKey = k.replace(/___dot___/g, '.');
    out[origKey] = v;
  }
  return out;
}

function isNestedFormat(doc) {
  return doc && typeof doc.tests === 'object' && doc.tests !== null;
}

function ensureNested(rawDoc) {
  if (!rawDoc) return rawDoc;
  if (isNestedFormat(rawDoc)) {
    const normalized = {
      ...rawDoc,
      ROLL_KEY: rawDoc.ROLL_KEY || rawDoc.rollKey || '',
      centerCode: rawDoc.centerCode || rawDoc.centreCode || '',
      tests: {},
    };

    for (const [testName, testData] of Object.entries(rawDoc.tests || {})) {
      if (!testData || typeof testData !== 'object') continue;
      const one = { ...testData };
      if (one.total === undefined && one.Total !== undefined) one.total = one.Total;
      delete one.Total;
      normalized.tests[testName] = one;
    }

    return normalized;
  }
  return flatToNested(rawDoc);
}

let memoryDevStore = null;

function getMemoryDevStore() {
  if (!memoryDevStore) {
    memoryDevStore = { profiles: [], tests: [], testColumns: [] };
  }
  return memoryDevStore;
}

export async function loadApplicationData() {
  if (!isDbEnabled()) {
    return getMemoryDevStore();
  }
  return loadGlobalDataFromDb();
}

export function sliceCenterFromGlobal(globalData, centerCode) {
  const profiles = globalData.profiles.filter((p) => p.centerCode === centerCode);
  const tests = globalData.tests.filter((t) => t.centerCode === centerCode);
  const colSet = new Set();
  tests.forEach((t) => {
    Object.keys(t).forEach((k) => {
      if (k !== 'ROLL_KEY' && k !== 'centerCode' && k !== 'stream' && k !== '_id' && k !== '__v' && k !== 'createdAt' && k !== 'updatedAt') colSet.add(k);
    });
  });
  const testColumns = colSet.size > 0 ? Array.from(colSet) : globalData.testColumns;
  return { profiles, tests, testColumns };
}

async function fetchGlobalDataFromDbOnce() {
  await initMongo();
  
  const [profilesDocs, tDocs] = await Promise.all([
    Profile.find({}).lean(),
    TestScore.find({}).lean()
  ]);

  const pDocs = profilesDocs.map(d => {
    // Restore any dot-encoded keys (___dot___ -> .) stored to work around MongoDB restrictions
    const obj = restoreKeysFromMongo({ ...d });
    delete obj._id;
    delete obj.__v;
    delete obj.createdAt;
    delete obj.updatedAt;

    // Find keys dynamically to handle casing differences like "Mobile No" vs "MOBILE NO"
    const keys = Object.keys(obj);
    
    const mobileKey = keys.find(k => k.toLowerCase() === 'mobile no');
    if (mobileKey) {
      obj['Mobile No.'] = obj[mobileKey];
      delete obj[mobileKey];
    }
    
    // Also inject a standard "Mobile" key just in case the frontend relies on that
    if (obj['Mobile No.']) obj['Mobile'] = obj['Mobile No.'];

    const rollNoKey = keys.find(k => k.toLowerCase() === 'roll no');
    if (rollNoKey) {
      obj['ROLL NO.'] = obj[rollNoKey];
      delete obj[rollNoKey];
    }

    const fatherMobileKey = keys.find(k => k.toLowerCase() === 'fathers mobile');
    if (fatherMobileKey) {
      obj["FATHER'S MOBILE"] = obj[fatherMobileKey];
    }

    const fatherMobileNoKey = keys.find(k => k.toLowerCase() === 'fathers mobile no');
    if (fatherMobileNoKey) {
      obj["FATHER'S MOBILE NO."] = obj[fatherMobileNoKey];
    }

    return obj;
  });

  const testColumnsSet = new Set();
  const tests = tDocs.map((d) => {
    const raw = { ...d };
    delete raw._id;
    delete raw.__v;
    delete raw.createdAt;
    delete raw.updatedAt;
    
    const nested = ensureNested(raw);
    const flat = nestedToFlat(nested);
    extractColumnsFromNestedTests(nested.tests).forEach((c) => testColumnsSet.add(c));
    return flat;
  });

  return {
    profiles: pDocs,
    tests,
    testColumns: Array.from(testColumnsSet),
  };
}

export async function loadGlobalDataFromDb() {
  if (!isDbEnabled()) {
    return { profiles: [], tests: [], testColumns: [] };
  }

  const ttlMs = readCacheTtlMs();

  if (ttlMs > 0) {
    const cached = globalDataCache.get(GLOBAL_DATA_CACHE_KEY);
    if (cached) {
      return {
        profiles: cached.profiles ?? [],
        tests: cached.tests ?? [],
        testColumns: cached.testColumns ?? [],
      };
    }
  }

  try {
    const data = await fetchGlobalDataFromDbOnce();
    const out = {
      profiles: data.profiles,
      tests: data.tests,
      testColumns: data.testColumns,
    };
    if (ttlMs > 0) {
      globalDataCache.set(GLOBAL_DATA_CACHE_KEY, {
        profiles: out.profiles,
        tests: out.tests,
        testColumns: out.testColumns,
      });
    }
    return out;
  } catch (err) {
    console.error('[DB] loadGlobalDataFromDb failed:', err.message || err);
    throw new Error(`Database read failed: ${err.message}`);
  }
}

export async function upsertProfileDoc(student) {
  if (!isDbEnabled()) return;
  const { centerCode, ROLL_KEY } = student;
  if (!centerCode || !ROLL_KEY) throw new Error('centerCode and ROLL_KEY are required');

  await initMongo();
  // Sanitize field names: MongoDB forbids dots in field names used with $set
  const cleanStudent = sanitizeKeysForMongo(stripUndefined(student));
  
  await Profile.findOneAndUpdate(
    { centerCode, ROLL_KEY },
    { $set: cleanStudent },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  invalidateDataCache();
}

export async function deleteStudentDocs(centerCode, rollKey) {
  if (!isDbEnabled()) return;
  await initMongo();
  
  await Promise.all([
    Profile.deleteOne({ centerCode, ROLL_KEY: rollKey }),
    TestScore.deleteOne({ centerCode, ROLL_KEY: rollKey })
  ]);
  
  invalidateDataCache();
}

export async function upsertTestDoc(centerCode, rollKey, scores) {
  if (!isDbEnabled()) return {};

  await initMongo();

  const doc = await TestScore.findOne({ centerCode, ROLL_KEY: rollKey });
  let base;
  
  if (doc) {
    base = ensureNested(doc.toObject());
  } else {
    base = { ROLL_KEY: rollKey, centerCode, stream: 'JEE', tests: {} };
  }

  if (scores && typeof scores.tests === 'object') {
    for (const [testName, testData] of Object.entries(scores.tests)) {
      if (!base.tests[testName]) base.tests[testName] = {};
      Object.assign(base.tests[testName], testData);
    }
  } else {
    const patchNested = flatToNested({ ROLL_KEY: rollKey, centerCode, ...scores });
    for (const [testName, testData] of Object.entries(patchNested.tests)) {
      if (!base.tests[testName]) base.tests[testName] = {};
      Object.assign(base.tests[testName], testData);
    }
  }

  if (scores.stream) base.stream = scores.stream;

  const cleanBase = stripUndefined(base);
  
  await TestScore.findOneAndUpdate(
    { centerCode, ROLL_KEY: rollKey },
    { $set: cleanBase },
    { upsert: true, setDefaultsOnInsert: true }
  );

  invalidateDataCache();
  return nestedToFlat(base);
}
