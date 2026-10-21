import { z } from "zod";

import { fetchBytes, fetchJson, urlUnder } from "../../utils";

/** A member of a Slack workspace, as `users.list` returns it. */
export type SlackMember = z.infer<typeof member>;

/** Slack's Web API, called with a workspace's bot token. */
export interface SlackApi {
  /** Every member of the workspace, page by page; rejects when Slack refuses. */
  listMembers(accessToken: string): Promise<SlackMember[]>;
  /** The bytes at a member's photo link, which needs no token; rejects when the download fails. */
  readPhoto(url: URL): Promise<Buffer>;
}

export function createSlackApi(apiUrl: string): SlackApi {
  return {
    listMembers: async (accessToken) => {
      const members: SlackMember[] = [];
      let cursor = "";
      for (let page = 0; page < MAX_PAGES; page++) {
        const url = urlUnder(apiUrl, "users.list");
        url.search = new URLSearchParams({ limit: String(PAGE_SIZE), cursor }).toString();
        const answer = await fetchJson(url, usersListAnswer, {
          timeoutMs: TIMEOUT_MS,
          maxBytes: MAX_PAGE_BYTES,
          init: { headers: { authorization: `Bearer ${accessToken}` } },
        });
        if (!answer?.ok || !answer.members) {
          throw new Error(`Slack refused users.list: ${answer?.error ?? "no members"}`);
        }
        members.push(...answer.members);
        cursor = answer.response_metadata?.next_cursor ?? "";
        if (cursor === "") {
          return members;
        }
      }
      throw new Error(`The workspace has more than ${MAX_PAGES * PAGE_SIZE} members`);
    },

    // A redirect could lead off Slack's photo hosts, so none is followed.
    readPhoto: async (url) => {
      const photo = await fetchBytes(url, {
        timeoutMs: PHOTO_TIMEOUT_MS,
        maxBytes: MAX_PHOTO_BYTES,
        init: { redirect: "error" },
      });
      if (!photo) {
        throw new Error(`GET ${url.origin} answered 404`);
      }
      return photo;
    },
  };
}

const TIMEOUT_MS = 15_000;
const PAGE_SIZE = 200;
const MAX_PAGES = 50;
/** A page of 200 full Slack profiles stays well below this. */
const MAX_PAGE_BYTES = 8 * 1024 * 1024;
const PHOTO_TIMEOUT_MS = 10_000;
/** Far above a 192-pixel profile photo. */
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

const member = z.object({
  id: z.string(),
  name: z.string().optional(),
  real_name: z.string().optional(),
  deleted: z.boolean().optional(),
  is_bot: z.boolean().optional(),
  is_app_user: z.boolean().optional(),
  is_restricted: z.boolean().optional(),
  is_ultra_restricted: z.boolean().optional(),
  profile: z
    .object({
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      real_name: z.string().optional(),
      display_name: z.string().optional(),
      email: z.string().optional(),
      title: z.string().optional(),
      // Malformed photo fields mean no photo, never a refused page.
      image_192: z.string().optional().catch(undefined),
      is_custom_image: z.boolean().optional().catch(undefined),
    })
    .optional(),
});

const usersListAnswer = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  // Absent when Slack refuses; never read as an empty workspace.
  members: z.array(member).optional(),
  response_metadata: z.object({ next_cursor: z.string().optional() }).optional(),
});
