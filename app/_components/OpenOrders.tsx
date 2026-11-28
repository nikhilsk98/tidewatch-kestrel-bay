import { formatDate, formatQty } from "@/lib/format";
import type { ItemDetail } from "@/lib/itemDetail";

export function OpenOrders({ orders, uom }: { orders: ItemDetail["openOrders"]; uom: string }) {
  if (orders.length === 0) return <p className="text-sm text-ink-muted">No open customer orders.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm tabular-nums">
        <thead>
          <tr className="text-left text-xs text-ink-muted">
            <th scope="col" className="py-1.5 pr-3 font-medium">Order</th>
            <th scope="col" className="py-1.5 pr-3 font-medium">Customer</th>
            <th scope="col" className="py-1.5 pr-3 font-medium">Ships</th>
            <th scope="col" className="py-1.5 text-right font-medium">Quantity</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={`${o.orderNo}-${o.lineNo}`} className="border-t border-line">
              <td className="py-1.5 pr-3">
                {o.orderNo} / {o.lineNo}
              </td>
              <td className="py-1.5 pr-3">{o.customerCode ?? "Unknown"}</td>
              <td className="py-1.5 pr-3 whitespace-nowrap">{formatDate(o.shipDate, "weekday")}</td>
              <td className="py-1.5 text-right whitespace-nowrap">{formatQty(o.qty, uom)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
