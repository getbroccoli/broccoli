/** Resolver parent types for codegen; paths are relative to `src/core/graphql/resolvers.gen.ts`. */
export const codegenMappers = {
  // A mutation namespace holds no data; its field resolves to an empty object.
  EmployeesMutations: "Record<PropertyKey, never>",
  Employee: "../../modules/employees/domain#Employee as EmployeeModel",
  Location: "../../modules/employees/app#LocationWithPeopleCount as LocationModel",
  Terms: "../../modules/employees/app#TermsOverview as TermsModel",
  WorkingWeekVersion: "../../modules/employees/app#DatedWorkingWeek as WorkingWeekVersionModel",
  UnpublishedWorkingWeek:
    "../../modules/employees/domain#PatternVersion as UnpublishedWorkingWeekModel",
  EmployeeEmploymentTerms:
    "../../modules/employees/app#EmploymentTerms as EmployeeEmploymentTermsModel",
  PersonWorkingWeek: "../../modules/employees/app#PersonWorkingWeek as PersonWorkingWeekModel",
};
