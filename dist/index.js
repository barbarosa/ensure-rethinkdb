"use strict";
const r = require("rethinkdb");
const ramda_1 = require("ramda");
const rxjs_1 = require("rxjs");
;
class EnsureRethinkDB {
    constructor(dbStructure, config, connectTimeAllowed = 1000) {
        this.dbStructure = dbStructure;
        this.config = config;
        this.connectTimeAllowed = connectTimeAllowed;
        this.connectTimer$ = rxjs_1.Observable
            .timer(this.connectTimeAllowed)
            .map(Boolean)
            .last();
        this.conn$ = rxjs_1.Observable
            .fromPromise(r.connect(this.config))
            .last()
            .catch(err => {
            const errMsg = `[Ensure RethinkDb]: Cannot connect! Rethink DB Output: ${String(err)}`;
            console.error(errMsg);
            return rxjs_1.Observable.throw(new Error(errMsg));
        });
        this.tryConnection$ = rxjs_1.Observable.race(this.conn$, this.connectTimer$);
        this.dbList$ = (conn) => rxjs_1.Observable.fromPromise(r.dbList().run(conn));
        this.tableList$ = (dbName) => this.tryConnection$
            .filter(Boolean)
            .switchMap(conn => rxjs_1.Observable.fromPromise(r.db(dbName).tableList().run(conn)));
        this.createDb$ = (dbName) => this.tryConnection$
            .filter(Boolean)
            .switchMap(conn => rxjs_1.Observable
            .fromPromise(r.dbCreate(dbName).run(conn))
            .do(() => console.log(`[Ensure RethinkDb]: Creating database ${dbName}`))
            .catch(err => {
            console.error(`[Ensure RethinkDb]: Cannot create database ${dbName}! Rethink DB Output: ${String(err)}`);
            return rxjs_1.Observable.empty();
        }));
        this.createTable$ = (dbName, tableName, options = {}) => this.tryConnection$
            .filter(Boolean)
            .switchMap(conn => rxjs_1.Observable
            .fromPromise(r.db(dbName).tableCreate(tableName, options).run(conn))
            .catch(err => {
            console.error(`[Ensure RethinkDb]: Cannot create table ${tableName}! Rethink DB Output: ${String(err)}`);
            return rxjs_1.Observable.throw(new Error('kaboom'));
        }));
        this.createTables$ = (dbName) => {
            const tablesToCreate = this.dbStructure[dbName];
            return rxjs_1.Observable
                .from(ramda_1.toPairs(tablesToCreate))
                .do(tableObj => console.log(`[Ensure RethinkDb]: Creating table ${ramda_1.head(tableObj)} for database ${dbName}`))
                .switchMap(tableObj => this.createTable$(dbName, ramda_1.head(tableObj), ramda_1.last(tableObj)));
        };
        this.tablesCheck$ = (dbName, existingTables) => {
            const tablesToCheck = ramda_1.keys(this.dbStructure[dbName]);
            const missingTables = ramda_1.difference(tablesToCheck, existingTables);
            return rxjs_1.Observable
                .from(missingTables)
                .do(tableName => console.log(`[Ensure RethinkDb]: Creating table ${tableName} for database ${dbName}`))
                .switchMap(tableName => this.createTable$(dbName, tableName, ramda_1.path([dbName, tableName], this.dbStructure)))
                .take(ramda_1.length(missingTables));
        };
        this.newDbs$ = (dbList) => rxjs_1.Observable
            .from(dbList)
            .mergeMap(this.createDb$, this.createTables$)
            .switch();
        this.existingDbs$ = (dbList) => rxjs_1.Observable
            .from(dbList)
            .mergeMap(this.tableList$, this.tablesCheck$)
            .switch();
        this.compareStructure$ = (existingDbs) => {
            const ensureDbs = ramda_1.keys(this.dbStructure);
            const matchingDbs = ramda_1.intersection(ensureDbs, existingDbs);
            const missingDbs = ramda_1.difference(ensureDbs, existingDbs);
            const countDbs = ramda_1.add(ramda_1.length(matchingDbs), ramda_1.length(missingDbs));
            return rxjs_1.Observable
                .merge(this.newDbs$(missingDbs), this.existingDbs$(matchingDbs))
                .take(countDbs);
        };
        this.ensureDbs$ = this.tryConnection$
            .filter(Boolean)
            .switchMap(this.dbList$)
            .switchMap(this.compareStructure$);
    }
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = EnsureRethinkDB;
;
/*
 * For async usage without any observables required
 */
exports.ensureAsync = (dbStructure, config) => {
    const ensureRethink = new EnsureRethinkDB(dbStructure, config);
    return new Promise((resolve, reject) => {
        ensureRethink.ensureDbs$.subscribe(null, e => reject(e), () => {
            console.log('[Ensure RethinkDb]: Completed; All ok!');
            resolve(true);
        });
    });
};
