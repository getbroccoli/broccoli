import { Readable } from "node:stream";
import { createDeflate, deflateSync } from "node:zlib";

type Page = {
  width?: number;
  height?: number;
  texts?: { text: string; x: number; y: number }[];
  image?: { width: number; height: number };
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
          ...(page.texts ?? []).map(
            ({ text, x, y }) =>
              `BT /F1 10 Tf 1 0 0 1 ${x} ${y} Tm (${text.replace(/[\\()]/g, "\\$&")}) Tj ET`,
          ),
          ...(page.image
            ? [`q ${page.width ?? 612} 0 0 ${page.height ?? 792} 0 0 cm /Im1 Do Q`]
            : []),
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
    let imageResource = "";
    if (page.image) {
      const image = objects.push(
        pdfStream(
          Buffer.alloc(0),
          `/Type /XObject /Subtype /Image /Width ${page.image.width} /Height ${page.image.height} /ColorSpace /DeviceGray /BitsPerComponent 8`,
        ),
      );
      imageResource = `/XObject << /Im1 ${image} 0 R >>`;
    }
    return objects.push(
      Buffer.from(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width ?? 612} ${page.height ?? 792}] /Resources << /Font << /F1 ${font} 0 R >> ${imageResource} >> /Contents ${content} 0 R ${annotation && index === 0 ? `/Annots [${annotation} 0 R]` : ""} >>`,
      ),
    );
  });
  objects[0] = Buffer.from(`<< /Type /Catalog /Pages 2 0 R ${catalogExtras} >>`);
  objects[1] = Buffer.from(
    `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`,
  );
  return serializePdf(objects);
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
