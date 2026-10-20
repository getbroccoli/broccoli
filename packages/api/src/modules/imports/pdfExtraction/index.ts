export {
  createPdfExtractor,
  PdfExtractionError,
  type PdfExtractionFailure,
  type PdfExtractor,
} from "./app";
// shortcut: the upload still reads PDF tables until the service calls the extractor.
export { hasScannedPage, PDF_COMPLETION_TASKS, pdfSheets } from "./domain";
