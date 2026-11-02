import type { Orm, Transact } from "../../../core/db";
import { createFileStorageService, type StoredFile } from "../../../core/files";
import {
  createInstanceService,
  createOwnerService,
  createSetupStepService,
} from "../../../core/instance";
import type { Logger } from "../../../core/logger";
import type { SecurityContext } from "../../../core/security";
import type { BrandLookup } from "../../../integrations/brandLookup";
import { invalidInput } from "../../../core/applicationError";
import { normalizeImage } from "../../../utils";
import { type CompanyRecord, companyRepository } from "../db";
import { companyDomain, parseCompanyName, suggestName } from "../domain";

const fileStorage = createFileStorageService();
const instances = createInstanceService();
const owners = createOwnerService();
const setupSteps = createSetupStepService();

/** The largest company logo Broccoli stores. */
export const MAX_LOGO_BYTES = 5 * 1024 * 1024;

/** The company as the owner sees it in the company step and later. */
export interface Company {
  name: string | null;
  suggestedName: string | null;
  logoFileId: string | null;
}

/** Everything that can be done with the company; the adapters call nothing else. */
export interface CompanyService {
  getCompany: (ctx: SecurityContext) => Promise<Company>;
  /** Saves the company's details and, if it is current, completes the company step of setup. */
  update: (ctx: SecurityContext, input: { name: string }) => Promise<Company>;
  /** Replaces the company logo with an image the owner uploaded. */
  saveLogo: (ctx: SecurityContext, bytes: Buffer) => Promise<Company>;
  removeLogo: (ctx: SecurityContext) => Promise<Company>;
  /** The current logo's file, or null when `fileId` is not the current logo. */
  readLogo: (ctx: SecurityContext, fileId: string) => Promise<StoredFile | null>;
  /**
   * Looks up the brand of the new owner's email domain once and keeps it for the
   * company step; an owner created after that step, as self-hosted setup does, gets
   * none. A failed lookup is logged; the domain suggestion still works.
   */
  detectCompanyNameAndLogo: (
    ctx: SecurityContext,
    owner: { userId: string; email: string },
  ) => Promise<void>;
  /** The stored company, for Broccoli's own emails and pages, such as an invite's. System only. */
  readStoredCompany: (ctx: SecurityContext) => Promise<CompanyRecord>;
}

export function createCompanyService({
  orm,
  transact,
  logger,
  brandLookup,
}: {
  orm: Orm;
  transact: Transact;
  logger: Logger;
  brandLookup: BrandLookup;
}): CompanyService {
  const companies = companyRepository(orm);
  const readCompany = async (): Promise<Company> => {
    const [{ name, brandName, logoFileId }, owner] = await Promise.all([
      companies.read(),
      owners.readOwner(orm),
    ]);
    return {
      name,
      suggestedName: suggestName({ brandName, ownerEmail: owner?.email ?? null }),
      logoFileId,
    };
  };
  return {
    async getCompany(ctx) {
      requireCompanyRead(ctx);
      return readCompany();
    },
    async update(ctx, input) {
      ctx.requireSetupAccess("MANAGE_WORKSPACE");
      const name = parseCompanyName(input.name);
      await transact(async (tx) => {
        await companyRepository(tx).saveName(name);
        await setupSteps.completeCompanyStep(ctx, tx);
      });
      return readCompany();
    },
    async saveLogo(ctx, bytes) {
      ctx.requireSetupAccess("MANAGE_WORKSPACE");
      const logo = await normalizeImage(bytes, { maxBytes: MAX_LOGO_BYTES });
      if (!logo) {
        throw invalidInput([{ field: "logo", code: "invalid" }]);
      }
      await transact((tx) => companyRepository(tx).replaceLogo(logo));
      return readCompany();
    },
    async removeLogo(ctx) {
      ctx.requireSetupAccess("MANAGE_WORKSPACE");
      await transact((tx) => companyRepository(tx).replaceLogo(null));
      return readCompany();
    },
    async readLogo(ctx, fileId) {
      requireCompanyRead(ctx);
      const { logoFileId } = await companies.read();
      return logoFileId === fileId ? fileStorage.readFile(orm, fileId) : null;
    },
    async detectCompanyNameAndLogo(ctx, { email }) {
      ctx.require("MANAGE_WORKSPACE");
      const domain = companyDomain(email);
      if (!domain || (await instances.readInstance(orm)).step !== "company") {
        return;
      }
      try {
        // The HTTP call runs before the transaction, so no connection or lock waits on it.
        const brand = await brandLookup(domain);
        const logo = brand?.logo
          ? await normalizeImage(brand.logo, { maxBytes: MAX_LOGO_BYTES })
          : null;
        await transact((tx) => companyRepository(tx).saveBrandOnce(brand?.name ?? null, logo));
      } catch (error) {
        logger.warn(
          { err: error },
          "Brand lookup failed; suggesting the company name from the email domain",
        );
      }
    },
    async readStoredCompany(ctx) {
      ctx.requireSystem();
      return companies.read();
    },
  };
}

/** Everyone signed in sees the company in their workspace menu. */
function requireCompanyRead(ctx: SecurityContext): void {
  if (!ctx.user) {
    ctx.requireSetupAccess("MANAGE_WORKSPACE");
  }
}
