import { LogOut } from "lucide-react";
import { signOutAction } from "@/app/(auth)/login/actions";

export default function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        title="Sign out"
        className="text-[#4a5058] hover:text-[#e8eaed] transition p-2 -m-2"
      >
        <LogOut size={14} />
      </button>
    </form>
  );
}
