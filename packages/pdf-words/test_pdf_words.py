import io
import json

import pymupdf

from pdf_words import main


def test_reads_words_with_boxes_rounded_to_one_decimal():
    with pymupdf.open() as document:
        page = document.new_page(width=200, height=300)
        page.insert_text((40.24, 70.26), "Avery Stone", fontsize=11)
        source = io.BytesIO(document.tobytes())
    output = io.StringIO()

    status = main(source, output)

    assert status == 0
    assert json.loads(output.getvalue()) == {
        "pages": [
            {
                "width": 200,
                "height": 300,
                "words": [
                    [40.2, 58.4, 68.4, 73.5, "Avery"],
                    [71.4, 58.4, 100.2, 73.5, "Stone"],
                ],
            }
        ]
    }


def test_reports_a_rotated_pages_shown_width_and_height():
    with pymupdf.open() as document:
        page = document.new_page(width=200, height=300)
        page.insert_text((40, 70), "Avery Stone")
        page.set_rotation(90)
        source = io.BytesIO(document.tobytes())
    output = io.StringIO()

    status = main(source, output)

    assert status == 0
    page = json.loads(output.getvalue())["pages"][0]
    assert (page["width"], page["height"]) == (300, 200)


def test_writes_nothing_for_bytes_that_are_not_a_pdf():
    output = io.StringIO()

    status = main(io.BytesIO(b"Name,Email"), output)

    assert status == 1
    assert output.getvalue() == ""


def test_writes_nothing_for_a_password_protected_pdf():
    with pymupdf.open() as document:
        document.new_page().insert_text((40, 70), "Avery Stone")
        source = io.BytesIO(
            document.tobytes(
                encryption=pymupdf.PDF_ENCRYPT_AES_256,
                owner_pw="demo-owner-password",
                user_pw="demo-reader-password",
            )
        )
    output = io.StringIO()

    status = main(source, output)

    assert status == 1
    assert output.getvalue() == ""
