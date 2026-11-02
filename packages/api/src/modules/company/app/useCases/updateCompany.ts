import type { SecurityContext } from "../../../../core/security";
import { createSetupStepService } from "../../../../core/instance";
import { companyRepository } from "../../db";
import { parseCompanyName } from "../../domain";
import { type Company, type CompanyContext, readCompany } from "./company";

const setupSteps = createSetupStepService();

/** Saves the company's details and, if it is current, completes the company step of setup. */
export async function updateCompany(
  context: CompanyContext,
  ctx: SecurityContext,
  input: { name: string },
): Promise<Company> {
  ctx.requireSetupAccess("MANAGE_WORKSPACE");
  const name = parseCompanyName(input.name);
  await context.transact(async (tx) => {
    await companyRepository(tx).saveName(name);
    await setupSteps.completeCompanyStep(ctx, tx);
  });
  return readCompany(context);
}
