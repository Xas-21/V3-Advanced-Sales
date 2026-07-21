/**
 * Role-based permissions for Advanced Sales.
 * Users may override role defaults via permissionGrants / permissionRevokes (string[]).
 */

export const USER_ROLE_OPTIONS = [
    'Admin',
    'General Manager',
    'Head of Sales',
    /** Same defaults as Head of Sales (full operational + reports; not Admin / settings tools). */
    'Director of Revenue',
    'Sales Manager',
    'Sales Executive',
    'Sales Coordinator',
    'Reservations Team',
] as const;

export type UserRoleId = (typeof USER_ROLE_OPTIONS)[number];

export const ALL_PERMISSION_IDS = [
    'reports.access',
    /** Row-level preview table in Report Builder (source data one-by-one). */
    'reports.sourceRows',
    /** Per–data-source: select source, filters, columns, export (and preview when sourceRows is on). */
    'reports.dataRequests',
    'reports.dataAccounts',
    'reports.dataMice',
    'reports.dataTasks',
    'reports.dataSalesCalls',
    'accounts.viewOnly',
    /** Merge duplicate account profiles & assign historical account owner (admin tooling). */
    'accounts.mergeAndAssignOwner',
    'tasks.deleteAny',
    'accounts.delete',
    'accounts.deleteBillingDeposits',
    'contracts.delete',
    'contracts.templates.delete',
    'requests.delete',
    'requests.deletePayments',
    /** Add / edit / delete request alerts, OPTS → Alert, and toolbar bell (view pop-ups still show for all). */
    'requests.alerts',
    'crm.deleteCalls',
    'crm.editCalls',
    'accounts.timelineManual',
    'promotions.view',
    'promotions.create',
    'promotions.edit',
    'promotions.delete',
    'promotions.linkRequests',
    'mutate.operational',
    /** Sidebar: show each main app page (Settings / Sign out stay visible for all users). */
    'nav.dashboard',
    'nav.calendar',
    'nav.todo',
    'nav.events',
    'nav.requests',
    'nav.crm',
    'nav.contracts',
    'nav.accounts',
    'nav.promotions',
    'settings.admin',
    'settings.globalStaff',
] as const;

export type PermissionId = (typeof ALL_PERMISSION_IDS)[number];

export const PERMISSION_LABELS: Record<PermissionId, string> = {
    'reports.access': 'Reports: access Report Builder page',
    'reports.sourceRows':
        'Reports: generate preview & view source rows (row-by-row table)',
    'reports.dataRequests': 'Reports: Requests — configure, preview & export',
    'reports.dataAccounts': 'Reports: Accounts — configure, preview & export',
    'reports.dataMice': 'Reports: MICE — configure, preview & export',
    'reports.dataTasks': 'Reports: Tasks — configure, preview & export',
    'reports.dataSalesCalls': 'Reports: Sales Calls — configure, preview & export',
    'accounts.viewOnly': 'Accounts: view only (read-only Accounts page; enables Accounts for Reservations Team)',
    'accounts.mergeAndAssignOwner':
        'Accounts: merge duplicate profiles & set account owner (re-links requests, CRM, contracts)',
    'tasks.deleteAny': 'Delete any task (To-Do)',
    'accounts.delete': 'Delete accounts',
    'accounts.deleteBillingDeposits': 'Accounts: delete free billing deposits',
    'contracts.delete': 'Delete contracts',
    'contracts.templates.delete': 'Delete contract templates (Contracts library)',
    'requests.delete': 'Delete requests',
    'requests.deletePayments': 'Delete request payment / deposit lines',
    'requests.alerts': 'Requests: alerts (add, edit, delete & toolbar)',
    'crm.deleteCalls': 'Delete sales calls (Activities hub & CRM list)',
    'crm.editCalls': 'Edit sales calls (Activities hub & CRM list)',
    'accounts.timelineManual': 'Edit / delete manual timeline activities',
    'promotions.view': 'Promotions: view page and performance list',
    'promotions.create': 'Promotions: create promotions',
    'promotions.edit': 'Promotions: edit promotions (accounts, segments, dates, terms, notes)',
    'promotions.delete': 'Promotions: delete promotions',
    'promotions.linkRequests': 'Requests: select/link a promotion on create/edit request form',
    'mutate.operational': 'Create & edit operational data (not view-only)',
    'nav.dashboard': 'Main menu: Dashboard',
    'nav.calendar': 'Main menu: Calendar',
    'nav.todo': 'Main menu: To Do',
    'nav.events': 'Main menu: Events & Catering',
    'nav.requests': 'Main menu: Requests Management',
    'nav.crm': 'Main menu: CRM',
    'nav.contracts': 'Main menu: Contracts',
    'nav.accounts': 'Main menu: Accounts',
    'nav.promotions': 'Main menu: Promotions',
    'settings.admin': 'Settings: Properties, Configurations, property tools',
    'settings.globalStaff': 'Global Staff Management (all users)',
};

