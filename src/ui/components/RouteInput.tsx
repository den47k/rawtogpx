import { useId } from 'react';
import { formatDistance } from '../../core/format.ts';
import type { PreparedRoute } from '../../core/types.ts';
import { Card } from './Card.tsx';

export interface LoadedRoute {
  fileName: string;
  route: PreparedRoute;
}

interface RouteInputProps {
  loaded: LoadedRoute | null;
  error: string | null;
  onFile: (file: File) => void;
}

// Android often reports GPX files as octet-stream.
const ACCEPT = '.gpx,application/gpx+xml,application/octet-stream,text/xml';

export function RouteInput({ loaded, error, onFile }: RouteInputProps) {
  const inputId = useId();
  const errorId = useId();

  return (
    <Card title="1 · Route">
      <input
        id={inputId}
        type="file"
        accept={ACCEPT}
        className="peer sr-only"
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = '';
        }}
      />
      <label
        htmlFor={inputId}
        className="flex min-h-14 cursor-pointer items-center justify-center gap-3 rounded-lg border-2 border-dashed border-slate-300 px-4 py-2 text-sm text-slate-600 transition peer-focus-visible:ring-2 peer-focus-visible:ring-orange-500 hover:border-orange-400 hover:bg-orange-50/50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-orange-950/20"
      >
        {loaded ? (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-slate-900 dark:text-slate-100">
                {loaded.fileName}
              </span>
              <span className="block">
                {formatDistance(loaded.route.lengthM, 3)} · {loaded.route.points.length} points
                {loaded.route.hasElevation ? '' : ' · no elevation'}
              </span>
            </span>
            <span className="shrink-0 text-orange-600 underline dark:text-orange-400">Replace</span>
          </>
        ) : (
          <span className="text-center">
            <span className="font-medium text-slate-900 dark:text-slate-100">Drop a route GPX</span>{' '}
            anywhere, or{' '}
            <span className="text-orange-600 underline dark:text-orange-400">choose a file</span>
          </span>
        )}
      </label>
      {error && (
        <p id={errorId} role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </Card>
  );
}
