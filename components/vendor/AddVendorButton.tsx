"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { createVendorAction } from "@/app/(app)/jobs/[id]/actions";

// Why this is a client component instead of <form action={createVendorAction}>:
// the old form-action ended in redirect() which caused Next.js to fully
// navigate to the new URL. That navigation scrolled the page back to
// the top every time the user added a vendor. Doing the call here lets
// us swap the redirect for router.replace + router.refresh, which keeps
// the user's scroll position intact.

type Props = {
  jobId: string;
  jobTruckId: string;
};

export default function AddVendorButton({ jobId, jobTruckId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startCreate] = useTransition();

  function handleClick() {
    startCreate(async () => {
      const result = await createVendorAction({ jobId, jobTruckId });
      if (!result.ok) {
        alert(`Couldn't add vendor: ${result.error}`);
        return;
      }
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("truck", jobTruckId);
      sp.set("edit", result.vendorId);
      router.replace(`/jobs/${jobId}?${sp.toString()}`, { scroll: false });
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="flex items-center gap-1.5 text-xs sm:text-sm bg-[#0e3e7a] text-white font-semibold px-3 py-2 rounded hover:bg-[#02aed6] transition-colors duration-150 min-h-[40px] active:translate-y-[0.5px] disabled:opacity-50 disabled:cursor-wait"
    >
      {pending ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <Plus size={14} />
      )}
      Add vendor
    </button>
  );
}
