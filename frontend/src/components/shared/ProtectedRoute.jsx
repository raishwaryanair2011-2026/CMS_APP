import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import LoadingSpinner from './LoadingSpinner';

// Must match ROLE_PRIORITY in Authentication/serializers.py
const ROLE_HOME = {
  Admin:        '/admin',
  Doctor:       '/doctor',
  Receptionist: '/reception',
  Pharmacist:   '/pharmacy',
};

/**
 * Wraps a route and ensures the current user has one of the allowedRoles.
 *
 * - While auth is loading → show spinner (prevents flicker/wrong redirect)
 * - Not logged in         → redirect to home (/)
 * - Wrong role            → redirect to the user's correct dashboard
 * - Correct role          → render children
 */
export function ProtectedRoute({ children, allowedRoles = [] }) {
  const { user, loading } = useAuth();

  // Wait for auth state to resolve before making any routing decision.
  // This is the key fix — without this guard, the component renders
  // before the user object is populated and picks the wrong route.
  if (loading) return <LoadingSpinner fullscreen />;

  // Not authenticated — go to home
  if (!user) return <Navigate to="/" replace />;

  const userRole = user.role;

  // Role is allowed — render the page
  if (allowedRoles.includes(userRole)) return children;

  // Role is not allowed for this route — redirect to the user's own dashboard
  const home = ROLE_HOME[userRole] || '/';
  return <Navigate to={home} replace />;
}