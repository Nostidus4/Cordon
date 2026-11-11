// Loading state for the canvas: ghost boxes where the treasury, vault and districts will appear.
import { Skeleton } from "../ui";

export function GraphSkeleton() {
  return (
    <div role="status" aria-label="Đang tải bản đồ quyền" className="absolute inset-0 flex flex-col items-center gap-10 px-10 pt-8">
      <Skeleton className="h-[76px] w-[264px] rounded-2xl" />
      <div className="flex gap-16"><Skeleton className="h-[76px] w-[264px] rounded-2xl" /><Skeleton className="h-[76px] w-[224px] rounded-2xl" /></div>
      <div className="flex w-full justify-center gap-5">
        {[188, 188, 188, 188, 188, 258, 188].map((h, i) => <div key={i} className="glass rounded-[18px] p-3" style={{ height: h, width: 196 }}><Skeleton className="mb-2 h-4 w-2/3" /><Skeleton className="mb-3 h-3 w-full" /><Skeleton className="h-12 w-full rounded-xl" /></div>)}
      </div>
    </div>
  );
}