/** Grouped areas in the user create/edit permission UI (Settings → User Mgmt). */
export type UserModalPermissionSection = {
    id: string;
    title: string;
    /** Shown when `permissions` is empty or as extra context above checkboxes. */
    description?: string;
    permissions: readonly PermissionId[];
};

/** Default main-menu visibility for full-access sales / management roles. */
const DEFAULT_NAV_PERMISSIONS: readonly PermissionId[] = [
    'nav.dashboard',
    'nav.calendar',
    'nav.todo',
    'nav.events',
    'nav.requests',
    'nav.crm',
    'nav.contracts',
    'nav.accounts',
    'nav.promotions',
] as const;

export const USER_MODAL_SECTIONS: readonly UserModalPermissionSection[] = [
    {
        id: 'main_menu',
        title: 'Main menu (pages)',
        description:
            'Controls which items appear in the primary sidebar. Grant Reports separately below. Settings and Sign out remain available.',
        permissions: [...DEFAULT_NAV_PERMISSIONS],
    },
    {
        id: 'general',
        title: 'General',
        description: 'Core editing rights across the app.',
        permissions: ['mutate.operational'],
    },
    {
        id: 'accounts',
        title: 'Accounts',
        permissions: [
            'accounts.viewOnly',
            'accounts.mergeAndAssignOwner',
            'accounts.delete',
            'accounts.deleteBillingDeposits',
            'accounts.timelineManual',
        ],
    },
    {
        id: 'promotions',
        title: 'Promotions',
        permissions: [
            'promotions.view',
            'promotions.create',
            'promotions.edit',
            'promotions.delete',
            'promotions.linkRequests',
        ],
    },
    {
        id: 'requests',
        title: 'Requests & payments',
        permissions: ['requests.delete', 'requests.deletePayments', 'requests.alerts'],
    },
    {
        id: 'contracts',
        title: 'Contracts',
        permissions: ['contracts.delete', 'contracts.templates.delete'],
    },
    {
        id: 'crm',
        title: 'CRM & sales calls',
        permissions: ['crm.editCalls', 'crm.deleteCalls'],
    },
    {
        id: 'todo',
        title: 'To-Do',
        permissions: ['tasks.deleteAny'],
    },
    {
        id: 'reports',
        title: 'Reports',
        description:
            'Turn on “Reports: access Report Builder page” so the Reports item appears in the sidebar (or grant any detailed Reports row below — that also enables the menu).',
        permissions: [
            'reports.access',
            'reports.sourceRows',
            'reports.dataRequests',
            'reports.dataAccounts',
            'reports.dataMice',
            'reports.dataTasks',
            'reports.dataSalesCalls',
        ],
    },
    {
        id: 'settings_access',
        title: 'Settings (admin tools)',
        description:
            'Administrators already have full settings access. For other roles, grant these only when this user should manage properties or all staff.',
        permissions: ['settings.admin', 'settings.globalStaff'],
    },
] as const;

/** Every permission shown in the user modal (excludes settings.admin / settings.globalStaff). */
export const USER_MODAL_PERMISSION_IDS: PermissionId[] = USER_MODAL_SECTIONS.flatMap((s) => [
    ...s.permissions,
]);

function permSet(...ids: PermissionId[]): Set<PermissionId> {
    return new Set(ids);
}

