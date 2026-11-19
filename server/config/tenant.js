// Per-request company switching.
//
// Every request runs "inside" one company (see companyMiddleware). Company
// models (Client, RoyaltyAccounting, Settings, ...) are exported as a thin
// proxy that, on every use, forwards to the real Mongoose model for the company
// of the request being served. Route and service code stays exactly as it was:
// `Client.find()` reads MRM's database in an MRM request and Kangabeats'
// database in a Kangabeats request.
//
// Anything that runs outside a request (cron jobs, scripts) runs as MRM, the
// default company - so all of that behaves exactly as before.

const { AsyncLocalStorage } = require('async_hooks');
const mongoose = require('mongoose');
const { COMPANIES, COMPANY_KEYS, DEFAULT_COMPANY, isCompanyKey } = require('./companies');

const storage = new AsyncLocalStorage();

const currentCompanyKey = () => storage.getStore() || DEFAULT_COMPANY;
const currentCompany = () => COMPANIES[currentCompanyKey()];

// Run fn (sync or async) as the given company.
const runWithCompany = (key, fn) => {
  if (!isCompanyKey(key)) throw new Error(`Unknown company: ${key}`);
  return storage.run(key, fn);
};

// Run fn(key) once as each company, MRM first; returns the results in order.
// Used by the scheduled reports, which cover every company in one mail.
async function eachCompany(fn) {
  const out = [];
  for (const key of COMPANY_KEYS) out.push(await storage.run(key, () => fn(key)));
  return out;
}

// name -> { schema, collection } for every company model.
const schemas = new Map();
// company key -> mongoose connection
const connections = new Map();

function connectionFor(key) {
  if (connections.has(key)) return connections.get(key);
  const { dbName } = COMPANIES[key];
  // MRM: the default connection, i.e. exactly the database it always used.
  // Others: a sibling database on the same cluster and connection pool.
  const conn = dbName ? mongoose.connection.useDb(dbName, { useCache: true }) : mongoose.connection;
  connections.set(key, conn);
  // Register every model on a new company connection up front, so populate()
  // and cross-model lookups always find their models there.
  for (const [name] of schemas) modelFor(key, name, conn);
  return conn;
}

function modelFor(key, name, conn = connectionFor(key)) {
  if (conn.models[name]) return conn.models[name];
  const { schema, collection } = schemas.get(name);
  // MRM keeps using mongoose.model(), as before, so mongoose.model('X')
  // lookups elsewhere still resolve to MRM's models.
  return conn === mongoose.connection
    ? mongoose.model(name, schema, collection)
    : conn.model(name, schema, collection);
}

// Define a company-scoped model. Returns a stand-in that behaves like the
// Mongoose model of whichever company the current request belongs to.
function companyModel(name, schema, collection) {
  schemas.set(name, { schema, collection });
  // Register it straight away on every company's database.
  for (const key of COMPANY_KEYS) modelFor(key, name);

  const resolve = () => modelFor(currentCompanyKey(), name);
  // Extra exports hung on the model (e.g. RoyaltyAccounting.computeFields)
  // live on the stand-in itself and are shared by every company.
  const extras = {};
  const target = function CompanyModel() {};

  return new Proxy(target, {
    get(_t, prop) {
      if (Object.prototype.hasOwnProperty.call(extras, prop)) return extras[prop];
      const model = resolve();
      const value = Reflect.get(model, prop, model);
      return typeof value === 'function' && prop !== 'prototype' && prop !== 'constructor'
        ? value.bind(model)
        : value;
    },
    set(_t, prop, value) {
      extras[prop] = value;
      return true;
    },
    has(_t, prop) {
      return Object.prototype.hasOwnProperty.call(extras, prop) || prop in resolve();
    },
    construct(_t, args) {
      const Model = resolve();
      return new Model(...args);
    },
    apply(_t, thisArg, args) {
      return Reflect.apply(resolve(), thisArg, args);
    },
    getPrototypeOf() {
      return Object.getPrototypeOf(resolve());
    },
  });
}

// Express middleware: pick the company for this request from the X-Company
// header (or ?co= for public links). No header = MRM, so every existing caller
// keeps working unchanged.
function companyMiddleware(req, res, next) {
  const raw = req.get('X-Company') || req.query.co || DEFAULT_COMPANY;
  const key = String(raw).trim().toLowerCase();
  if (!isCompanyKey(key)) {
    return res.status(400).json({ message: `Unknown company: ${raw}` });
  }
  req.company = COMPANIES[key];
  storage.run(key, () => next());
}

module.exports = {
  companyModel,
  companyMiddleware,
  runWithCompany,
  eachCompany,
  currentCompany,
  currentCompanyKey,
  connectionFor,
};
