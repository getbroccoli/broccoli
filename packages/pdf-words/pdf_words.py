"""Reads a PDF's words and their boxes with PyMuPDF: PDF bytes on stdin, JSON on stdout."""

import json
import sys

# PyMuPDF's layout model serves only its table features, not words, and needs more memory than
# the reader may use; a failed import makes PyMuPDF skip it.
sys.modules["pymupdf.layout"] = None
import pymupdf  # noqa: E402

MAX_BYTES = 5 * 1024 * 1024
MAX_PAGES = 1000


def main(stdin, stdout) -> int:
    """Writes every page's size and words, or nothing and returns 1 when the PDF cannot be read."""
    data = stdin.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        return 1
    try:
        with pymupdf.open(stream=data, filetype="pdf") as document:
            if document.needs_pass or document.page_count > MAX_PAGES:
                return 1
            pages = [page_words(page) for page in document]
    except Exception:  # noqa: BLE001 - any failure to read means the PDF is unreadable
        return 1
    json.dump({"pages": pages}, stdout, ensure_ascii=False)
    return 0


def page_words(page):
    """The visible words, in the frame the page is shown in, each box rounded to 0.1 point."""
    traced = TracedCharacters(page)
    shown = page.rotation_matrix
    return {
        "width": page.rect.width,
        "height": page.rect.height,
        "words": [
            [*(round(value, 1) for value in pymupdf.Rect(word[:4]) * shown), word[4]]
            for word in page.get_text("words")
            if traced.shows(pymupdf.Rect(word[:4]))
        ],
    }


INVISIBLE = 3  # The render mode of text that draws nothing, such as an OCR layer.
BAND = 20  # Points per band of the index of traced characters.


class TracedCharacters:
    """The centre of every character the page draws and whether it is visible, by band."""

    def __init__(self, page):
        self.bands = {}
        for span in page.get_texttrace():
            visible = span["type"] != INVISIBLE and span["opacity"] > 0
            for _, _, _, (x0, y0, x1, y1) in span["chars"]:
                x, y = (x0 + x1) / 2, (y0 + y1) / 2
                self.bands.setdefault(int(y // BAND), []).append((x, y, visible))

    def shows(self, box):
        """Whether the characters inside the box are all visible: overlapping hidden text is not."""
        inside = [
            visible
            for band in range(int(box.y0 // BAND), int(box.y1 // BAND) + 1)
            for x, y, visible in self.bands.get(band, [])
            if box.x0 <= x <= box.x1 and box.y0 <= y <= box.y1
        ]
        return bool(inside) and all(inside)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main(sys.stdin.buffer, sys.stdout))
