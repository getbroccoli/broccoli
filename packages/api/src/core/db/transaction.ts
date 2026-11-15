import { randomUUID } from "node:crypto";

import { invalidInput } from "../applicationError";
import type { DomainEvents, EventBus, EventType, PublishedEvent } from "../events";
import { type BeforeCommitBus, createBeforeCommitBus } from "./beforeCommitBus";
import type { Orm, OrmTransaction } from "./database";
import { isUnstorableText } from "./uniqueViolation";

/**
 * One open transaction, passed from a use case to every operation that must join
 * it. Only database adapters reach the ORM behind it, through `ormOf`.
 */
export interface Tx {
  /** Queues an event: handed to before-commit handlers inside the transaction, dispatched after it commits. */
  publish<Type extends EventType>(type: Type, payload: DomainEvents[Type]): void;
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

  publish<Type extends EventType>(type: Type, payload: DomainEvents[Type]): void {
    // Reading `orm` checks the transaction is still open.
    void this.orm;
    // TypeScript cannot tie a generic `type` to its payload in the union, hence the cast.
    this.events.push({ id: randomUUID(), type, payload } as PublishedEvent);
  }

  end(): void {
    this.#orm = undefined;
  }
}

/** Runs work in one transaction, as `runInTransaction` describes. */
export type Transact = <T>(work: (tx: Tx) => Promise<T>) => Promise<T>;

/** Binds `runInTransaction` to the database and the event buses, once at startup. */
export function transactor(
  orm: Orm,
  eventBus: EventBus,
  beforeCommit: BeforeCommitBus = createBeforeCommitBus(),
): Transact {
  return (work) => runInTransaction(orm, { eventBus, beforeCommit }, work);
}

/** How many rounds of events before a commit may publish more: a loop of reactions beyond it is a bug. */
export const MAX_BEFORE_COMMIT_ROUNDS = 10;

/** The ORM to query: the pool, or the open transaction behind `db`. */
export function ormOf(db: Orm | Tx): Orm | OrmTransaction {
  return db instanceof Transaction ? db.orm : (db as Orm);
}

/**
 * Runs `work` in one transaction. Before the commit, hands the events published on it to the
 * before-commit handlers, round after round while they publish more; after the commit, dispatches
 * them all. A rollback drops them. Inner operations join `tx`; there is no nesting.
 */
async function runInTransaction<T>(
  orm: Orm,
  { eventBus, beforeCommit }: { eventBus: EventBus; beforeCommit: BeforeCommitBus },
  work: (tx: Tx) => Promise<T>,
): Promise<T> {
  let transaction: Transaction | undefined;
  let result: T;
  try {
    result = await orm.transaction(async (ormTransaction) => {
      transaction = new Transaction(ormTransaction);
      const value = await work(transaction);
      await handBeforeCommit(transaction, beforeCommit);
      return value;
    });
  } catch (error) {
    // Text Postgres cannot store, such as a NUL in a name, is input the caller must change.
    throw isUnstorableText(error) ? invalidInput([]) : error;
  } finally {
    // Ended before dispatch, so a handler cannot write through the released connection.
    transaction?.end();
  }
  await eventBus.dispatch(transaction!.events);
  return result;
}

/** Hands each round's new events to the before-commit handlers until a round publishes none. */
async function handBeforeCommit(transaction: Transaction, beforeCommit: BeforeCommitBus) {
  let handed = 0;
  for (let round = 0; handed < transaction.events.length; round += 1) {
    if (round === MAX_BEFORE_COMMIT_ROUNDS) {
      const types = [...new Set(transaction.events.slice(handed).map(({ type }) => type))];
      throw new Error(
        `Events kept publishing more events before the commit after ${MAX_BEFORE_COMMIT_ROUNDS} rounds. The last round published ${types.join(", ")}.`,
      );
    }
    const events = transaction.events.slice(handed);
    handed = transaction.events.length;
    await beforeCommit.deliver(transaction, events);
  }
}
