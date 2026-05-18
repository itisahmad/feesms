'use client';

import { useAuth } from '@/contexts/AuthContext';
import {
  canAccessModule,
  canViewModule,
  type PermissionKey,
} from '@/lib/staff-modules';

export function usePermissions() {
  const { user } = useAuth();
  const isOwner = user?.role === 'owner' || user?.is_owner === true;
  const modulePermissions = user?.module_permissions;
  const allowedModules = user?.allowed_modules ?? [];

  const can = (moduleKey: string, permission: PermissionKey) =>
    canAccessModule(moduleKey, permission, { isOwner, modulePermissions });

  const canView = (moduleKey: string) =>
    canViewModule(moduleKey, { isOwner, allowedModules, modulePermissions });

  return {
    isOwner,
    allowedModules,
    modulePermissions,
    can,
    canView,
    canCreate: (moduleKey: string) => can(moduleKey, 'create'),
    canEdit: (moduleKey: string) => can(moduleKey, 'edit'),
    canDelete: (moduleKey: string) => can(moduleKey, 'delete'),
    canAct: (moduleKey: string) => can(moduleKey, 'actions'),
  };
}
