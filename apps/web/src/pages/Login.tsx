import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Alert, Button, Field } from "@/components/ui";
import "@/styles/pages/auth.css";

const schema = z.object({
  email: z.string().min(1, "Enter your email.").email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

type FormValues = z.infer<typeof schema>;

export function Login() {
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const { refresh } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), mode: "onBlur" });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    setNotice(null);
    try {
      await api("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: values.email.trim(), password: values.password }),
      });
      await refresh();
      navigate(location.state?.from ?? "/dashboard", { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === "ACCOUNT_DISABLED") {
          setServerError(error.message);
        } else if (error.code === "RATE_LIMITED") {
          setServerError("Too many attempts. Try again in a few minutes.");
        } else if (error.code === "UNAUTHENTICATED") {
          setServerError(error.message); // non-committal by design
        } else {
          setServerError(error.message);
        }
      } else {
        setServerError("Couldn't reach the server. Check your connection and try again.");
      }
      // Keep the email, clear the password, and put the caret back for the retry.
      setValue("password", "");
      setFocus("password");
    }
  }

  return (
    <div className="page-login">
      <main className="login-stack">
        <div className="login-brand">
          <span className="login-mark" aria-hidden="true">E</span>
          <span className="login-word">EduBot</span>
          <span className="login-subline">Platform administration console</span>
        </div>

        <div className="login-card">
          <h1 className="login-title">Sign in</h1>
          {serverError && <Alert tone="danger">{serverError}</Alert>}
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <Field label="Email" htmlFor="email" error={errors.email?.message}>
              <input
                id="email"
                type="email"
                className="input"
                autoComplete="username"
                aria-invalid={!!errors.email}
                {...register("email")}
              />
            </Field>

            <Field label="Password" htmlFor="password" error={errors.password?.message}>
              <input
                id="password"
                type="password"
                className="input"
                autoComplete="current-password"
                aria-invalid={!!errors.password}
                {...register("password")}
                onKeyUp={(e) => {
                  const caps = e.getModifierState?.("CapsLock");
                  setNotice(caps ? "Caps Lock is on." : null);
                }}
              />
            </Field>

            {notice && <p className="login-notice" role="status">{notice}</p>}

            <Button type="submit" className="w-full" loading={isSubmitting}>
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>

        <div className="login-below">
          <Link to="/">Back to home</Link>
          <span className="login-sep" aria-hidden="true">·</span>
          <span>Need help? Contact support</span>
        </div>
        <p className="login-dataset">Deterministic demo dataset · 18 institutions · 3,308 people</p>
      </main>
    </div>
  );
}
