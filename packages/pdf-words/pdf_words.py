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
    """The page's shown words, from its top-left corner, each box rounded to 0.1 point."""
    shown = shown_text(page)
    return {
        "width": page.rect.width,
        "height": page.rect.height,
        "words": [
            [*(round(value, 1) for value in word[:4]), word[4]]
            for word in page.get_text("words")
            if shown.covers(pymupdf.Rect(word[:4]))
        ],
    }


INVISIBLE = 3  # The render mode of text that draws nothing, such as an OCR layer.
BAND = 20  # Points per band of the index of shown text.


class ShownText:
    """The boxes of text drawn visibly, by horizontal band, so a word meets only those near it."""

    def __init__(self, boxes):
        self.bands = {}
        for box in boxes:
            for band in bands_of(box):
                self.bands.setdefault(band, []).append(box)

    def covers(self, word):
        """Whether the word's box meets text that is drawn: text drawn invisibly is left out."""
        return any(
            word.intersects(box) for band in bands_of(word) for box in self.bands.get(band, [])
        )


def shown_text(page):
    trace = page.get_texttrace()
    return ShownText(
        pymupdf.Rect(span["bbox"])
        for span in trace
        if span["type"] != INVISIBLE and span["opacity"] > 0
    )


def bands_of(box):
    return range(int(box.y0 // BAND), int(box.y1 // BAND) + 1)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main(sys.stdin.buffer, sys.stdout))
