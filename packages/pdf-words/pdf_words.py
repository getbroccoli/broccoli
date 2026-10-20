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
    """The page as shown, from its top-left corner, with each word's box rounded to 0.1 point."""
    return {
        "width": page.rect.width,
        "height": page.rect.height,
        "words": [
            [*(round(value, 1) for value in word[:4]), word[4]] for word in page.get_text("words")
        ],
    }


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main(sys.stdin.buffer, sys.stdout))
