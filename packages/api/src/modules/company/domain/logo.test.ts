import { expect, it } from "vitest";

import { parseLogo } from ".";

it.each([
  {
    hex: "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489",
    mimeType: "image/png",
  },
  { hex: "ffd8ffe0", mimeType: "image/jpeg" },
  { hex: "524946460c0000005745425056503820", mimeType: "image/webp" },
])("recognises $mimeType by its signature", ({ hex, mimeType }) => {
  const bytes = Buffer.from(hex, "hex");

  expect(parseLogo(bytes)).toEqual({ bytes, mimeType });
});

it.each([
  { format: "SVG", bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>') },
  { format: "GIF", bytes: Buffer.from("GIF89a") },
  { format: "empty input", bytes: Buffer.alloc(0) },
])("refuses $format", ({ bytes }) => {
  expect(parseLogo(bytes)).toBeNull();
});

it("refuses a PNG larger than 512 KiB", () => {
  const bytes = Buffer.alloc(512 * 1024 + 1);
  Buffer.from("89504e470d0a1a0a", "hex").copy(bytes);

  expect(parseLogo(bytes)).toBeNull();
});
