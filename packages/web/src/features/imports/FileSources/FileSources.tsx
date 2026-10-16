import { Plus, UploadSimple } from "@phosphor-icons/react";
import { useRef, useState } from "react";

import {
  type ImportStepQuery,
  RemoveFileDocument,
  RetryFileDocument,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

import { uploadFile, type UploadFileResult } from "../fileApi";
import { FileSourceCard } from "./FileSourceCard";

const REFUSALS = {
  unsupportedFile: "imports.files.unsupportedFile",
  scannedPdf: "imports.files.scannedPdf",
  encryptedPdf: "imports.files.encryptedPdf",
  noTable: "imports.files.noTable",
  empty: "imports.files.empty",
  tooManyRows: "imports.files.tooManyRows",
  tooManyColumns: "imports.files.tooManyColumns",
  tooManySheets: "imports.files.tooManySheets",
  tooLarge: "imports.files.tooLarge",
  failed: "imports.files.uploadFailed",
} as const satisfies Record<Exclude<UploadFileResult, "ok">, string>;

interface FileSourcesProps {
  /** The import's file sources, oldest first. */
  sources: ImportStepQuery["import"]["sources"];
  /** Reloads the import after a file was added. */
  onUploaded: () => Promise<unknown>;
  /** Tells whether files are being uploaded, so nothing is approved before they arrive. */
  onUploadingChange: (uploading: boolean) => void;
}

/** Staff files as sources of people: drop or choose CSV, Excel or PDF files, retry or remove them. */
export function FileSources({ sources, onUploaded, onUploadingChange }: FileSourcesProps) {
  const input = useRef<HTMLInputElement>(null);
  /** The file being uploaded, if any. */
  const [uploading, setUploading] = useState<string | null>(null);
  /** What went wrong with the last batch of files. */
  const [problems, setProblems] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [retryFile, retry] = usePayloadMutation(RetryFileDocument);
  const [removeFile, remove] = usePayloadMutation(RemoveFileDocument);
  const busy = uploading !== null || retry.loading || remove.loading;
  const changeFailed = retry.error || retry.payloadError || remove.error;
  const alerts = changeFailed ? [...problems, t("imports.files.changeFailed")] : problems;

  const upload = async (files: FileList | null) => {
    if (!files?.length || busy) {
      return;
    }
    onUploadingChange(true);
    const found: string[] = [];
    try {
      for (const file of Array.from(files)) {
        setUploading(file.name);
        const result = await uploadFile(file);
        if (result !== "ok") {
          found.push(t(REFUSALS[result], { name: file.name }));
        }
      }
      // One reload shows every new file.
      await onUploaded().catch(() => found.push(t("imports.files.reloadFailed")));
    } finally {
      setUploading(null);
      setProblems(found);
      onUploadingChange(false);
      if (input.current) {
        input.current.value = "";
      }
    }
  };

  return (
    <section
      aria-labelledby="import-files-title"
      className="flex flex-col gap-3"
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void upload(event.dataTransfer.files);
      }}
    >
      <h2 id="import-files-title" className="text-[15px] font-medium">
        {t("imports.files.title")}
      </h2>
      <input
        ref={input}
        type="file"
        accept=".csv,.xlsx,.pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-label={t("imports.files.choose")}
        onChange={(event) => void upload(event.target.files)}
      />
      {sources.length === 0 ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          aria-describedby="import-files-hint"
          className={`flex min-h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-8 text-center focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:opacity-60 ${dragging ? "border-primary bg-accent" : "border-border bg-muted/30 hover:bg-muted/50"}`}
        >
          <UploadSimple size={22} aria-hidden />
          <span className="text-[15px] font-medium">{t("imports.files.drop")}</span>
          <span className="text-[13px] text-muted-foreground">{t("imports.files.dropHint")}</span>
        </button>
      ) : (
        <ul
          className={`flex flex-col gap-2 rounded-xl ${dragging ? "outline-2 outline-primary" : ""}`}
        >
          {sources.map((source) => (
            <FileSourceCard
              key={source.id}
              source={source}
              busy={busy}
              // A failure shows through the mutation's `error` or `payloadError`.
              onRetry={() => void retryFile({ variables: { sourceId: source.id } }).catch(() => {})}
              onRemove={() =>
                void removeFile({ variables: { sourceId: source.id } }).catch(() => {})
              }
            />
          ))}
        </ul>
      )}
      <p id="import-files-hint" className="text-[13px] text-muted-foreground">
        {t("imports.files.limits")} {t("imports.files.disclosure")}
      </p>
      {sources.length > 0 && (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <Plus aria-hidden />
          {t("imports.files.addMore")}
        </Button>
      )}
      <p role="status" className="text-[13px] text-muted-foreground">
        {uploading ? t("imports.files.uploading", { name: uploading }) : ""}
      </p>
      {alerts.length > 0 && (
        <p role="alert" className="text-sm whitespace-pre-line text-destructive">
          {alerts.join("\n")}
        </p>
      )}
    </section>
  );
}
