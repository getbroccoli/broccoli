import { type Actor, requireOwner } from "../../../../core/actor";
import { runInTransaction } from "../../../../core/db";
import { advanceStep } from "../../../../core/instance";
import { companyRepository } from "../../db";
import { parseCompanyName } from "../../domain";
import { type Company, type CompanyContext, readCompany } from "./company";

/** Saves the name and, if it is current, completes the company step, in one transaction. */
export async function setName(
  context: CompanyContext,
  actor: Actor,
  rawName: string,
): Promise<Company> {
  requireOwner(actor);
  const name = parseCompanyName(rawName);
  await runInTransaction(context.orm, context.eventBus, async (tx) => {
    await companyRepository(tx).saveName(name);
    await advanceStep(tx, "company", "done");
  });
  return readCompany(context);
}
