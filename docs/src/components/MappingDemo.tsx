import { useCallback, useState } from "react";
import { ApiConfig } from "./ApiConfig";
import { BUTTON_CLASS, searchApi, useAbortRef, useApiConfig } from "./shared";
import { ErrorAlert, JsonPreview } from "./shared-ui";

export default function MappingDemo() {
  const { endpoint, index, token, configProps } = useApiConfig();
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const newController = useAbortRef();

  const fetchMapping = useCallback(() => {
    const ctrl = newController();
    setError("");
    searchApi<Record<string, unknown>>(
      endpoint,
      index,
      "mapping",
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
  }, [endpoint, index, token, newController]);

  return (
    <div className="not-content mt-8">
      <ApiConfig {...configProps} />
      <button
        type="button"
        onClick={fetchMapping}
        className={`mb-4 ${BUTTON_CLASS}`}
      >
        Fetch mapping
      </button>
      <ErrorAlert error={error} />
      {result && <JsonPreview data={result} />}
    </div>
  );
}
