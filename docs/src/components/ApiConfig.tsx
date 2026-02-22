import { useState } from "react";

interface ApiConfigProps {
  endpoint: string;
  index: string;
  token: string;
  onEndpointChange: (v: string) => void;
  onIndexChange: (v: string) => void;
  onTokenChange: (v: string) => void;
}

export function ApiConfig({
  endpoint,
  index,
  token,
  onEndpointChange,
  onIndexChange,
  onTokenChange,
}: ApiConfigProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="not-content mb-4 rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        <span>
          API: {endpoint}/{index}
        </span>
        <span className="text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="flex flex-wrap gap-3 border-t border-gray-200 px-4 py-3 dark:border-gray-700">
          <label className="flex flex-1 flex-col gap-1 text-xs text-gray-600 dark:text-gray-400">
            Endpoint
            <input
              type="text"
              value={endpoint}
              onChange={(e) => onEndpointChange(e.target.value)}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
          </label>
          <label className="flex min-w-32 flex-col gap-1 text-xs text-gray-600 dark:text-gray-400">
            Index handle
            <input
              type="text"
              value={index}
              onChange={(e) => onIndexChange(e.target.value)}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
          </label>
          <label className="flex min-w-32 flex-col gap-1 text-xs text-gray-600 dark:text-gray-400">
            Bearer token
            <input
              type="text"
              value={token}
              onChange={(e) => onTokenChange(e.target.value)}
              placeholder="optional"
              className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
          </label>
        </div>
      )}
    </div>
  );
}
