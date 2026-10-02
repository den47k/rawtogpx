import { splitPaces } from '../../core/segments.ts';
import { formatDiff } from '../lib/checkRows.ts';
import type { Rebuilder } from '../useRebuilder.ts';

/** Self-check table: the generated file read back and compared with each split. */
export function SplitCheckTable({ r, compact = false }: { r: Rebuilder; compact?: boolean }) {
  if (r.rows.length === 0) {
    return (
      <div className="px-4 py-5 text-xs text-faint">
        {r.errors.length > 0
          ? 'Fix the split errors to check the file.'
          : 'Rows appear once there is a route and splits.'}
      </div>
    );
  }
  const paces = splitPaces(r.parsed.splits);
  const cell = 'px-1 py-2 first:pl-4 last:pr-4';
  return (
    <table className="w-full table-fixed border-collapse">
      <colgroup>
        {!compact && <col className="w-10" />}
        <col className={compact ? 'w-[86px]' : 'w-[96px]'} />
        <col />
        <col />
        <col />
        <col />
      </colgroup>
      <thead className={compact ? 'bg-surface' : 'sticky top-[45px] z-[1] bg-surface'}>
        <tr className="border-b border-line3 text-left text-[11px] font-normal text-muted2">
          {!compact && <th className={`${cell} font-normal`}>#</th>}
          <th className={`${cell} font-normal`}>Type</th>
          <th className={`${cell} font-normal`}>Distance</th>
          <th className={`${cell} font-normal`}>Your time</th>
          <th className={`${cell} font-normal`}>File time</th>
          <th className={`${cell} text-right font-normal`}>Diff</th>
        </tr>
      </thead>
      <tbody>
        {r.rows.map((row) => {
          const pace = paces[row.index]!;
          const dot =
            row.type === 'Rest' || !r.scale || !Number.isFinite(pace)
              ? 'var(--border2)'
              : r.scale.color(pace);
          const zero = row.diffS !== null && Math.round(row.diffS * 10) === 0;
          const hot = r.hoveredSplit === row.index;
          return (
            <tr
              key={row.index}
              onMouseEnter={() => r.setHoveredSplit(row.index)}
              onMouseLeave={() => r.setHoveredSplit(null)}
              onClick={() => r.setHoveredSplit(hot ? null : row.index)}
              className={`cursor-default border-b border-line3 font-mono text-xs ${hot ? 'bg-chip' : row.flagged ? 'bg-bad-bg' : 'bg-surface'}`}
            >
              {!compact && <td className={`${cell} text-faint`}>{row.n}</td>}
              <td className={`${cell} font-sans`}>
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ background: dot }}
                  />
                  <span className="truncate">
                    {row.type}
                    {compact && row.n !== '–' ? ` ${row.n}` : ''}
                  </span>
                </span>
              </td>
              <td className={`${cell} truncate`}>{row.dist}</td>
              <td className={`${cell} truncate`}>{row.mine}</td>
              <td className={`${cell} truncate`}>{row.file}</td>
              <td
                className={`${cell} truncate text-right ${row.flagged ? 'font-medium text-bad' : zero ? 'text-faint' : 'text-ink'}`}
              >
                {formatDiff(row.diffS)}
                {row.flagged && <span className="sr-only"> (more than 1 second off)</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
