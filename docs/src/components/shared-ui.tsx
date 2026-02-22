import type { SearchHit } from "./shared";
import { hitDisplayText, stripHtml } from "./shared";

export function ErrorAlert({
  error,
  className = "mb-4",
}: {
  error: string;
  className?: string;
}) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className={`${className} rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300`}
    >
      {error}
    </p>
  );
}

export function HitListItem({ hit }: { hit: SearchHit }) {
  return (
    <li className="rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-700">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium text-gray-900 dark:text-gray-100">
          {stripHtml(hitDisplayText(hit))}
        </span>
        <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
          {hit._score?.toFixed(1) ?? "\u2014"}
        </span>
      </div>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        {hit.objectID}
      </p>
    </li>
  );
}

export function JsonPreview({ data }: { data: unknown }) {
  return (
    <pre className="max-h-96 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
