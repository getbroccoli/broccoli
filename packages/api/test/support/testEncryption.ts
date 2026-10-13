import { createEncryption } from "../../src/core/secrets";

export const TEST_ENCRYPTION = createEncryption(Buffer.alloc(32, 1).toString("base64url"));
