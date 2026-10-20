import type { RequestHandler } from "express";

/**
 * Refuses with 401 a request to the browser's sign-in and setup routes that carries an
 * `Authorization` header: a bearer token is the external agent's, which never gets the authority of
 * the browser's cookies, so none of these routes may act on it.
 */
export const refuseBearerAuth: RequestHandler = (request, response, next) => {
  if (request.headers.authorization !== undefined) {
    response.sendStatus(401);
    return;
  }
  next();
};
