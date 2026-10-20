import type { SlackApi, SlackMember } from "../../src/integrations/slack";
import { PNG } from "./images";

export function fakeSlackApi(members: SlackMember[] = [SLACK_MEMBER_WITH_PHOTO]): SlackApi {
  return {
    listMembers: () => Promise.resolve(members),
    readPhoto: () => Promise.resolve(PNG),
  };
}

export const SLACK_PHOTO_URL = "https://avatars.slack-edge.com/2026-01-01/123_abc_192.jpg";

export const SLACK_MEMBER_WITH_PHOTO = {
  id: "U1",
  profile: {
    first_name: "Avery",
    last_name: "Stone",
    email: "avery@example.com",
    image_192: SLACK_PHOTO_URL,
    is_custom_image: true,
  },
};
