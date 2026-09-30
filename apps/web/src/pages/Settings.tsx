import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { api, ApiError } from "@/lib/api";
import type { PlatformSettings } from "@/lib/types";
import { ErrorState, SkeletonRows } from "@/components/ui";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth";

const schema = z.object({
  platformName: z.string().min(2, "At least 2 characters."),
  supportEmail: z.union([z.literal(""), z.string().email("Enter a valid email.")]),
  signInNotice: z.string().max(400, "Keep it under 400 characters.").optional(),
});
type Values = z.infer<typeof schema>;

export function SettingsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<PlatformSettings>("/api/v1/settings/platform"),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
    reset,
  } = useForm<Values>({ resolver: zodResolver(schema), values: data ? {
    platformName: data.platformName,
    supportEmail: data.supportEmail ?? "",
    signInNotice: data.signInNotice ?? "",
  } : undefined });

  const save = useMutation({
    mutationFn: async (values: Values) =>
      api<PlatformSettings>("/api/v1/settings/platform", {
        method: "PUT",
        body: JSON.stringify({
          platformName: values.platformName,
          supportEmail: values.supportEmail || null,
          signInNotice: values.signInNotice || null,
        }),
      }),
    onSuccess: (fresh) => {
      toast.notify("Settings saved.");
      setServerError(null);
      queryClient.setQueryData(["settings"], fresh);
      reset({ platformName: fresh.platformName, supportEmail: fresh.supportEmail ?? "", signInNotice: fresh.signInNotice ?? "" });
    },
    onError: (e) => setServerError(e instanceof ApiError ? e.message : "Couldn't save. Try again."),
  });

  if (isError) return <ErrorState title="Settings couldn't load" onRetry={() => refetch()} />;
  if (isLoading || !data) return <div className="card"><SkeletonRows rows={5} /></div>;

  const readOnly = !can("settings.update");

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="sub">Platform-wide configuration. Changes are recorded in the audit log.</p>
        </div>
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h2>Platform</h2>{readOnly && <span className="meta">Read-only for your role</span>}</div>
          <div className="card-body">
            {serverError && <div className="banner-error" role="alert">{serverError}</div>}
            <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
              <div className="field">
                <label htmlFor="s-name">Platform name</label>
                <input id="s-name" className="input" aria-invalid={!!errors.platformName} disabled={readOnly} {...register("platformName")} />
                {errors.platformName && <span className="error">{errors.platformName.message}</span>}
              </div>
              <div className="field">
                <label htmlFor="s-email">Support email</label>
                <input id="s-email" className="input" aria-invalid={!!errors.supportEmail} disabled={readOnly} {...register("supportEmail")} />
                {errors.supportEmail && <span className="error">{errors.supportEmail.message}</span>}
              </div>
              <div className="field">
                <label htmlFor="s-notice">Sign-in notice</label>
                <textarea id="s-notice" className="input" rows={3} disabled={readOnly} {...register("signInNotice")} />
                <span className="help">Shown on the admin sign-in page. Keep it plain.</span>
                {errors.signInNotice && <span className="error">{errors.signInNotice.message}</span>}
              </div>
              {!readOnly && (
                <button type="submit" className="btn btn-primary" disabled={!isDirty || save.isPending || isSubmitting}>
                  {(save.isPending || isSubmitting) && <span className="btn-spinner" aria-hidden="true" />}
                  Save changes
                </button>
              )}
            </form>
          </div>
        </section>

        <section className="card">
          <div className="card-head"><h2>Current policy</h2><span className="meta">read-only</span></div>
          <div className="card-body">
            <dl className="kv">
              <dt>Access tokens</dt><dd>15 minutes, httpOnly cookies</dd>
              <dt>Session refresh</dt><dd>30 days, rotating</dd>
              <dt>Login attempts</dt><dd>10 per 15 minutes, then a cooldown</dd>
              <dt>Password storage</dt><dd>Argon2id; never stored in plain text</dd>
              <dt>Audit retention</dt><dd>Append-only; no delete path exists</dd>
            </dl>
            <p className="meta" style={{ marginTop: 14 }}>
              MFA, SSO, and institution identity providers are on the roadmap (future scope).
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
