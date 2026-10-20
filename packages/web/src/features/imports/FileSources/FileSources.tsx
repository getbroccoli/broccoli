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
      <div className="mb-2">
        <h2 id="import-files-title" className="text-[19px] font-semibold tracking-[-0.01em]">
          {t("imports.files.title")}
        </h2>
        <p className="mt-1.5 max-w-[62ch] text-[15px] leading-[1.55] text-pretty text-muted-foreground">
          {t("imports.files.line")}
        </p>
      </div>
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
          className={`flex w-full flex-col items-center gap-3 rounded-2xl border-[1.5px] border-dashed px-8 py-14 text-center transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 ${dragging ? "border-brand bg-brand-soft/40" : "border-border bg-app-backdrop hover:border-muted-foreground/40"}`}
        >
          <span className="flex size-12 items-center justify-center rounded-xl bg-card shadow-[0_1px_2px_rgba(33,30,23,0.06)] ring-1 ring-border">
            <UploadSimple size={22} aria-hidden />
          </span>
          <span className="text-base font-semibold">{t("imports.files.drop")}</span>
          <span className="text-sm text-muted-foreground">{t("imports.files.dropHint")}</span>
        </button>
      ) : (
        <ul
          className={`flex flex-col gap-2.5 rounded-xl ${dragging ? "outline-2 outline-offset-4 outline-brand" : ""}`}
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
          className="h-9 gap-2 self-start"
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
