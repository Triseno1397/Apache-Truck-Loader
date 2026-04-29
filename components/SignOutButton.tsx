import { LogOut } from "lucide-react";
import { signOutAction } from "@/app/(auth)/login/actions";

export default function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        title="Sign out"
        className="text-[#9ca3af] hover:text-[#272727] transition-colors duration-150 p-2 -m-2 active:translate-y-[0.5px]"
      >
        <LogOut size={14} />
      </button>
    </form>
  );
}
