import type { Employee, NewEmployee } from "../domain/employee";

/**
 * An employee's place in the list order: lowercased first name, lowercased last
 * name, id. Lowercased by Postgres, so it compares exactly like the stored order.
 */
export type EmployeeKeyset = [firstName: string, lastName: string, id: string];

export interface EmployeePage {
  rows: { employee: Employee; keyset: EmployeeKeyset }[];
  hasNextPage: boolean;
}

export class EmailTakenError extends Error {
  constructor() {
    super("Another employee already has this email");
    this.name = "EmailTakenError";
  }
}

/** Storage of employees, listed in keyset order. */
export interface EmployeeRepository {
  /** Throws `EmailTakenError` when another employee has the email. */
  insert(employee: NewEmployee): Promise<Employee>;
  /** Up to `first` employees after `after`, or from the start when it is null. */
  findPage(page: { first: number; after: EmployeeKeyset | null }): Promise<EmployeePage>;
}
