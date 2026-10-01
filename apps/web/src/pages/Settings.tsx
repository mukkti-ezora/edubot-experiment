import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { api, ApiError } from "@/lib/api";
import type { PlatformSettings } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { Alert, Button, ErrorState, Field, PageHead, SkeletonRows } from "@/components/ui";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth";
import "@/styles/pages/system.css";

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
    setError,
    formState: { errors, isSubmitting, isDirty },
    reset,
  } = useForm<Values>({
    resolver: zodResolver(schema),
    values: data
      ? {
          platformName: data.platformName,
          supportEmail: data.supportEmail ?? "",
          signInNotice: data.signInNotice ?? "",
        }
      : undefined,
  });

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
      reset({
        platformName: fresh.platformName,
        supportEmail: fresh.supportEmail ?? "",
        signInNotice: fresh.signInNotice ?? "",
      });
    },
    onError: (e) => {
      if (e instanceof ApiError) {
        // Server-side validation errors land on their fields; anything else becomes a banner.
        const fields = e.fields ?? {};
        let mapped = false;
        for (const key of ["platformName", "supportEmail", "signInNotice"] as const) {
          if (fields[key]) {
            setError(key, { type: "server", message: fields[key] });
            mapped = true;
          }
        }
        if (mapped) {
          setServerError(null);
          return;
        }
        setServerError(e.message);
      } else {
        setServerError("Couldn't save. Try again.");
      }
    },
  });

  const readOnly = data ? !can("settings.update") : false;

  return (
    <div className="page-settings">
      <PageHead title="Settings" sub="Platform-wide configuration" />

      {isError ? (
        <ErrorState title="Settings couldn't load" onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <div className="card">
          <SkeletonRows rows={5} />
        </div>
      ) : (
        <div className="grid-2">
          <section className="card">
            <div className="card-head">
              <h2>Platform</h2>
              {readOnly && <span className="meta right">Read-only for your role</span>}
            </div>
            <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
              <div className="card-body">
                {serverError && (
                  <div className="settings-alert">
                    <Alert tone="danger" title="Couldn't save settings">
                      {serverError}
                    </Alert>
                  </div>
                )}
                <Field label="Platform name" htmlFor="s-name" error={errors.platformName?.message}>
                  <input
                    id="s-name"
                    className="input"
                    aria-invalid={!!errors.platformName}
                    disabled={readOnly}
                    {...register("platformName")}
                  />
                </Field>
                <Field label="Support email" htmlFor="s-email" error={errors.supportEmail?.message}>
                  <input
                    id="s-email"
                    className="input"
                    type="email"
                    aria-invalid={!!errors.supportEmail}
                    disabled={readOnly}
                    {...register("supportEmail")}
                  />
                </Field>
                <Field
                  label="Sign-in notice"
                  htmlFor="s-notice"
                  help="Shown on the sign-in screen."
                  error={errors.signInNotice?.message}
                >
                  <textarea
                    id="s-notice"
                    className="input"
                    rows={3}
                    aria-invalid={!!errors.signInNotice}
                    disabled={readOnly}
                    {...register("signInNotice")}
                  />
                </Field>
              </div>
              <div className="card-foot">
                <span className="meta">
                  {data.updatedAt
                    ? `Last updated ${formatDateTime(data.updatedAt)}${data.updatedBy ? ` by ${data.updatedBy}` : ""}`
                    : ""}
                </span>
                {!readOnly && (
                  <Button
                    type="submit"
                    loading={save.isPending || isSubmitting}
                    disabled={!isDirty}
                  >
                    Save changes
                  </Button>
                )}
              </div>
            </form>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Current policy</h2>
              <span className="meta right">Read-only</span>
            </div>
            <div className="card-body">
              <dl className="kv">
                <dt>Access tokens</dt>
                <dd>15 minutes, httpOnly cookies</dd>
                <dt>Session refresh</dt>
                <dd>30 days, rotating</dd>
                <dt>Login attempts</dt>
                <dd>10 per 15 minutes, then a cooldown</dd>
                <dt>Password storage</dt>
                <dd>Argon2id; never stored in plain text</dd>
                <dt>Audit retention</dt>
                <dd>Append-only; no delete path exists</dd>
              </dl>
              <p className="meta policy-note">
                MFA, SSO, and institution identity providers are on the roadmap (future scope).
              </p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
