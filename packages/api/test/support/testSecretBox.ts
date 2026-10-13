import { createSecretBox } from "../../src/core/secrets";

export const TEST_SECRET_BOX = createSecretBox(Buffer.alloc(32, 1).toString("base64url"));
