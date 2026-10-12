import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { isOfflineReadablePath } from "@/lib/offline";
import { HOME_FOR_TYPE, isUserType } from "@/lib/roleRoutes";
import type { UserType } from "@/lib/types";
import { Button, EmptyState } from "./ui";

/** Gate for every signed-in route: waits for the session probe, then requires a session. */
export function RequireAuth() {
  const { me, offline, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="page-loading">
        <div className="skeleton" />
      </div>
    );
  }
  if (!me) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  // Opened without a connection: only the student's saved lessons are on this device.
  if (offline && !isOfflineReadablePath(location.pathname)) return <Navigate to="/s/offline" replace />;
  return <Outlet />;
}

/** Allow-list a route group to one account type; everyone else goes to their own home. */
export function RequireUserType({ type }: { type: UserType }) {
  const { me } = useAuth();
  if (!me) return null;
  if (me.admin.type === type) return <Outlet />;
  return isUserType(me.admin.type) ? (
    <Navigate to={HOME_FOR_TYPE[me.admin.type]} replace />
  ) : (
    <UnsupportedAccount />
  );
}

/** `/home`: where sign-in lands when there is no deep link to return to. */
export function HomeRedirect() {
  const { me } = useAuth();
  if (!me) return null;
  return isUserType(me.admin.type) ? <Navigate to={HOME_FOR_TYPE[me.admin.type]} replace /> : <UnsupportedAccount />;
}

function UnsupportedAccount() {
  const { signOut } = useAuth();
  return (
    <div className="page-loading">
      <EmptyState
        title="This account type isn't supported"
        body="EduBot has no workspace for this account yet. Sign out and contact your administrator."
        action={<Button variant="secondary" size="sm" onClick={() => void signOut()}>Sign out</Button>}
      />
    </div>
  );
}
