import type { Browser } from "./browser";

export interface EmployeeCreateInput {
  firstName: string;
  lastName: string;
  email: string;
  jobTitle?: string | null;
  startDate?: string | null;
}

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string | null;
  startDate: string | null;
  createdAt: string;
}

let employeeCount = 0;

export async function createEmployee(
  browser: Browser,
  overrides: Partial<EmployeeCreateInput> = {},
): Promise<Employee> {
  const number = ++employeeCount;
  const response = await browser.graphql(
    `mutation CreateEmployee($input: EmployeeCreateInput!) {
      employee {
        create(input: $input) {
          id firstName lastName email jobTitle startDate createdAt
        }
      }
    }`,
    {
      input: {
        firstName: "Employee",
        lastName: String(number),
        email: `employee${number}@example.com`,
        ...overrides,
      },
    },
  );
  const body = (await response.json()) as {
    data?: { employee: { create: Employee } };
    errors?: unknown[];
  };
  if (!response.ok || body.errors?.length || !body.data?.employee?.create) {
    throw new Error(`Employee creation failed with ${response.status}: ${JSON.stringify(body)}`);
  }
  return body.data.employee.create;
}
