import type { SlackMember } from "../../src/modules/slack";
import { PNG } from "./images";

export function slackPhotoReader(members: SlackMember[] = [SLACK_MEMBER_WITH_PHOTO]) {
  return {
    readSlackMembers: () =>
      Promise.resolve({
        workspace: { id: "T1", name: "Acme Workspace" },
        members,
        snapshot: "test-snapshot",
      }),
    isCurrentSlackConnection: () => Promise.resolve(true),
    readSlackPhoto: () => Promise.resolve(PNG),
  };
}

export const SLACK_PHOTO_URL = "https://avatars.slack-edge.com/2026-01-01/123_abc_512.jpg";

export const SLACK_MEMBER_WITH_PHOTO = {
  id: "U1",
  profile: {
    first_name: "Avery",
    last_name: "Stone",
    email: "avery@example.com",
    image_512: SLACK_PHOTO_URL,
    is_custom_image: true,
  },
};
