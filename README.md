# ensure-rethinkdb
Ensures / creates initial rethinkdb structure both databases and tables using observables (rxjs v.5)

### Description

When working with rethinkdb, sometimes in a continous delivery, testing or Docker based environment you need to start a new 
rethinkdb instance and re-create the rethinkdb structure.

This module automates this task and creates / ensures a desired rethinkdb structure, in a non-obstructive async process with the minimum number of rethinkdb calls - 
adding only missing databases, or missing tables from exisiting databases. Important does not drops/deletes and db/table. Also detectes if rethinkdb can connect or not.

Could be a good addition in a project already using or deciding to use Rxjs (v.5) but it exposes both a Promise and an Observable.

### Dependencies

* Rxjs (v.5), 
* rethinkdb JavaScript driver (promise calls)
* ramda

### Install
```bash
npm install -S ensure-rethinkdb 
```

### Usage

Given a similar input, a rethinkdb instance host and port,
```typescript
const rConfig = {
  host: '192.168.99.100',
  port: 32769
};
```

Given a rethinkdb database + tables + optional table options structure,
```typescript
const rethinkDbStruc = {
  // a db
  planner: {
    days: {},
    // table with options
    weeks: { shards: 2 }
  }
  // another db
  testdb: {
    // empty options
    table1: {},
    table2: {}
  }
}
```

We can use it in 2 ways:

1. Async (returns a Promise)

```typescript
import { ensureAsync } from 'ensure-rethinkdb';

export async function startServer() {
  try {
    await ensureAsync(rethinkDbStruc, rConfig);
  } catch (err) {
    // handleError(err)
  }
  // later
  startServer();
```  

2. Subscription (returns an Observable)

```typescript
import EnsureRethinkDb from 'ensure-rethinkdb';

const ensureRethink = new EnsureRethinkDb(rethinkDbStruc, rConfig);

ensureRethink.ensureDbs$.subscribe(
  // we are not interested in the received values
  null,
  // only in a possible error
  e => console.log(e),
  // and completed as will signal rethinkdb it's ready to be used
  () => console.log('Completed; All OK')
);
``` 

### Licence
MIT
