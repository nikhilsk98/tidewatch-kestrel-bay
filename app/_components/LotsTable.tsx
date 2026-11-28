import { formatDate, formatQty, locationName } from "@/lib/format";
import type { ItemDetail } from "@/lib/itemDetail";

export function LotsTable({ lots, uom }: { lots: ItemDetail["lots"]; uom: string }) {
  if (lots.length === 0) return <p className="text-sm text-ink-muted">No lots on hand.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm tabular-nums">
        <thead>
          <tr className="text-left text-xs text-ink-muted">
            <th scope="col" className="py-1.5 pr-3 font-medium">Location</th>
            <th scope="col" className="py-1.5 pr-3 text-right font-medium">Quantity</th>
            <th scope="col" className="py-1.5 pr-3 font-medium">Expiry</th>
            <th scope="col" className="py-1.5 pr-3 font-medium">Last sellable day</th>
            <th scope="col" className="py-1.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {lots.map((lot) => (
            <tr key={lot.lotNo} className="border-t border-line align-top">
              <td className="py-1.5 pr-3">
                {locationName(lot.location)}
                <span className="block text-xs text-ink-muted">lot {lot.lotNo}</span>
              </td>
              <td className="py-1.5 pr-3 text-right whitespace-nowrap">{formatQty(lot.qty, uom)}</td>
              <td className="py-1.5 pr-3 whitespace-nowrap">
                {lot.expiryDate ? formatDate(lot.expiryDate, "medium") : "Unknown"}
              </td>
              <td className="py-1.5 pr-3 whitespace-nowrap">
                {lot.sellableUntil ? formatDate(lot.sellableUntil, "medium") : "None"}
              </td>
              <td className="py-1.5">
                {lot.isSellable ? "Sellable" : <span className="text-ink-muted">{lot.unavailableReason}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
