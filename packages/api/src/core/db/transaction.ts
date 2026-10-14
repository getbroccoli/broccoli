import type { DomainEvents, EventBus, EventType, DomainEvent } from "../events";
import type { Orm, OrmTransaction } from "./database";

/**
 * One open transaction, passed from a use case to every operation that must join
 * it. Only database adapters reach the ORM behind it, through `ormOf`.
 */
export interface Tx {
  /** Queues an event; it is dispatched once the transaction commits. */
  publish<Type extends EventType>(type: Type, payload: DomainEvents[Type]): void;
}

class Transaction implements Tx {
  readonly events: DomainEvent[] = [];
  #orm: OrmTransaction | undefined;

  constructor(orm: OrmTransaction) {
    this.#orm = orm;
  }

  get orm(): OrmTransaction {
    if (!this.#orm) {
      throw new Error("The transaction has ended");
    }
    return this.#orm;
  }

  publish<Type extends EventType>(type: Type, payload: DomainEvents[Type]): void {
    // Reading `orm` checks the transaction is still open.
    void this.orm;
    // TypeScript cannot tie a generic `type` to its payload in the union, hence the cast.
    this.events.push({ type, payload } as DomainEvent);
  }

  end(): void {
    this.#orm = undefined;
  }
}

/** Runs work in one transaction, as `runInTransaction` describes. */
export type Transact = <T>(work: (tx: Tx) => Promise<T>) => Promise<T>;

/** Binds `runInTransaction` to the database and the event bus, once at startup. */
export function transactor(orm: Orm, eventBus: EventBus): Transact {
  return (work) => runInTransaction(orm, eventBus, work);
}

/** The ORM to query: the pool, or the open transaction behind `db`. */
export function ormOf(db: Orm | Tx): Orm | OrmTransaction {
  return db instanceof Transaction ? db.orm : (db as Orm);
}

/**
 * Runs `work` in one transaction. After the commit, dispatches the events published
 * on it; a rollback drops them. Inner operations join `tx`; there is no nesting.
 */
async function runInTransaction<T>(
  orm: Orm,
  eventBus: EventBus,
  work: (tx: Tx) => Promise<T>,
): Promise<T> {
  let transaction: Transaction | undefined;
  let result: T;
  try {
    result = await orm.transaction((ormTransaction) => {
      transaction = new Transaction(ormTransaction);
      return work(transaction);
    });
  } finally {
    // Ended before dispatch, so a handler cannot write through the released connection.
    transaction?.end();
  }
  await eventBus.dispatch(transaction!.events);
  return result;
}
