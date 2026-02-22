import { useCallback, useState } from "react";
import { ApiConfig } from "./ApiConfig";
import { BUTTON_CLASS, useAbortRef, useApiConfig } from "./shared";
import { ErrorAlert, JsonPreview } from "./shared-ui";

const DEFAULT_QUERY = JSON.stringify(
  { query: { match_all: {} }, size: 3 },
  null,
  2,
);

export default function RawQueryDemo() {
  const { endpoint, index, token, configProps } = useApiConfig();
  const [body, setBody] = useState(DEFAULT_QUERY);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const newController = useAbortRef();

  const executeQuery = useCallback(() => {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(body);
    } catch {
      setError("Invalid JSON");
      return;
    }
    const ctrl = newController();
    setError("");

    const url = `${endpoint}/${index}/query`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(parsed),
      signal: ctrl.signal,
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `${res.status}`);
        setResult(data);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setError(err.message);
        setResult(null);
      });
  }, [endpoint, index, token, body, newController]);

  return (
    <div className="not-content mt-8">
      <ApiConfig {...configProps} />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={8}
        spellCheck={false}
        className="mb-3 w-full rounded-lg border border-gray-300 bg-white px-4 py-3 font-mono text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
      />
      <button
        type="button"
        onClick={executeQuery}
        className={`mb-4 ${BUTTON_CLASS}`}
      >
        Execute
      </button>
      <ErrorAlert error={error} />
      {result && <JsonPreview data={result} />}
    </div>
  );
}
