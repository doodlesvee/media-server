import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  SettingsFeedback,
  SettingsSection,
  settingsInputClass,
} from "@/components/SettingsSection";
import { changePassword, fetchAuthStatus, updateUsername } from "@/lib/authApi";

const MIN_PASSWORD_LENGTH = 8;

function UsernameSection() {
  const queryClient = useQueryClient();
  const { data: auth } = useQuery({ queryKey: ["auth-status"], queryFn: fetchAuthStatus });
  const [username, setUsername] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => setUsername(auth?.user?.username ?? ""), [auth?.user?.username]);

  const save = useMutation({
    mutationFn: () => updateUsername(username.trim()),
    onSuccess: () => {
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ["auth-status"] });
    },
  });

  const dirty = username.trim() !== (auth?.user?.username ?? "") && username.trim().length > 0;

  return (
    <SettingsSection title="Name" description="The name you sign in with.">
      <input
        value={username}
        onChange={(e) => {
          setUsername(e.target.value);
          setSaved(false);
        }}
        placeholder="Username"
        autoComplete="username"
        className={settingsInputClass}
      />
      <SettingsFeedback
        error={save.error instanceof Error ? save.error.message : null}
        saved={saved && !dirty}
      />
      <button
        type="button"
        onClick={() => save.mutate()}
        disabled={!dirty || save.isPending}
        className="flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-black transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
      >
        {save.isPending && <Loader2 className="size-4 animate-spin" />}
        Save name
      </button>
    </SettingsSection>
  );
}

function PasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: () => changePassword(current, next),
    onSuccess: () => {
      setSaved(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    },
  });

  function submit() {
    setLocalError(null);
    setSaved(false);
    if (next.length < MIN_PASSWORD_LENGTH) {
      setLocalError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (next !== confirm) {
      setLocalError("New passwords don’t match");
      return;
    }
    save.mutate();
  }

  const error = localError ?? (save.error instanceof Error ? save.error.message : null);

  return (
    <SettingsSection
      title="Password"
      description="Changing this signs out every other device. This one stays signed in."
    >
      <div className="space-y-3">
        <input
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          type="password"
          placeholder="Current password"
          autoComplete="current-password"
          className={settingsInputClass}
        />
        <input
          value={next}
          onChange={(e) => setNext(e.target.value)}
          type="password"
          placeholder="New password"
          autoComplete="new-password"
          className={settingsInputClass}
        />
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          type="password"
          placeholder="Confirm new password"
          autoComplete="new-password"
          className={settingsInputClass}
        />
      </div>
      <SettingsFeedback error={error} saved={saved} />
      <button
        type="button"
        onClick={submit}
        disabled={!current || !next || save.isPending}
        className="flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-black transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
      >
        {save.isPending && <Loader2 className="size-4 animate-spin" />}
        Change password
      </button>
    </SettingsSection>
  );
}

export function AccountPage() {
  return (
    <AppShell title="Account" subtitle="Your sign-in details.">
      <div className="space-y-5 px-6 py-8">
        <UsernameSection />
        <PasswordSection />
      </div>
    </AppShell>
  );
}
