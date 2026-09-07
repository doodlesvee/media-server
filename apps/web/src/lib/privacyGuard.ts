import { useQuery } from "@tanstack/react-query";
import { fetchPrivacyStatus } from "./privacyApi";
import { fetchPasskeys } from "./webauthnApi";

/**
 * Whether leaving discreet mode has to be proved, and with what.
 *
 * Either credential guards it. Registering Touch ID without ever setting a
 * password used to leave the mode switching off freely — the check asked only
 * about the password, so the passkey sat there doing nothing.
 */
export function usePrivacyGuard(): {
  hasPassword: boolean;
  hasPasskey: boolean;
  guarded: boolean;
} {
  const { data: privacy } = useQuery({ queryKey: ["privacy"], queryFn: fetchPrivacyStatus });
  const { data: passkeys } = useQuery({ queryKey: ["passkeys"], queryFn: fetchPasskeys });

  const hasPassword = privacy?.hasPassword ?? false;
  const hasPasskey = (passkeys?.length ?? 0) > 0;
  return { hasPassword, hasPasskey, guarded: hasPassword || hasPasskey };
}
