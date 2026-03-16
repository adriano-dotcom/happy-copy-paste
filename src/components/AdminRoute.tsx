import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useUserRole } from "@/hooks/useUserRole";
import { Loader2 } from "lucide-react";

interface AdminRouteProps {
  children: ReactNode;
  /** If true, only admin can access. If false (default), admin or gerente can access. */
  adminOnly?: boolean;
}

export function AdminRoute({ children, adminOnly = false }: AdminRouteProps) {
  const { isAdmin, isAdminOrManager, loading } = useUserRole();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  const hasAccess = adminOnly ? isAdmin : isAdminOrManager;

  if (!hasAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
