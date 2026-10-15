import { useMutation } from "@apollo/client/react";
import { Plus, UploadSimple } from "@phosphor-icons/react";
import { useRef, useState } from "react";

import {
  type ImportStepQuery,
  RemoveFileDocument,
  RetryFileDocument,
} from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

import { uploadFile, type UploadFileResult } from "../fileApi";
import { FileSourceCard } from "./FileSourceCard";

const REFUSALS = {
  notCsv: "imports.files.notCsv",
  empty: "imports.files.empty",
  tooManyRows: "imports.files.tooManyRows",
  tooManyColumns: "imports.files.tooManyColumns",
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

/** Staff files as sources of people: drop or choose CSV files, retry or remove them. */
export function FileSources({ sources, onUploaded, onUploadingChange }: FileSourcesProps) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [refusals, setRefusals] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [retryFile, retryState] = useMutation(RetryFileDocument);
  const [removeFile, removeState] = useMutation(RemoveFileDocument);
  const [changeFailed, setChangeFailed] = useState(false);
  const busy = uploading !== null || retryState.loading || removeState.loading;

  const upload = async (files: FileList | null) => {
    if (!files?.length || busy) {
      return;
    }
    setRefusals([]);
    onUploadingChange(true);
    const refused: string[] = [];
    try {
      for (const file of Array.from(files)) {
        setUploading(file.name);
        const result = await uploadFile(file);
        if (result === "ok") {
          // The file is stored; a failed reload only delays its card until the next one.
          await onUploaded().catch(() => {});
        } else {
          refused.push(t(REFUSALS[result], { name: file.name }));
        }
      }
    } finally {
      setUploading(null);
      setRefusals(refused);
      onUploadingChange(false);
      if (input.current) {
        input.current.value = "";
      }
    }
  };

  const change = async (run: () => Promise<unknown>) => {
    setChangeFailed(false);
    try {
      await run();
    } catch {
      setChangeFailed(true);
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
        accept=".csv,text/csv"
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
              onRetry={() => void change(() => retryFile({ variables: { sourceId: source.id } }))}
              onRemove={() => void change(() => removeFile({ variables: { sourceId: source.id } }))}
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
      {(refusals.length > 0 || changeFailed) && (
        <p role="alert" className="text-sm whitespace-pre-line text-destructive">
          {[...refusals, ...(changeFailed ? [t("imports.files.changeFailed")] : [])].join("\n")}
        </p>
      )}
    </section>
  );
}
