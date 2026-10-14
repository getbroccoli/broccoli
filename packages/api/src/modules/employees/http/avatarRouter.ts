import express from "express";

import { requireSignedIn } from "../../../core/security";
import { sendApplicationError } from "../../../core/applicationError";
import type { Orm } from "../../../core/db";
import { sendFile } from "../../../core/files";
import type { SecurityResolver } from "../../../core/graphql";
import type { EmployeeUseCases } from "../app";

/** Where the avatar in this file is served. */
export function avatarUrl(fileId: string): string {
  return `/api/employees/avatar/${fileId}`;
}

/** `GET /api/employees/avatar/:fileId` serves an employee's avatar, cached for good. */
export function avatarRouter(
  useCases: EmployeeUseCases,
  resolveSecurity: SecurityResolver,
  orm: Orm,
): express.Router {
  return express.Router().get("/employees/avatar/:fileId", async (request, response) => {
    try {
      const ctx = requireSignedIn((await resolveSecurity(request.headers)).security);
      const { fileId } = request.params;
      if (!(await useCases.isEmployeeAvatarFile(ctx, fileId))) {
        response.sendStatus(404);
        return;
      }
      await sendFile(orm, fileId, response);
    } catch (error) {
      sendApplicationError(error, response);
    }
  });
}
