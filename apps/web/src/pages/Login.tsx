import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

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
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="wordmark">EduBot</div>
        <p className="context">Platform administration. Authorized users only.</p>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          {serverError && (
            <div className="banner-error" role="alert">
              {serverError}
            </div>
          )}
          {notice && <p className="help" role="status" style={{ marginBottom: 12 }}>{notice}</p>}

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className="input"
              autoComplete="email"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "email-error" : undefined}
              {...register("email")}
            />
            {errors.email && (
              <span className="error" id="email-error">{errors.email.message}</span>
            )}
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="input"
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "password-error" : undefined}
              {...register("password")}
              onKeyUp={(e) => {
                const caps = e.getModifierState?.("CapsLock");
                setNotice(caps ? "Caps Lock is on." : null);
              }}
            />
            {errors.password && (
              <span className="error" id="password-error">{errors.password.message}</span>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%" }}
            disabled={isSubmitting}
          >
            {isSubmitting && <span className="btn-spinner" aria-hidden="true" />}
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="login-links">
          <Link to="/">← Back to overview</Link>
        </div>

        <p className="legal">
          Sign-in attempts are recorded in the platform audit log.
        </p>
      </div>
    </div>
  );
}