/** Granular Reports data-source permissions (for legacy detection). */
export const REPORTS_DATA_SOURCE_PERMISSIONS: PermissionId[] = [
    'reports.dataRequests',
    'reports.dataAccounts',
    'reports.dataMice',
    'reports.dataTasks',
    'reports.dataSalesCalls',
];

/** Head of Sales and Director of Revenue: broad delete/mutate + all nav + full Report Builder (not Admin settings). */
const HEAD_OF_SALES_LIKE_DEFAULTS = permSet(
    'mutate.operational',
    ...DEFAULT_NAV_PERMISSIONS,
    'promotions.view',
    'promotions.create',
    'promotions.edit',
    'promotions.delete',
    'promotions.linkRequests',
    'reports.access',
    'reports.sourceRows',
    ...REPORTS_DATA_SOURCE_PERMISSIONS,
    'tasks.deleteAny',
    'accounts.delete',
    'contracts.delete',
    'requests.delete',
    'requests.deletePayments',
    'requests.alerts',
    'accounts.timelineManual'
);

/** Defaults before grants/revokes. Admin uses a shortcut in getEffectivePermissionSet. */
export const ROLE_DEFAULTS: Record<UserRoleId, Set<PermissionId>> = {
    Admin: permSet(...ALL_PERMISSION_IDS),
    'General Manager': permSet(
        ...DEFAULT_NAV_PERMISSIONS,
        'promotions.view',
        'reports.access',
        'reports.sourceRows',
        ...REPORTS_DATA_SOURCE_PERMISSIONS
    ),
    'Head of Sales': new Set(HEAD_OF_SALES_LIKE_DEFAULTS),
    'Director of Revenue': new Set(HEAD_OF_SALES_LIKE_DEFAULTS),
    'Sales Manager': permSet('mutate.operational', 'requests.alerts', 'promotions.view', 'promotions.linkRequests', ...DEFAULT_NAV_PERMISSIONS),
    'Sales Executive': permSet('mutate.operational', 'requests.alerts', 'promotions.view', 'promotions.linkRequests', ...DEFAULT_NAV_PERMISSIONS),
    'Sales Coordinator': permSet('mutate.operational', 'requests.alerts', 'promotions.view', 'promotions.linkRequests', ...DEFAULT_NAV_PERMISSIONS),
    'Reservations Team': permSet(
        'mutate.operational',
        'accounts.viewOnly',
        'nav.todo',
        'nav.requests',
        'requests.alerts'
    ),
};

export function normalizeUserRole(user: any): UserRoleId {
    const r = String(user?.role ?? '').trim().toLowerCase();
    if (!r) return 'Sales Executive';
    if (r === 'admin' || r === 'administrator') return 'Admin';
    if (r.includes('general manager') || r === 'gm') return 'General Manager';
    if (
        r.includes('director of revenue') ||
        r.includes('revenue director') ||
        (r.includes('director') && r.includes('revenue'))
    ) {
        return 'Director of Revenue';
    }
    if (
        r.includes('head of sales') ||
        r === 'hod' ||
        (r.includes('head') && r.includes('sales'))
    ) {
        return 'Head of Sales';
    }
    if (r.includes('sales manager')) return 'Sales Manager';
    if (r.includes('sales coordinator')) return 'Sales Coordinator';
    if (r.includes('reservations team') || r.includes('reservation team') || r === 'reservations') return 'Reservations Team';
    if (r.includes('sales executive')) return 'Sales Executive';
    if (r === 'sales team' || r === 'staff') return 'Sales Executive';
    if (r.includes('sales manager') || r === 'sales manager') return 'Sales Manager';
    return 'Sales Executive';
}

export function getEffectivePermissionSet(user: any): Set<PermissionId> {
    const role = normalizeUserRole(user);
    if (role === 'Admin') {
        return new Set(ALL_PERMISSION_IDS);
    }
    const base = ROLE_DEFAULTS[role];
    const out = new Set(base);
    const grants: string[] = Array.isArray(user?.permissionGrants) ? user.permissionGrants : [];
    const revokes: string[] = Array.isArray(user?.permissionRevokes) ? user.permissionRevokes : [];
    for (const g of grants) {
        if ((ALL_PERMISSION_IDS as readonly string[]).includes(g)) out.add(g as PermissionId);
    }
    for (const rv of revokes) {
        out.delete(rv as PermissionId);
    }
    return out;
}

