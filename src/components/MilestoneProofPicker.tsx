"use client";

import { useState, type ChangeEvent } from "react";

const acceptedProofTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/rtf",
].join(",");

const formatFileSize = (bytes: number) =>
  bytes >= 1_000_000
    ? `${(bytes / 1_000_000).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1_000))} KB`;

type MilestoneProofPickerProps = {
  files: File[];
  onSelect: (files: FileList | null) => void;
  onRemove: (index: number) => void;
};

export function MilestoneProofPicker({ files, onSelect, onRemove }: MilestoneProofPickerProps) {
  const [inputVersion, setInputVersion] = useState(0);

  const resetNativeSelection = () => setInputVersion((current) => current + 1);

  const handleSelection = (event: ChangeEvent<HTMLInputElement>) => {
    onSelect(event.currentTarget.files);
    // The selected files are represented by the managed list below. Remounting
    // keeps Safari's native filename/thumbnail from becoming a second, stale UI.
    resetNativeSelection();
  };

  const handleRemove = (index: number) => {
    onRemove(index);
    resetNativeSelection();
  };

  return (
    <>
      <label className="milestone-proof-picker">
        <span className="milestone-proof-picker__title">Proof of completion</span>
        <span className="milestone-proof-picker__help">
          Add receipts, photos, PDFs, Word files, spreadsheets, or text files.
        </span>
        <input
          key={inputVersion}
          type="file"
          multiple
          accept={acceptedProofTypes}
          aria-label="Choose proof of completion files"
          onChange={handleSelection}
        />
        <span className="milestone-proof-picker__help">Up to 10 files, 25 MB each.</span>
      </label>
      {files.length ? (
        <div className="milestone-proof-list" aria-label="Selected proof files">
          {files.map((file, index) => (
            <div className="milestone-proof-file" key={`${file.name}-${file.lastModified}-${index}`}>
              <span>
                <strong>{file.name}</strong>
                <small>{formatFileSize(file.size)}</small>
              </span>
              <button
                type="button"
                className="ghost"
                aria-label={`Remove ${file.name}`}
                onClick={() => handleRemove(index)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
