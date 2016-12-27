import * as r from 'rethinkdb';
import { difference, intersection, keys, toPairs, head, last, add, length, path } from 'ramda';
import { Observable } from 'rxjs';

// example db structure
interface IDBStruc {
  dbName1?: {
    tableName1?: {
      tableOption1?: any
    },
    // no options
    tableName2?: {}
    // etc.
  };
}

export default class EnsureRethinkDB {
  constructor(
    private dbStructure: IDBStruc,
    private config: r.ConnectionOptions,
    private connectTimeAllowed = 1000
  ) {}

  private connectTimer$ =
    Observable
      .timer(this.connectTimeAllowed)
      .map(Boolean)
      .last();

  private conn$ =
    Observable
      .fromPromise(r.connect(this.config))
      .last()
      .catch(err => {
        const errMsg = `[Ensure RethinkDb]: Cannot connect! Rethink DB Output: ${String(err)}`;
        console.error(errMsg);
        return Observable.throw(new Error(errMsg));
      });

  private tryConnection$ =
    Observable.race(this.conn$, this.connectTimer$);

  private dbList$ = (conn) =>
    Observable.fromPromise(r.dbList().run(conn));

  private tableList$ = (dbName) =>
    this.tryConnection$
      .filter(Boolean)
      .switchMap(
        conn =>
          Observable.fromPromise(r.db(dbName).tableList().run(conn))
      );

  private createDb$ = (dbName: string) =>
    this.tryConnection$
      .filter(Boolean)
      .switchMap(
        conn =>
          Observable
            .fromPromise(r.dbCreate(dbName).run(conn))
            .do(() => console.log(`[Ensure RethinkDb]: Creating database ${dbName}`))
            .catch(err => {
              console.error(`[Ensure RethinkDb]: Cannot create database ${dbName}! Rethink DB Output: ${String(err)}`);
              return Observable.empty();
            })
      )

  private createTable$ = (dbName, tableName, options = {}) =>
    this.tryConnection$
      .filter(Boolean)
      .switchMap(
        conn =>
          Observable
            .fromPromise(r.db(dbName).tableCreate(tableName, options).run(conn))
            .catch(err => {
              console.error(`[Ensure RethinkDb]: Cannot create table ${tableName}! Rethink DB Output: ${String(err)}`);
              return Observable.throw(new Error('kaboom'));
            })
      )

  private createTables$ = (dbName: string) => {
    const tablesToCreate = this.dbStructure[dbName];

    return Observable
      .from(toPairs(tablesToCreate))
      .do(tableObj => console.log(`[Ensure RethinkDb]: Creating table ${head(tableObj)} for database ${dbName}`))
      .switchMap(tableObj => this.createTable$(dbName, head(tableObj), last(tableObj)));
  }

  private tablesCheck$ = (dbName: string, existingTables: string[]) => {
    const tablesToCheck = keys(this.dbStructure[dbName]);
    const missingTables = difference(tablesToCheck, existingTables);

    return Observable
      .from(missingTables)
      .do(tableName => console.log(`[Ensure RethinkDb]: Creating table ${tableName} for database ${dbName}`))
      .switchMap(tableName => this.createTable$(dbName, tableName, path([dbName, tableName], this.dbStructure)))
      .take(length(missingTables));
  }

  private newDbs$ = (dbList: string[]) =>
    Observable
      .from(dbList)
      .mergeMap(this.createDb$, this.createTables$)
      .switch();

  private existingDbs$ = (dbList: string[]) =>
    Observable
      .from(dbList)
      .mergeMap(this.tableList$, this.tablesCheck$)
      .switch();

  private compareStructure$ = (existingDbs: string[]) => {
    const ensureDbs = keys(this.dbStructure);
    const matchingDbs = intersection(ensureDbs, existingDbs);
    const missingDbs = difference(ensureDbs, existingDbs);
    const countDbs = add(length(matchingDbs), length(missingDbs));

    return Observable
      .merge(
        this.newDbs$(missingDbs),
        this.existingDbs$(matchingDbs)
      )
      .take(countDbs);
  }

  public ensureDbs$ =
    this.tryConnection$
      .filter(Boolean)
      .switchMap(this.dbList$)
      .switchMap(this.compareStructure$);
};

/*
 * For async usage without any observables required
 */
export const ensureAsync = (dbStructure: IDBStruc, config: r.ConnectionOptions) => {

  const ensureRethink = new EnsureRethinkDB(dbStructure, config);

  return new Promise((resolve, reject) => {
    ensureRethink.ensureDbs$.subscribe(
      null,
      e => reject(e),
      () => {
        console.log('[Ensure RethinkDb]: Completed; All ok!');
        resolve(true);
      }
    );
  });
};
