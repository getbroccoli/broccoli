import type { BroccoliEvents, EventBus, EventType, PublishedEvent } from "../events";
import type { Orm, OrmTransaction } from "./database";

/**
 * One open transaction, passed from a use case to every operation that must join
 * it. Only database adapters reach the ORM behind it, through `ormOf`.
 */
export interface Tx {
  /** Queues an event; it is dispatched once the transaction commits. */
  publish<Type extends EventType>(type: Type, payload: BroccoliEvents[Type]): void;
}

class Transaction implements Tx {
  readonly events: PublishedEvent[] = [];
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

  publish<Type extends EventType>(type: Type, payload: BroccoliEvents[Type]): void {
    // Reading `orm` checks the transaction is still open.
    void this.orm;
    this.events.push({ type, payload } as PublishedEvent);
  }

  end(): void {
    this.#orm = undefined;
  }
}

/**
 * Runs `work` in one transaction. After the commit, dispatches the events published
 * on it; a rollback drops them. Inner operations join `tx`; there is no nesting.
 */
export async function runInTransaction<T>(
  orm: Orm,
  events: EventBus,
  work: (tx: Tx) => Promise<T>,
): Promise<T> {
  let transaction: Transaction | undefined;
  try {
    const result = await orm.transaction((ormTransaction) => {
      transaction = new Transaction(ormTransaction);
      return work(transaction);
    });
    await events.dispatch(transaction!.events);
    return result;
  } finally {
    transaction?.end();
  }
}

/** The ORM to query: the pool, or the open transaction behind `db`. */
export function ormOf(db: Orm | Tx): Orm | OrmTransaction {
  return db instanceof Transaction ? db.orm : (db as Orm);
}
