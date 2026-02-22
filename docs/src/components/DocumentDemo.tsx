import { useCallback, useState } from "react";
import { ApiConfig } from "./ApiConfig";
import { INPUT_CLASS, searchApi, useAbortRef, useApiConfig } from "./shared";
import { ErrorAlert, JsonPreview } from "./shared-ui";

export default function DocumentDemo() {
  const { endpoint, index, token, configProps } = useApiConfig();
  const [docId, setDocId] = useState("");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const newController = useAbortRef();

  const fetchDocument = useCallback(() => {
    if (!docId.trim()) return;
    const ctrl = newController();
    setError("");
    searchApi<Record<string, unknown>>(
      endpoint,
      index,
      `documents/${encodeURIComponent(docId.trim())}`,
      {},
      ctrl.signal,
      token || undefined,
    )
      .then((data) => setResult(data))
      .catch((err) => {
        if (err.name === "AbortError") return;
        setError(err.message);
        setResult(null);
      });
  }, [endpoint, index, token, docId, newController]);

  return (
    <div className="not-content mt-8">
      <ApiConfig {...configProps} />
      <div className="mb-4 flex gap-2">
        <input
          type="text"
          value={docId}
          onChange={(e) => setDocId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && fetchDocument()}
          placeholder="Document ID (objectID)..."
          className={`flex-1 ${INPUT_CLASS}`}
        />
        <button
          type="button"
          onClick={fetchDocument}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          Fetch
        </button>
      </div>
      <ErrorAlert error={error} />
      {result && <JsonPreview data={result} />}
    </div>
  );
}
