import type { GraphqlContext, Resolvers } from "../../../core/graphql";
import {
  hasOpenConflict,
  incompleteReason,
  type ImportEmployee,
  type ImportEmployeeField,
} from "../domain";
import { importPhotoUrl } from "../http";
import { CHOICES, INCOMPLETE_REASONS } from "./graphqlValues";
import type { ImportLoaders } from "./loaders";

/** An import employee, its values, and the records it is made of. */
export function importEmployeeResolvers(
  loaders: (context: GraphqlContext) => ImportLoaders,
): Pick<Resolvers, "ImportEmployee" | "ImportEmployeeRecord"> {
  return {
    ImportEmployee: {
      id: ({ key }) => key,
      firstName: (employee) => employeeValue(employee, "firstName"),
      lastName: (employee) => employeeValue(employee, "lastName"),
      email: (employee) => employeeValue(employee, "email"),
      jobTitle: (employee) => employeeValue(employee, "jobTitle"),
      startDate: (employee) => employeeValue(employee, "startDate"),
      avatarUrl: ({ photoFileId }) => photoFileId && importPhotoUrl(photoFileId),
      incompleteReason: (employee) => {
        const reason = incompleteReason(employee);
        return reason ? INCOMPLETE_REASONS[reason] : null;
      },
    },
    ImportEmployeeRecord: {
      source: ({ sourceId }, _args, context) => loaders(context).source.load(sourceId),
    },
  };
}

/** One field of an import employee, with the records behind each of its values. */
function employeeValue({ records, values }: ImportEmployee, field: ImportEmployeeField) {
  const { value, choice, pickedRecordId, options } = values[field];
  return {
    value,
    choice: CHOICES[choice],
    pickedRecord: records.find(({ id }) => id === pickedRecordId) ?? null,
    conflict: hasOpenConflict(values[field]),
    options: options.map((option) => ({
      value: option.value,
      records: records.filter(({ id }) => option.recordIds.includes(id)),
    })),
  };
}