export function can(user: any, perm: PermissionId): boolean {
    return getEffectivePermissionSet(user).has(perm);
}

export function isSystemAdmin(user: any): boolean {
    return normalizeUserRole(user) === 'Admin';
}

/** Legacy name: only true system admins (tag / global admin UI). */
export function isAdminUser(user: any): boolean {
    return isSystemAdmin(user);
}

/** Sidebar + Report Builder entry: full access flag or any granular Reports capability. */
export function canAccessReports(user: any): boolean {
    if (!user) return false;
    if (can(user, 'reports.access')) return true;
    return (
        can(user, 'reports.sourceRows') ||
        REPORTS_DATA_SOURCE_PERMISSIONS.some((p) => can(user, p))
    );
}

/** Primary sidebar items (excluding Accounts — see canShowAccountsNavItem). */
export const MAIN_NAV_ITEM_PERMISSIONS: Record<string, PermissionId> = {
    dashboard: 'nav.dashboard',
    calendar: 'nav.calendar',
    todo: 'nav.todo',
    events: 'nav.events',
    requests: 'nav.requests',
    crm: 'nav.crm',
    contracts: 'nav.contracts',
    promotions: 'nav.promotions',
};

/** Reservations Team uses Accounts only with view-only grant; other roles use nav.accounts. */
export function canShowAccountsNavItem(user: any): boolean {
    if (!user) return false;
    if (normalizeUserRole(user) === 'Reservations Team') return canAccessAccountsNav(user);
    return can(user, 'nav.accounts');
}

/** Views the user is allowed to open (for route guard). Always includes `settings`. */
export function getAllowedAppViewsForUser(user: any): Set<string> {
    const allowed = new Set<string>(['settings']);
    if (!user) return allowed;
    for (const [viewId, perm] of Object.entries(MAIN_NAV_ITEM_PERMISSIONS)) {
        if (can(user, perm)) allowed.add(viewId);
    }
    if (canShowAccountsNavItem(user)) allowed.add('accounts');
    if (canAccessPromotions(user)) allowed.add('promotions');
    if (canAccessReports(user)) allowed.add('reports');
    return allowed;
}

const REPORT_ENTITY_TO_PERM: Record<string, PermissionId | undefined> = {
    Requests: 'reports.dataRequests',
    Accounts: 'reports.dataAccounts',
    MICE: 'reports.dataMice',
    Tasks: 'reports.dataTasks',
    'Sales Calls': 'reports.dataSalesCalls',
    'Rooms vs LY': 'reports.dataRequests',
    'MICE vs LY': 'reports.dataMice',
    Promotions: 'reports.dataRequests',
};

/** True if user has any per–data-source Reports permission (restricts which sources appear). */
export function hasGranularReportsDataPermission(user: any): boolean {
    return REPORTS_DATA_SOURCE_PERMISSIONS.some((p) => can(user, p));
}

/**
 * Use this data source in Report Builder (picker, filters, export).
 * Legacy: if user has reports.access but none of reports.data*, allow all sources (unchanged behaviour).
 */
export function canReportsUseDataSource(user: any, entityLabel: string): boolean {
    if (!canAccessReports(user)) return false;
    /** Full Report uses both Rooms and MICE datasets; require both grants when data sources are split. */
    if (entityLabel === 'Full Report') {
        if (!hasGranularReportsDataPermission(user)) return true;
        return can(user, 'reports.dataRequests') && can(user, 'reports.dataMice');
    }
    if (!hasGranularReportsDataPermission(user)) return true;
    const p = REPORT_ENTITY_TO_PERM[entityLabel];
    return p ? can(user, p) : false;
}

/**
 * Generate preview and show the row-by-row source table.
 * Requires reports.sourceRows, or legacy full builder when no reports.data* is assigned.
 */
export function canReportsPreviewSourceRows(user: any): boolean {
    if (!canAccessReports(user)) return false;
    if (can(user, 'reports.sourceRows')) return true;
    return !hasGranularReportsDataPermission(user);
}

