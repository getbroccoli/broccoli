import { type Actor, requireOwner } from "../../../../core/actor";
import { runInTransaction } from "../../../../core/db";
import { advanceStep } from "../../../../core/instance";
import { companyRepository } from "../../db";
import { parseCompanyName } from "../../domain";
import { type Company, type CompanyContext, readCompany } from "./company";

/** Saves the company's details and, if it is current, completes the company step of setup. */
export async function updateCompany(
  context: CompanyContext,
  actor: Actor,
  input: { name: string },
): Promise<Company> {
  requireOwner(actor);
  const name = parseCompanyName(input.name);
  await runInTransaction(context.orm, context.eventBus, async (tx) => {
    await companyRepository(tx).saveName(name);
    await advanceStep(tx, "company", "import");
  });
  return readCompany(context);
}
