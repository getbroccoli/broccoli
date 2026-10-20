import { Readable } from "node:stream";
import { createDeflate, deflateSync } from "node:zlib";

type Page = {
  width?: number;
  height?: number;
  texts?: { text: string; x: number; y: number; invisible?: boolean }[];
  images?: { x: number; y: number; width: number; height: number }[];
  formImage?: boolean;
  image?: { width: number; height: number };
  /** Shown turned clockwise, as a landscape report is: its text runs up the page to read across. */
  rotated?: boolean;
};

/** A minimal PDF with positioned Helvetica text and compressed page contents. */
export function samplePdfFile({
  pages,
  extras,
}: {
  pages: Page[];
  extras?: "script-attachment-link";
}): Uint8Array {
  return pdfDocument(
    pages.map((page) => ({
      ...page,
      content: deflateSync(
        [
          ...(page.images ?? []).map(
            ({ x, y, width, height }, index) =>
              `q ${width} 0 0 ${height} ${x} ${y} cm /Image${index} Do Q`,
          ),
          ...(page.formImage ? ["q /Form1 Do Q"] : []),
          ...(page.image
            ? [`q ${page.width ?? 612} 0 0 ${page.height ?? 792} 0 0 cm /Im1 Do Q`]
            : []),
          ...(page.texts ?? []).map(
            ({ text, x, y, invisible }) =>
              `BT ${invisible ? 3 : 0} Tr /F1 10 Tf ${page.rotated ? "0 1 -1 0" : "1 0 0 1"} ${x} ${y} Tm (${text.replace(/[\\()]/g, "\\$&")}) Tj ET`,
          ),
        ].join("\n"),
      ),
    })),
    extras,
  );
}

/** A small PDF whose page content expands to 640 MB without allocating it in the test process. */
export async function pdfWithContentBomb(): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  const compressed = Readable.from(contentBombChunks()).pipe(createDeflate());
  for await (const chunk of compressed) chunks.push(chunk as Buffer);
  return pdfDocument([{ content: Buffer.concat(chunks) }]);
}

function* contentBombChunks() {
  const spaces = Buffer.alloc(16 * 1024 * 1024, " ");
  for (let chunk = 0; chunk < 40; chunk += 1) yield spaces;
}

function pdfDocument(pages: (Page & { content: Buffer })[], extras?: "script-attachment-link") {
  const objects: Buffer[] = [Buffer.alloc(0), Buffer.alloc(0)];
  const font = objects.push(Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"));
  let catalogExtras = "";
  let annotation: number | undefined;
  if (extras) {
    const script = objects.push(Buffer.from("<< /S /JavaScript /JS (throw 1;) >>"));
    const attachment = objects.push(pdfStream(Buffer.from("Attached text"), "/Type /EmbeddedFile"));
    const file = objects.push(
      Buffer.from(`<< /Type /Filespec /F (note.txt) /EF << /F ${attachment} 0 R >> >>`),
    );
    annotation = objects.push(
      Buffer.from(
        "<< /Type /Annot /Subtype /Link /Rect [0 0 100 20] /A << /S /URI /URI (https://example.com/) >> >>",
      ),
    );
    catalogExtras = `/OpenAction ${script} 0 R /Names << /EmbeddedFiles << /Names [(note.txt) ${file} 0 R] >> >>`;
  }

  const pageIds = pages.map((page, index) => {
    const content = objects.push(pdfStream(page.content, "/Filter /FlateDecode"));
    const imageResources: string[] = [];
    if (page.image) {
      const image = objects.push(
        pdfStream(
          Buffer.alloc(0),
          `/Type /XObject /Subtype /Image /Width ${page.image.width} /Height ${page.image.height} /ColorSpace /DeviceGray /BitsPerComponent 8`,
        ),
      );
      imageResources.push(`/Im1 ${image} 0 R`);
    }
    for (const [index] of (page.images ?? []).entries()) {
      const image = objects.push(pixelImage());
      imageResources.push(`/Image${index} ${image} 0 R`);
    }
    if (page.formImage) {
      const image = objects.push(pixelImage());
      const width = page.width ?? 612;
      const height = page.height ?? 792;
      const form = objects.push(
        pdfStream(
          Buffer.from(`q ${width} 0 0 ${height} 0 0 cm /Image Do Q`),
          `/Type /XObject /Subtype /Form /BBox [0 0 ${width} ${height}] /Resources << /XObject << /Image ${image} 0 R >> >>`,
        ),
      );
      imageResources.push(`/Form1 ${form} 0 R`);
    }
    return objects.push(
      Buffer.from(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width ?? 612} ${page.height ?? 792}] /Resources << /Font << /F1 ${font} 0 R >> /XObject << ${imageResources.join(" ")} >> >> /Contents ${content} 0 R ${page.rotated ? "/Rotate 90" : ""} ${annotation && index === 0 ? `/Annots [${annotation} 0 R]` : ""} >>`,
      ),
    );
  });
  objects[0] = Buffer.from(`<< /Type /Catalog /Pages 2 0 R ${catalogExtras} >>`);
  objects[1] = Buffer.from(
    `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`,
  );
  return serializePdf(objects);
}

function pixelImage() {
  return pdfStream(
    Buffer.from([128]),
    "/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8",
  );
}

function pdfStream(content: Buffer, dictionary: string) {
  return Buffer.concat([
    Buffer.from(`<< /Length ${content.length} ${dictionary} >>\nstream\n`),
    content,
    Buffer.from("\nendstream"),
  ]);
}

function serializePdf(objects: Buffer[]): Uint8Array {
  const parts = [Buffer.from("%PDF-1.7\n")];
  const offsets: number[] = [];
  let length = parts[0]!.length;
  objects.forEach((object, index) => {
    offsets.push(length);
    const part = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`),
      object,
      Buffer.from("\nendobj\n"),
    ]);
    parts.push(part);
    length += part.length;
  });
  parts.push(
    Buffer.from(
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`,
    ),
  );
  return new Uint8Array(Buffer.concat(parts));
}