export function canDeleteTasks(user: any): boolean {
    return can(user, 'tasks.deleteAny');
}

export function canDeleteAccounts(user: any): boolean {
    return can(user, 'accounts.delete');
}

export function canDeleteBillingDeposits(user: any): boolean {
    return can(user, 'accounts.deleteBillingDeposits');
}

export function canDeleteContracts(user: any): boolean {
    return can(user, 'contracts.delete');
}

export function canDeleteContractTemplates(user: any): boolean {
    return can(user, 'contracts.templates.delete');
}

export function canDeleteRequests(user: any): boolean {
    return can(user, 'requests.delete');
}

export function canDeleteRequestPayments(user: any): boolean {
    return can(user, 'requests.deletePayments');
}

/** Manage request alerts (OPTS → Alert, bell button, add/edit/delete). */
export function canUseRequestAlerts(user: any): boolean {
    return can(user, 'requests.alerts');
}

export function canDeleteSalesCalls(user: any): boolean {
    return can(user, 'crm.deleteCalls');
}

export function canEditSalesCalls(user: any): boolean {
    return can(user, 'crm.editCalls');
}

export function canManageManualTimeline(user: any): boolean {
    return can(user, 'accounts.timelineManual');
}

/** Merge duplicate accounts into one profile and assign account owner on legacy rows. */
export function canMergeAccountsAndAssignOwner(user: any): boolean {
    return can(user, 'accounts.mergeAndAssignOwner');
}

export function canMutateOperational(user: any): boolean {
    return can(user, 'mutate.operational');
}

export function canAccessPromotions(user: any): boolean {
    return can(user, 'nav.promotions') && can(user, 'promotions.view');
}

export function canCreatePromotions(user: any): boolean {
    return can(user, 'promotions.create');
}

export function canEditPromotions(user: any): boolean {
    return can(user, 'promotions.edit');
}

export function canDeletePromotions(user: any): boolean {
    return can(user, 'promotions.delete');
}

export function canLinkRequestPromotions(user: any): boolean {
    return can(user, 'promotions.linkRequests');
}

/** Reservations Team: show Accounts in nav when this is granted (also assignable to any role). */
export function canAccessAccountsNav(user: any): boolean {
    if (normalizeUserRole(user) !== 'Reservations Team') return true;
    return can(user, 'accounts.viewOnly');
}

/**
 * Accounts workspace is read-only when user cannot mutate operationally, or when Reservations Team
 * has Accounts view-only (they may still mutate requests elsewhere).
 */
export function isAccountsPageReadOnly(user: any): boolean {
    if (!canMutateOperational(user)) return true;
    return normalizeUserRole(user) === 'Reservations Team' && can(user, 'accounts.viewOnly');
}

export function canAccessSettingsAdmin(user: any): boolean {
    return can(user, 'settings.admin');
}

export function canAccessGlobalStaff(user: any): boolean {
    return can(user, 'settings.globalStaff');
}

/**
 * When saving a user from admin UI: compute grant/revoke arrays from role + desired set.
 */
export function diffPermissionsAgainstRole(
    roleDisplay: string,
    selected: Set<PermissionId>
): { permissionGrants: PermissionId[]; permissionRevokes: PermissionId[] } {
    const role = normalizeUserRole({ role: roleDisplay });
    if (role === 'Admin') {
        return { permissionGrants: [], permissionRevokes: [] };
    }
    const defaults = ROLE_DEFAULTS[role];
    const grants: PermissionId[] = [];
    const revokes: PermissionId[] = [];
    for (const p of ALL_PERMISSION_IDS) {
        const d = defaults.has(p);
        const s = selected.has(p);
        if (d && !s) revokes.push(p);
        if (!d && s) grants.push(p);
    }
    return { permissionGrants: grants, permissionRevokes: revokes };
}

export function getDefaultPermissionSetForRoleDisplay(roleDisplay: string): Set<PermissionId> {
    const role = normalizeUserRole({ role: roleDisplay });
    if (role === 'Admin') return new Set(ALL_PERMISSION_IDS);
    return new Set(ROLE_DEFAULTS[role]);
}
