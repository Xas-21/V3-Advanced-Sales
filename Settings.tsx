import React, { useState, useMemo, useEffect, useRef, Suspense, lazy } from 'react';
import {
    Settings as SettingsIcon, Building, BedDouble, DollarSign, Users,
    User, Upload, Save, Edit, Plus, Trash2, X, Check, Mail, Phone, Shield,
    MapPin, Layout, Box, FileText, List, ChevronDown, ChevronRight, ChevronUp, Monitor,
    TrendingUp, Calculator, CalendarDays, ChevronLeft, CheckSquare, Zap, CheckCircle2, Download, Clock,
    UserMinus, RefreshCw, Tags, UtensilsCrossed, Bell, CreditCard
} from 'lucide-react';
import { apiUrl } from './backendApi';
import {
    resolveSegmentsForProperty,
    saveSegmentsForProperty,
    resolveAccountTypesForProperty,
    saveAccountTypesForProperty,
    TAXONOMY_CHANGED_EVENT,
} from './propertyTaxonomy';
import {
    resolveMealPlansForProperty,
    saveMealPlansForProperty,
    resolveEventPackagesForProperty,
    saveEventPackagesForProperty,
    MEALS_PACKAGES_CHANGED_EVENT,
    EVENT_PACKAGE_TIMING_OPTIONS,
    type MealPlanEntry,
    type EventPackageEntry,
    type EventPackageTimingId,
} from './propertyMealsPackages';
import {
    resolveOccupancyTypesForProperty,
    saveOccupancyTypesForProperty,
    OCCUPANCY_TYPES_CHANGED_EVENT,
} from './propertyOccupancyTypes';
import {
    resolvePaymentMethodsForProperty,
    savePaymentMethodsForProperty,
    PAYMENT_METHODS_CHANGED_EVENT,
} from './propertyPaymentMethods';
import {
    USER_ROLE_OPTIONS,
    PERMISSION_LABELS,
    USER_MODAL_SECTIONS,
    normalizeUserRole,
    getEffectivePermissionSet,
    isSystemAdmin,
    ROLE_DEFAULTS,
    type PermissionId,
} from './userPermissions';
import { checkPasswordPolicy } from './passwordPolicy';
import { type CurrencyCode } from './currency';
import { useCurrencyFormatters } from './useCurrencyFormatters';
import type {
    DeadlineAlertKind,
    DeadlineAlertRuleSettings,
    PropertyAlertSettingsMap,
    SystemAlertKind,
} from './propertyAlertSettings';
import {
    ALERT_TYPE_REGISTRY,
    CLIENT_FEEDBACK_LOOKBACK_DAYS,
    CLIENT_FEEDBACK_URGENT_LAST_DAYS,
    DEADLINE_ACCENT_OPTIONS,
    DEADLINE_ALERT_KINDS,
    DEADLINE_OFFSET_OPTIONS,
    REQUEST_STATUS_OPTIONS,
    mergePropertyAlertSettings,
    resolveAlertSettingsForProperty,
    saveAlertSettingsForProperty,
} from './propertyAlertSettings';
import type { DeadlineCallKind, DeadlineCallRuleSettings, PropertyCallSettingsMap } from './propertyCallSettings';
import {
    CALL_TYPE_REGISTRY,
    DEADLINE_CALL_KINDS,
    mergePropertyCallSettings,
    resolveCallSettingsForProperty,
    saveCallSettingsForProperty,
} from './propertyCallSettings';
import {
    FORM_CONFIGURATION_CHANGED_EVENT,
    FORM_CONFIGURATION_META,
    type FormConfigurationFormId,
    type FormOverride,
    type PropertyFormConfigStore,
    loadPropertyFormOverrides,
    persistFormConfigurationsForProperty,
    getResolvedFormSchemaFromStores,
    getDefaultFormSchema,
    collectNewUserFormViolations,
    collectNewPropertyFormViolations,
} from './formConfigurations';
import {
    FEEDBACK_QUESTION_TYPE_OPTIONS,
    buildDefaultFeedbackTemplateStore,
    resolveFeedbackTemplatesForProperty,
    type FeedbackTemplate,
    type FeedbackTemplateType,
} from './requestFeedbackConfig';

interface SettingsProps {
    theme: any;
    currentUser: any;
    activeProperty?: any;
    sharedRequests?: any[];
    accounts?: any[];
    crmLeads?: Record<string, any[]>;
    tasks?: any[];
    onOpenTasks?: () => void;
    currency?: CurrencyCode;
    /** Refetch `/api/users` so other sessions (and sidebar permissions) stay in sync. */
    onUsersDirectoryChange?: () => void;
    /** Clear local session and show login (e.g. after password change invalidates other tabs). */
    onRequireReLogin?: () => void;
}

// Mock Data
const initialProperties: any[] = [];

const initialRoomTypes: any[] = [];

const initialVenues: any[] = [];

const initialUsers: any[] = [];

const defaultTaxesForProperty = (propertyId: string) => [
    { id: 'vat', label: 'VAT (Value Added Tax)', rate: 15, scope: { accommodation: true, transport: true, foodAndBeverage: true, events: true }, propertyId },
    { id: 'muni', label: 'Municipality Fee', rate: 10, scope: { accommodation: true, transport: false, foodAndBeverage: false, events: true }, propertyId },
    { id: 'service', label: 'Service Fee', rate: 12, scope: { accommodation: true, transport: false, foodAndBeverage: true, events: false }, propertyId },
];

const DEFAULT_CXL_REASONS = [
    'Price too high',
    'Changed dates',
    'Destination change',
    'Budget issues',
    'Group cancelled',
    'Competitor offer',
    'Other',
];

const UserPerformanceDashboard = lazy(() =>
    import('./UserPerformanceDashboard').then((m) => ({ default: m.UserPerformanceDashboard }))
);

function ProfileDashboardFallback() {
    return (
        <div className="flex items-center justify-center min-h-[40vh] w-full text-sm opacity-60" aria-busy="true">
            Loading…
        </div>
    );
}

export default function Settings({
    theme,
    currentUser,
    activeProperty,
    sharedRequests = [],
    accounts = [],
    crmLeads = {},
    tasks = [],
    onOpenTasks,
    currency = 'SAR',
    onUsersDirectoryChange,
    onRequireReLogin,
}: SettingsProps) {
    const colors = theme.colors;
    // Keep default maxFractionDigits=0 (site historically differed from the common default of 2).
    const { formatCurrencyAmount } = useCurrencyFormatters(currency);
    const formatMoney = (amountSar: number, maxFractionDigits = 0) =>
        formatCurrencyAmount(amountSar, maxFractionDigits);
    const appIsAdmin = isSystemAdmin(currentUser);
    const [activeTab, setActiveTab] = useState('profile');
    const [properties, setProperties] = useState(initialProperties);
    const [roomTypes, setRoomTypes] = useState(initialRoomTypes);
    const [venues, setVenues] = useState(initialVenues);
    const [users, setUsers] = useState(initialUsers);
    const [managingProperty, setManagingProperty] = useState<any>(null);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [alertSettingsSaveStatus, setAlertSettingsSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const directoryFetchedRef = useRef(false);

    // Profile-only / non-admin: skip directory download. Admin tabs need users + properties once.
    const needsDirectory = appIsAdmin && activeTab !== 'profile';

    useEffect(() => {
        if (!needsDirectory || directoryFetchedRef.current) return;
        directoryFetchedRef.current = true;

        fetch(apiUrl('/api/users'))
            .then((res) => res.json())
            .then((data) => {
                if (Array.isArray(data)) setUsers(data);
            })
            .catch((err) => console.error('Error fetching users:', err));

        fetch(apiUrl('/api/properties'))
            .then((res) => res.json())
            .then((data) => {
                if (Array.isArray(data)) setProperties(data);
            })
            .catch((err) => console.error('Error fetching properties:', err));
    }, [needsDirectory]);

    useEffect(() => {
        if (!appIsAdmin && activeTab !== 'profile') {
            setActiveTab('profile');
        }
    }, [appIsAdmin, activeTab]);

    const [selectedUserForStats, setSelectedUserForStats] = useState<any>(null);
    const [showResetPassword, setShowResetPassword] = useState(false);
    const [resetPasswordData, setResetPasswordData] = useState({ current: '', new: '', confirm: '' });
    const [resetPasswordBusy, setResetPasswordBusy] = useState(false);

    const handleProfileChangePassword = async () => {
        const username = String(currentUser?.username ?? '').trim();
        if (!username) {
            alert('Missing username on your profile. Contact an administrator.');
            return;
        }
        if (!resetPasswordData.current) {
            alert('Enter your current password.');
            return;
        }
        if (resetPasswordData.new !== resetPasswordData.confirm) {
            alert('New password and confirmation do not match.');
            return;
        }
        const pwPolicy = checkPasswordPolicy(resetPasswordData.new);
        if (!pwPolicy.ok) {
            alert(pwPolicy.message);
            return;
        }
        setResetPasswordBusy(true);
        try {
            const res = await fetch(apiUrl('/api/auth/change-password'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username,
                    current_password: resetPasswordData.current,
                    new_password: resetPasswordData.new,
                }),
            });
            const raw = await res.text();
            let detail: string | undefined;
            try {
                const j = JSON.parse(raw);
                detail = typeof j?.detail === 'string' ? j.detail : Array.isArray(j?.detail) ? j.detail[0]?.msg : undefined;
            } catch {
                detail = raw?.slice(0, 200);
            }
            if (!res.ok) {
                alert(detail || 'Could not update password.');
                return;
            }
            try {
                localStorage.setItem(
                    'as_force_relogin',
                    JSON.stringify({ userId: String(currentUser.id), at: Date.now() }),
                );
            } catch {
                /* ignore quota / private mode */
            }
            setResetPasswordData({ current: '', new: '', confirm: '' });
            setShowResetPassword(false);
            onUsersDirectoryChange?.();
            onRequireReLogin?.();
        } catch {
            alert('Could not reach the server. Is the backend running?');
        } finally {
            setResetPasswordBusy(false);
        }
    };

    const userPerformanceDashboardSharedProps = {
        colors,
        properties,
        users,
        crmLeads,
        sharedRequests,
        accounts,
        tasks,
        activeProperty,
        formatMoney,
        showResetPassword,
        setShowResetPassword,
        resetPasswordData,
        setResetPasswordData,
        resetPasswordBusy,
        handleProfileChangePassword,
        onOpenTasks,
    };

    // Tax Config - Refactored for per-tax scope
    const [taxes, setTaxes] = useState<any[]>([
        { id: 'vat', label: 'VAT (Value Added Tax)', rate: 15, scope: { accommodation: true, transport: true, foodAndBeverage: true, events: true } },
        { id: 'muni', label: 'Municipality Fee', rate: 10, scope: { accommodation: true, transport: false, foodAndBeverage: false, events: true } },
        { id: 'service', label: 'Service Fee', rate: 12, scope: { accommodation: true, transport: false, foodAndBeverage: true, events: false } }
    ]);
    const safeRoomTypes = useMemo(() => (Array.isArray(roomTypes) ? roomTypes : []), [roomTypes]);
    const safeVenues = useMemo(
        () =>
            (Array.isArray(venues) ? venues : []).map((venue: any) => ({
                ...venue,
                shapes: Array.isArray(venue?.shapes) ? venue.shapes : [],
            })),
        [venues]
    );
    const safeTaxes = useMemo(
        () =>
            (Array.isArray(taxes) ? taxes : []).map((tax: any) => ({
                ...tax,
                scope:
                    tax?.scope && typeof tax.scope === 'object'
                        ? tax.scope
                        : { accommodation: false, transport: false, foodAndBeverage: false, events: false },
            })),
        [taxes]
    );

    // Profile Config
    const [userProfile, setUserProfile] = useState({
        name: currentUser?.name || 'Demo User',
        email: currentUser?.email || 'demo@advancedsales.com',
        phone: '+966 50 XXX XXXX',
        title: currentUser?.role || 'Sales Manager',
        property: currentUser?.property || 'Advanced Sales System'
    });

    const [configFormId, setConfigFormId] = useState<FormConfigurationFormId>('request_accommodation');
    const [configTargetPropertyId, setConfigTargetPropertyId] = useState('');
    const [formConfigStore, setFormConfigStore] = useState<PropertyFormConfigStore>({});

    useEffect(() => {
        if (activeTab !== 'config') return;
        const fallback =
            String(managingProperty?.id || '').trim() ||
            String(activeProperty?.id || '').trim() ||
            String(properties[0]?.id || '').trim() ||
            '';
        setConfigTargetPropertyId((cur) => {
            if (cur && properties.some((p: any) => String(p?.id) === String(cur))) return cur;
            return fallback;
        });
    }, [activeTab, managingProperty?.id, activeProperty?.id, properties]);

    useEffect(() => {
        if (activeTab !== 'config' || !configTargetPropertyId) return;
        const row = properties.find((p: any) => String(p?.id) === String(configTargetPropertyId));
        setFormConfigStore(loadPropertyFormOverrides(configTargetPropertyId, row));
    }, [configTargetPropertyId, activeTab, properties]);

    useEffect(() => {
        const onFormCfg = (e: Event) => {
            if (activeTab !== 'config' || !configTargetPropertyId) return;
            const d = (e as CustomEvent<{ propertyId?: string; formConfigurations?: PropertyFormConfigStore }>).detail;
            if (!d?.propertyId || String(d.propertyId) !== String(configTargetPropertyId)) return;
            if (d.formConfigurations != null && typeof d.formConfigurations === 'object' && !Array.isArray(d.formConfigurations)) {
                setFormConfigStore(JSON.parse(JSON.stringify(d.formConfigurations)) as PropertyFormConfigStore);
            } else {
                const row = properties.find((p: any) => String(p?.id) === String(configTargetPropertyId));
                setFormConfigStore(loadPropertyFormOverrides(configTargetPropertyId, row));
            }
        };
        window.addEventListener(FORM_CONFIGURATION_CHANGED_EVENT, onFormCfg as EventListener);
        return () => window.removeEventListener(FORM_CONFIGURATION_CHANGED_EVENT, onFormCfg as EventListener);
    }, [activeTab, configTargetPropertyId, properties]);

    // Modal & CRUD State
    const [showModal, setShowModal] = useState(false);
    const [modalType, setModalType] = useState<any>(null); // 'property', 'room', 'venue', 'user', ...
    const [editingItem, setEditingItem] = useState<any>(null);
    const [modalFormData, setModalFormData] = useState<any>({});
    const [userModalPermSection, setUserModalPermSection] = useState<string>(USER_MODAL_SECTIONS[0].id);

    const openModal = (type: string, item: any = null) => {
        setModalType(type);
        setEditingItem(item);
        if (type === 'user') {
            setUserModalPermSection(USER_MODAL_SECTIONS[0].id);
            const userDefaults = {
                name: '',
                username: '',
                email: '',
                propertyId: '',
                role: 'Sales Executive' as string,
                permissionGrants: [] as string[],
                permissionRevokes: [] as string[],
                stats: { yearlyTargets: {} as Record<string, number> },
            };
            if (item) {
                setModalFormData({
                    ...userDefaults,
                    ...item,
                    permissionGrants: Array.isArray(item.permissionGrants) ? [...item.permissionGrants] : [],
                    permissionRevokes: Array.isArray(item.permissionRevokes) ? [...item.permissionRevokes] : [],
                });
            } else {
                setModalFormData({ ...userDefaults });
            }
        } else {
            setModalFormData(item || {});
        }
        setShowModal(true);
    };

    const toggleUserPermission = (perm: PermissionId) => {
        const role = normalizeUserRole({ role: modalFormData.role });
        if (role === 'Admin') return;
        const defaults = ROLE_DEFAULTS[role];
        const defHas = defaults.has(perm);
        const g = [...(modalFormData.permissionGrants || [])];
        const r = [...(modalFormData.permissionRevokes || [])];
        const eff = getEffectivePermissionSet({
            role: modalFormData.role,
            permissionGrants: g,
            permissionRevokes: r,
        });
        const cur = eff.has(perm);
        const next = !cur;
        const strip = (arr: string[], p: string) => arr.filter((x) => x !== p);
        if (defHas === next) {
            setModalFormData({
                ...modalFormData,
                permissionGrants: strip(g, perm),
                permissionRevokes: strip(r, perm),
            });
        } else if (defHas && !next) {
            setModalFormData({
                ...modalFormData,
                permissionGrants: strip(g, perm),
                permissionRevokes: [...strip(r, perm), perm],
            });
        } else {
            setModalFormData({
                ...modalFormData,
                permissionGrants: [...strip(g, perm), perm],
                permissionRevokes: strip(r, perm),
            });
        }
    };

    const handleSave = async () => {
        if (modalType === 'property') {
            const formCfgScope =
                String(managingProperty?.id || '').trim() ||
                String(activeProperty?.id || '').trim() ||
                '';
            const propCfgSource =
                properties.find((p: any) => String(p?.id) === String(formCfgScope)) ||
                (String(managingProperty?.id) === String(formCfgScope) ? managingProperty : undefined) ||
                (String(activeProperty?.id) === String(formCfgScope) ? activeProperty : undefined);
            const propViol = collectNewPropertyFormViolations(formCfgScope || undefined, modalFormData, propCfgSource);
            if (propViol.length) {
                alert(propViol.join('\n'));
                return;
            }
            const isEditing = !!editingItem;
            const propData = isEditing ? { ...editingItem, ...modalFormData } : { ...modalFormData, id: 'P' + Math.random().toString(36).substr(2, 9) };
            
            if (isEditing) {
                setProperties(properties.map(p => p.id === editingItem.id ? propData : p));
            } else {
                setProperties([...properties, propData]);
            }

            fetch(apiUrl('/api/properties'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(propData)
            }).catch(err => console.error("Error saving property:", err));
        } else if (modalType === 'room') {
            const dataToSave = { ...modalFormData, propertyId: managingProperty?.id };
            if (!editingItem && !dataToSave.id) dataToSave.id = 'RT' + Math.random().toString(36).substr(2, 9);
            
            fetch(apiUrl('/api/rooms'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dataToSave)
            }).then(res => res.json()).then(saved => {
                if (editingItem) setRoomTypes(roomTypes.map(r => r.id === editingItem.id ? saved : r));
                else setRoomTypes([...roomTypes, saved]);
            });
        } else if (modalType === 'venue') {
            const dataToSave = { ...modalFormData, propertyId: managingProperty?.id, shapes: modalFormData.shapes || [] };
            if (!editingItem && !dataToSave.id) dataToSave.id = 'V' + Math.random().toString(36).substr(2, 9);
            
            fetch(apiUrl('/api/venues'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dataToSave)
            }).then(res => res.json()).then(saved => {
                if (editingItem) setVenues(venues.map(v => v.id === editingItem.id ? saved : v));
                else setVenues([...venues, saved]);
            });
        } else if (modalType === 'user') {
            // Only treat as edit when opening an existing row (has id). Prefill payloads like `{ propertyId }`
            // from "Add staff" under a property must stay create-mode or we strip password / skip new id.
            const isEditing = !!(editingItem && editingItem.id);
            const formCfgScopeUser =
                String(managingProperty?.id || '').trim() ||
                String(activeProperty?.id || '').trim() ||
                '';
            const userCfgSource =
                properties.find((p: any) => String(p?.id) === String(formCfgScopeUser)) ||
                (String(managingProperty?.id) === String(formCfgScopeUser) ? managingProperty : undefined) ||
                (String(activeProperty?.id) === String(formCfgScopeUser) ? activeProperty : undefined);
            const userViol = collectNewUserFormViolations(
                formCfgScopeUser || undefined,
                modalFormData,
                isEditing,
                userCfgSource
            );
            if (userViol.length) {
                alert(userViol.join('\n'));
                return;
            }
            const userData: any = isEditing
                ? { ...editingItem, ...modalFormData }
                : { ...modalFormData, id: 'U' + Math.random().toString(36).substr(2, 9), status: 'Active' };

            for (const k of ['currentPass', 'newPass', 'confirmPass', 'showReset']) {
                delete userData[k];
            }

            if (isEditing) {
                if (appIsAdmin && modalFormData.showReset) {
                    const np = String(modalFormData.newPass || '').trim();
                    const cp = String(modalFormData.confirmPass || '').trim();
                    if (np || cp) {
                        if (np !== cp) {
                            alert('New password and confirmation do not match.');
                            return;
                        }
                        const pwPolicy = checkPasswordPolicy(np);
                        if (!pwPolicy.ok) {
                            alert(pwPolicy.message);
                            return;
                        }
                        userData.password = np;
                    } else {
                        delete userData.password;
                    }
                } else {
                    delete userData.password;
                }
            } else {
                const pw = String(modalFormData.password || '').trim();
                const pwPolicy = checkPasswordPolicy(pw);
                if (!pwPolicy.ok) {
                    alert(pwPolicy.message);
                    return;
                }
                userData.password = pw;
            }

            const roleNorm = normalizeUserRole({ role: userData.role });
            if (roleNorm === 'Admin') {
                userData.permissionGrants = [];
                userData.permissionRevokes = [];
            } else {
                userData.permissionGrants = Array.isArray(userData.permissionGrants) ? userData.permissionGrants : [];
                userData.permissionRevokes = Array.isArray(userData.permissionRevokes) ? userData.permissionRevokes : [];
            }

            // Strip client-only / non-API fields so we don't confuse the save payload.
            for (const k of ['property_ids', 'isAdmin', 'sessionVersion', 'passwordHash', 'stats', 'shapes']) {
                delete userData[k];
            }
            // Backend stores lowercase status; keep login checks consistent.
            if (userData.status != null) {
                userData.status = String(userData.status).trim().toLowerCase() || 'active';
            }
            // Prefer snake_case property_id for the API (accept camelCase from the form).
            if (userData.propertyId != null && userData.property_id == null) {
                userData.property_id = userData.propertyId;
            }

            try {
                const res = await fetch(apiUrl('/api/users'), {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(userData),
                });
                const raw = await res.text();
                let detail: string | undefined;
                let savedUser: any;
                try {
                    const j = JSON.parse(raw);
                    detail =
                        typeof j?.detail === 'string'
                            ? j.detail
                            : Array.isArray(j?.detail)
                              ? j.detail[0]?.msg
                              : undefined;
                    savedUser = j?.user;
                } catch {
                    detail = raw?.slice(0, 200);
                }
                if (!res.ok) {
                    alert(detail || 'Could not save user. Password was not changed.');
                    return;
                }

                const userForState = { ...(savedUser || userData) };
                delete userForState.password;
                if (isEditing) {
                    setUsers(users.map((u) => (u.id === editingItem.id ? { ...u, ...userForState } : u)));
                } else {
                    setUsers([...users, userForState]);
                }
                onUsersDirectoryChange?.();
                setShowModal(false);
            } catch (err) {
                console.error('Error saving user:', err);
                alert('Could not save user. Check your connection and try again.');
            }
            return;
        } else if (modalType === 'assignUser') {
            const { propertyId, selectedUserIds } = modalFormData;
            const targetProperty = properties.find(p => p.id === propertyId);
            
            const nextAssigned = new Set(selectedUserIds.map((id: any) => String(id)));

            if (targetProperty) {
                // Keep property.assignedUserIds in sync for legacy display readers.
                const updatedProperty = { ...targetProperty, assignedUserIds: Array.from(nextAssigned) };
                setProperties(properties.map(p => p.id === propertyId ? updatedProperty : p));
                fetch(apiUrl('/api/properties'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatedProperty)
                }).catch(err => console.error("Error saving property assignment:", err));
            }

            const pending: Promise<void>[] = [];

            // Grant access on each selected user's record (source of truth for backend access).
            selectedUserIds.forEach((uid: string) => {
                const idStr = String(uid ?? '').trim();
                if (!idStr) return;
                pending.push(patchUserPropertyAccess(idStr, propertyId));
            });

            // Revoke access for any user previously assigned (by user record) but now deselected.
            users
                .filter((usr) => userAssignedToProperty(usr, propertyId))
                .forEach((usr) => {
                    const uid = String(usr?.id ?? '');
                    if (uid && !nextAssigned.has(uid)) {
                        pending.push(patchUserPropertyAccess(uid, null));
                    }
                });

            // Reflect changes across all tabs after the record updates actually persist.
            Promise.all(pending).then(refreshDirectory);
        }
        setShowModal(false);
    };

    const handleSaveTaxes = async () => {
        if (!managingProperty) return;
        setSaveStatus('saving');
        try {
            await Promise.all(taxes.map(tax => 
                fetch(apiUrl('/api/taxes'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...tax, propertyId: managingProperty.id })
                })
            ));
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 3000);
        } catch (err) {
            console.error("Error saving taxes:", err);
            setSaveStatus('error');
        }
    };

    const handleDelete = (type: string, id: string | number) => {
        if (!window.confirm('Are you sure you want to delete this item?')) return;
        if (type === 'property') {
            setProperties(properties.filter(p => p.id !== id));
            fetch(apiUrl(`/api/properties/${id}`), { method: 'DELETE' })
                .catch(err => console.error("Error deleting property:", err));
        }
        else if (type === 'room') {
            setRoomTypes(roomTypes.filter(r => r.id !== id));
            const suffix = managingProperty?.id ? `?propertyId=${encodeURIComponent(String(managingProperty.id))}` : '';
            fetch(apiUrl(`/api/rooms/${id}${suffix}`), { method: 'DELETE' });
        }
        else if (type === 'venue') {
            setVenues(venues.filter(v => v.id !== id));
            const suffix = managingProperty?.id ? `?propertyId=${encodeURIComponent(String(managingProperty.id))}` : '';
            fetch(apiUrl(`/api/venues/${id}${suffix}`), { method: 'DELETE' });
        }
        else if (type === 'user') {
            setUsers(users.filter(u => u.id !== id));
            fetch(apiUrl(`/api/users/${id}`), { method: 'DELETE' })
                .catch(err => console.error("Error deleting user:", err));
        }
    };

    // Single source of truth for "is this user assigned to this property": the USER
    // record (propertyId / property_ids) — this is exactly what the backend uses for
    // access control. property.assignedUserIds is a legacy display list that drifts.
    const userAssignedToProperty = (u: any, propId: string | number): boolean => {
        if (!u) return false;
        const pid = String(propId);
        if (String(u.propertyId ?? '') === pid) return true;
        const arr = u.property_ids || u.assignedPropertyIds || [];
        return Array.isArray(arr) && arr.map((x: any) => String(x)).includes(pid);
    };

    // Re-pull users + properties so every tab reflects assignment changes immediately.
    const refreshDirectory = () => {
        fetch(apiUrl('/api/users'))
            .then((res) => (res.ok ? res.json() : []))
            .then((data) => {
                if (Array.isArray(data)) setUsers(data);
            })
            .catch(() => {});
        fetch(apiUrl('/api/properties'))
            .then((res) => (res.ok ? res.json() : []))
            .then((data) => {
                if (Array.isArray(data)) setProperties(data);
            })
            .catch(() => {});
        onUsersDirectoryChange?.();
    };

    const patchUserPropertyAccess = (userId: string, propertyId: string | null): Promise<void> => {
        const uidStr = String(userId ?? '').trim();
        if (!uidStr) return Promise.resolve();
        const user = users.find((u) => String(u?.id ?? '') === uidStr);
        if (!user) return Promise.resolve();
        const updatedUser = {
            ...user,
            propertyId: propertyId || null,
            property_ids: propertyId ? [propertyId] : [],
        };
        setUsers((prevUsers) =>
            prevUsers.map((u) => (String(u?.id ?? '') === uidStr ? updatedUser : u)),
        );
        return fetch(apiUrl(`/api/users/${encodeURIComponent(uidStr)}`), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                propertyId: propertyId || null,
                assignedPropertyIds: propertyId ? [propertyId] : [],
            }),
        })
            .then(() => undefined)
            .catch((err) => console.error('Error patching user property access:', err));
    };

    const handleUnassign = (userId: string, targetPropId?: string) => {
        const propId = targetPropId || managingProperty?.id;
        if (!propId) return;
        if (!window.confirm('Are you sure you want to unassign this user from this property?')) return;

        const uidStr = String(userId ?? '').trim();
        const user = users.find((u) => String(u?.id ?? '') === uidStr);

        // Compute the user's remaining property access after removing this one.
        const currentAssigned: string[] = Array.isArray(user?.property_ids)
            ? user!.property_ids.map((x: any) => String(x))
            : (user?.propertyId ? [String(user.propertyId)] : []);
        const remaining = currentAssigned.filter((id) => id !== String(propId));
        const newPrimary =
            String(user?.propertyId ?? '') === String(propId) ? (remaining[0] || null) : (user?.propertyId ?? null);

        // Revoke on the USER record (this is what the backend uses for access control).
        setUsers((prevUsers) =>
            prevUsers.map((u) =>
                String(u?.id ?? '') === uidStr ? { ...u, propertyId: newPrimary, property_ids: remaining } : u,
            ),
        );
        const patchPromise = uidStr
            ? fetch(apiUrl(`/api/users/${encodeURIComponent(uidStr)}`), {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ propertyId: newPrimary, assignedPropertyIds: remaining }),
              })
                  .then(() => undefined)
                  .catch((err) => console.error('Error unassigning user:', err))
            : Promise.resolve();

        // Keep property.assignedUserIds in sync for legacy display readers.
        const prop = properties.find((p: any) => p.id === propId);
        if (prop) {
            const updatedProp = {
                ...prop,
                assignedUserIds: (prop.assignedUserIds || []).filter((id: string) => String(id) !== uidStr),
            };
            setProperties((prevProps: any[]) => prevProps.map(p => p.id === propId ? updatedProp : p));
            if (managingProperty && managingProperty.id === propId) {
                setManagingProperty(updatedProp);
            }
            fetch(apiUrl('/api/properties'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedProp)
            }).catch(err => console.error("Error unassigning user from property:", err));
        }

        Promise.resolve(patchPromise).then(refreshDirectory);
    };

    // Financial & KPI State
    const monthsList = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const generateInitialMonths = () => monthsList.map(m => ({
        month: m,
        roomsBudget: 0,
        roomsForecast: 0,
        foodAndBeverageBudget: 0,
        foodAndBeverageForecast: 0,
        salesCalls: 0
    }));

    const [financialData, setFinancialData] = useState([
        { year: 2025, months: generateInitialMonths() }
    ]);
    const [selectedYearDetails, setSelectedYearDetails] = useState<any>(null);
    const [isEditingFinancials, setIsEditingFinancials] = useState(false);
    const [tempYearData, setTempYearData] = useState<any>(null);
    const normalizedFinancialData = useMemo(() => {
        const rows = Array.isArray(financialData) ? financialData : [];
        const normalized = rows
            .map((row: any) => ({
                ...row,
                year: Number(row?.year || 0),
                months: Array.isArray(row?.months) && row.months.length ? row.months : generateInitialMonths(),
            }))
            .filter((row: any) => Number.isFinite(row.year) && row.year > 0)
            .sort((a: any, b: any) => a.year - b.year);
        if (normalized.length > 0) return normalized;
        return [{ year: new Date().getFullYear(), months: generateInitialMonths() }];
    }, [financialData]);
    const nextFinancialYear = useMemo(
        () => Number(normalizedFinancialData[normalizedFinancialData.length - 1]?.year || new Date().getFullYear()) + 1,
        [normalizedFinancialData]
    );

    const [activePropTab, setActivePropTab] = useState('rooms');
    const [alertSettingsDraft, setAlertSettingsDraft] = useState<PropertyAlertSettingsMap>(() =>
        mergePropertyAlertSettings(null)
    );
    const [callSettingsDraft, setCallSettingsDraft] = useState<PropertyCallSettingsMap>(() =>
        mergePropertyCallSettings(null)
    );
    const [callSettingsSaveStatus, setCallSettingsSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [feedbackTemplateType, setFeedbackTemplateType] = useState<FeedbackTemplateType>('accommodation');
    const [feedbackTemplatesDraft, setFeedbackTemplatesDraft] = useState<Record<FeedbackTemplateType, FeedbackTemplate>>(
        () => buildDefaultFeedbackTemplateStore()
    );
    const [feedbackFormsSaveStatus, setFeedbackFormsSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

    useEffect(() => {
        if (activePropTab !== 'alert_notifications') setAlertSettingsSaveStatus('idle');
        if (activePropTab !== 'calls') setCallSettingsSaveStatus('idle');
        if (activePropTab !== 'feedback_forms') setFeedbackFormsSaveStatus('idle');
    }, [activePropTab]);
    const [cxlReasons, setCxlReasons] = useState<any[]>([]);
    const [newCxlReason, setNewCxlReason] = useState('');
    const [editCxlId, setEditCxlId] = useState<string | null>(null);
    const [editCxlLabel, setEditCxlLabel] = useState('');
    const cxlStorageKey = (propertyId: string) => `visatour_cxl_reasons::${String(propertyId || '').trim()}`;
    const fallbackCxlReasonId = (propertyId: string, label: string, idx: number) =>
        `cxl-${String(propertyId || '').trim()}-${String(label || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')}-${idx}`;
    const normalizeCxlRows = (propertyId: string, rows: any[]) =>
        (Array.isArray(rows) ? rows : [])
            .map((row: any, idx: number) => {
                const label = String(row?.label || row?.reason || '').trim();
                if (!label) return null;
                const rawId = String(row?.id || '').trim();
                return {
                    id: rawId || fallbackCxlReasonId(propertyId, label, idx),
                    label,
                    propertyId: String(propertyId || ''),
                };
            })
            .filter(Boolean) as Array<{ id: string; label: string; propertyId: string }>;
    const persistCxlLocal = (propertyId: string, rows: any[]) => {
        try {
            const payload = normalizeCxlRows(propertyId, rows);
            localStorage.setItem(cxlStorageKey(propertyId), JSON.stringify(payload));
        } catch {
            // Ignore localStorage write failures.
        }
    };
    const loadCxlLocal = (propertyId: string) => {
        try {
            const raw = localStorage.getItem(cxlStorageKey(propertyId));
            const parsed = raw ? JSON.parse(raw) : [];
            const normalized = normalizeCxlRows(propertyId, parsed);
            return normalized;
        } catch {
            return [];
        }
    };

    const [taxonomySegments, setTaxonomySegments] = useState<string[]>([]);
    const [taxonomyAccountTypes, setTaxonomyAccountTypes] = useState<string[]>([]);
    const [taxonomyNewSegment, setTaxonomyNewSegment] = useState('');
    const [taxonomyNewType, setTaxonomyNewType] = useState('');
    const [editSegIdx, setEditSegIdx] = useState<number | null>(null);
    const [editSegVal, setEditSegVal] = useState('');
    const [editTypeIdx, setEditTypeIdx] = useState<number | null>(null);
    const [editTypeVal, setEditTypeVal] = useState('');

    const [mealPlansList, setMealPlansList] = useState<MealPlanEntry[]>([]);
    const [eventPackagesList, setEventPackagesList] = useState<EventPackageEntry[]>([]);
    const [newMealName, setNewMealName] = useState('');
    const [newMealCode, setNewMealCode] = useState('');
    const [newPkgName, setNewPkgName] = useState('');
    const [newPkgCode, setNewPkgCode] = useState('');
    const [newPkgTimingId, setNewPkgTimingId] = useState<EventPackageTimingId>('coffee_1');
    const [editMealIdx, setEditMealIdx] = useState<number | null>(null);
    const [editMealName, setEditMealName] = useState('');
    const [editMealCode, setEditMealCode] = useState('');
    const [editPkgIdx, setEditPkgIdx] = useState<number | null>(null);
    const [editPkgName, setEditPkgName] = useState('');
    const [editPkgCode, setEditPkgCode] = useState('');
    const [editPkgTimingId, setEditPkgTimingId] = useState<EventPackageTimingId>('coffee_1');

    const [occupancyTypesList, setOccupancyTypesList] = useState<string[]>([]);
    const [newOccupancyLabel, setNewOccupancyLabel] = useState('');
    const [editOccIdx, setEditOccIdx] = useState<number | null>(null);
    const [editOccVal, setEditOccVal] = useState('');

    const [paymentMethodsList, setPaymentMethodsList] = useState<string[]>([]);
    const [newPaymentMethodLabel, setNewPaymentMethodLabel] = useState('');
    const [editPaymentIdx, setEditPaymentIdx] = useState<number | null>(null);
    const [editPaymentVal, setEditPaymentVal] = useState('');

    useEffect(() => {
        if (!managingProperty?.id) {
            setTaxonomySegments([]);
            setTaxonomyAccountTypes([]);
            setMealPlansList([]);
            setEventPackagesList([]);
            setOccupancyTypesList([]);
            setPaymentMethodsList([]);
            setAlertSettingsDraft(mergePropertyAlertSettings(null));
            setCallSettingsDraft(mergePropertyCallSettings(null));
            setFeedbackTemplatesDraft(buildDefaultFeedbackTemplateStore());
            return;
        }
        setAlertSettingsDraft(resolveAlertSettingsForProperty(managingProperty.id, managingProperty));
        setCallSettingsDraft(resolveCallSettingsForProperty(managingProperty.id, managingProperty));
        setTaxonomySegments(resolveSegmentsForProperty(managingProperty.id, managingProperty));
        setTaxonomyAccountTypes(resolveAccountTypesForProperty(managingProperty.id, managingProperty));
        setEditSegIdx(null);
        setEditTypeIdx(null);
        setTaxonomyNewSegment('');
        setTaxonomyNewType('');
        setMealPlansList(resolveMealPlansForProperty(managingProperty.id, managingProperty));
        setEventPackagesList(resolveEventPackagesForProperty(managingProperty.id, managingProperty));
        setOccupancyTypesList(resolveOccupancyTypesForProperty(managingProperty.id, managingProperty));
        setPaymentMethodsList(resolvePaymentMethodsForProperty(managingProperty.id, managingProperty));
        setNewOccupancyLabel('');
        setEditOccIdx(null);
        setEditOccVal('');
        setNewPaymentMethodLabel('');
        setEditPaymentIdx(null);
        setEditPaymentVal('');
        setEditMealIdx(null);
        setEditPkgIdx(null);
        setNewMealName('');
        setNewMealCode('');
        setNewPkgName('');
        setNewPkgCode('');
        setNewPkgTimingId('coffee_1');
        setEditCxlId(null);
        setEditCxlLabel('');
        setNewCxlReason('');
        const defaults = buildDefaultFeedbackTemplateStore();
        const overrides = resolveFeedbackTemplatesForProperty(managingProperty);
        setFeedbackTemplatesDraft({
            event: overrides.event || defaults.event,
            accommodation: overrides.accommodation || defaults.accommodation,
            event_rooms: overrides.event_rooms || defaults.event_rooms,
        });
    }, [
        managingProperty?.id,
        managingProperty?.segments,
        managingProperty?.accountTypes,
        managingProperty?.mealPlans,
        managingProperty?.eventPackages,
        managingProperty?.occupancyTypes,
        managingProperty?.paymentMethods,
        managingProperty?.alertSettings,
        managingProperty?.feedbackTemplates,
    ]);

    useEffect(() => {
        if (!managingProperty) return;
        const propId = managingProperty.id;
        setSelectedYearDetails(null);
        setIsEditingFinancials(false);
        setTempYearData(null);

        fetch(apiUrl(`/api/rooms?propertyId=${propId}`))
            .then(res => res.json()).then(data => setRoomTypes(Array.isArray(data) ? data : []));
            
        fetch(apiUrl(`/api/venues?propertyId=${propId}`))
            .then(res => res.json()).then(data => setVenues(Array.isArray(data) ? data : []));

        fetch(apiUrl(`/api/taxes?propertyId=${propId}`))
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data) && data.length > 0) {
                    setTaxes(data);
                } else {
                    setTaxes(defaultTaxesForProperty(String(propId)));
                }
            });

        fetch(apiUrl(`/api/financials?propertyId=${propId}`), { cache: 'no-store' })
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data) && data.length > 0) {
                    setFinancialData(data);
                } else {
                    setFinancialData([{ year: new Date().getFullYear(), months: generateInitialMonths() }]);
                }
            });

        fetch(apiUrl(`/api/cxl-reasons?propertyId=${propId}`))
            .then(res => res.json())
            .then(data => {
                const localRows = loadCxlLocal(propId);
                const normalized = normalizeCxlRows(propId, data);
                if (normalized.length > 0) {
                    setCxlReasons(normalized);
                    persistCxlLocal(propId, normalized);
                } else if (localRows.length > 0) {
                    setCxlReasons(localRows);
                } else {
                    const defaults = DEFAULT_CXL_REASONS.map((label) => ({
                        id: `default-${label}`.replace(/\s+/g, '-').toLowerCase(),
                        label,
                        propertyId: propId,
                    }));
                    setCxlReasons(defaults);
                    persistCxlLocal(propId, defaults);
                }
            })
            .catch(() => {
                const localRows = loadCxlLocal(propId);
                if (localRows.length > 0) {
                    setCxlReasons(localRows);
                    return;
                }
                const defaults = DEFAULT_CXL_REASONS.map((label) => ({
                    id: `default-${label}`.replace(/\s+/g, '-').toLowerCase(),
                    label,
                    propertyId: propId,
                }));
                setCxlReasons(defaults);
                persistCxlLocal(propId, defaults);
            });
    }, [managingProperty]);

    useEffect(() => {
        const mergePatch = (propertyId: string, patch: Record<string, unknown>) => {
            setProperties((prev) =>
                prev.map((p) => (String(p.id) === String(propertyId) ? { ...p, ...patch } : p))
            );
            setManagingProperty((mp: any) =>
                mp && String(mp.id) === String(propertyId) ? { ...mp, ...patch } : mp
            );
        };
        const onTax = (e: Event) => {
            const d = (e as CustomEvent<{ propertyId?: string; segments?: string[]; accountTypes?: string[] }>)
                .detail;
            if (!d?.propertyId) return;
            const patch: Record<string, unknown> = {};
            if (Array.isArray(d.segments)) patch.segments = d.segments;
            if (Array.isArray(d.accountTypes)) patch.accountTypes = d.accountTypes;
            if (Object.keys(patch).length) mergePatch(String(d.propertyId), patch);
        };
        const onMeals = (e: Event) => {
            const d = (e as CustomEvent<{
                propertyId?: string;
                mealPlans?: unknown[];
                eventPackages?: unknown[];
            }>).detail;
            if (!d?.propertyId) return;
            const patch: Record<string, unknown> = {};
            if (Array.isArray(d.mealPlans)) patch.mealPlans = d.mealPlans;
            if (Array.isArray(d.eventPackages)) patch.eventPackages = d.eventPackages;
            if (Object.keys(patch).length) mergePatch(String(d.propertyId), patch);
        };
        const onOcc = (e: Event) => {
            const d = (e as CustomEvent<{ propertyId?: string; occupancyTypes?: string[] }>).detail;
            if (!d?.propertyId || !Array.isArray(d.occupancyTypes)) return;
            mergePatch(String(d.propertyId), { occupancyTypes: d.occupancyTypes });
        };
        const onPaymentMethods = (e: Event) => {
            const d = (e as CustomEvent<{ propertyId?: string; paymentMethods?: string[] }>).detail;
            if (!d?.propertyId || !Array.isArray(d.paymentMethods)) return;
            mergePatch(String(d.propertyId), { paymentMethods: d.paymentMethods });
        };
        window.addEventListener(TAXONOMY_CHANGED_EVENT, onTax);
        window.addEventListener(MEALS_PACKAGES_CHANGED_EVENT, onMeals);
        window.addEventListener(OCCUPANCY_TYPES_CHANGED_EVENT, onOcc);
        window.addEventListener(PAYMENT_METHODS_CHANGED_EVENT, onPaymentMethods);
        return () => {
            window.removeEventListener(TAXONOMY_CHANGED_EVENT, onTax);
            window.removeEventListener(MEALS_PACKAGES_CHANGED_EVENT, onMeals);
            window.removeEventListener(OCCUPANCY_TYPES_CHANGED_EVENT, onOcc);
            window.removeEventListener(PAYMENT_METHODS_CHANGED_EVENT, onPaymentMethods);
        };
    }, []);

    const tabs = appIsAdmin
        ? [
              { id: 'profile', label: 'Settings', icon: User },
              { id: 'property', label: 'Properties', icon: Building },
              { id: 'users', label: 'User Mgmt', icon: Users },
              { id: 'config', label: 'Configurations', icon: SettingsIcon },
          ]
        : [{ id: 'profile', label: 'Settings', icon: User }];

    const propertyTabsList = [
        { id: 'rooms', label: 'Room Types', icon: BedDouble },
        { id: 'venues', label: 'Venues', icon: Layout },
        { id: 'meals_packages', label: 'Meals & Packages', icon: UtensilsCrossed },
        { id: 'financial', label: "Financial & KPI's", icon: TrendingUp },
        { id: 'taxes', label: 'Tax Config', icon: DollarSign },
        { id: 'payment_methods', label: 'Payment Methods', icon: CreditCard },
        { id: 'segments_types', label: 'Segments & Account Types', icon: Tags },
        { id: 'cxl', label: 'CXL', icon: List },
        { id: 'feedback_forms', label: 'Feedback Forms', icon: FileText },
        { id: 'alert_notifications', label: 'Alerts & Notifications', icon: Bell },
        { id: 'calls', label: 'Calls', icon: Phone },
        ...(appIsAdmin ? [{ id: 'users', label: 'User Mgmt', icon: Users }] : []),
    ];

    const renderPropertyTab = () => {
        if (managingProperty) {
            return (
                <div className="space-y-6 animate-in fade-in duration-300">
                    <button onClick={() => setManagingProperty(null)} className="flex items-center gap-2 text-sm font-bold hover:opacity-70 transition-opacity" style={{ color: colors.primary }}>
                        <ChevronLeft size={16} /> Back to Properties List
                    </button>
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            {managingProperty.logoUrl ? (
                                <img
                                    src={managingProperty.logoUrl}
                                    alt={`${managingProperty.name} logo`}
                                    className="w-28 h-16 rounded-lg object-contain border p-1 bg-white/80"
                                    style={{ borderColor: colors.border }}
                                />
                            ) : null}
                            <h2 className="text-2xl font-bold" style={{ color: colors.textMain }}>{managingProperty.name}</h2>
                        </div>
                        <p className="text-sm opacity-60" style={{ color: colors.textMuted }}>Manage settings and modules specific to this property</p>
                    </div>
                    
                    <div className="flex border-b mb-6 overflow-x-auto custom-scrollbar" style={{ borderColor: colors.border }}>
                        {propertyTabsList.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActivePropTab(tab.id)}
                                className={`px-4 py-3 min-w-max flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-all ${activePropTab === tab.id ? 'border-primary' : 'border-transparent opacity-50 hover:opacity-100'}`}
                                style={{ color: activePropTab === tab.id ? colors.primary : colors.textMuted }}
                            >
                                <tab.icon size={14} /> {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className="mt-4">
                        {activePropTab === 'rooms' && renderRoomTypesTab()}
                        {activePropTab === 'venues' && renderVenuesTab()}
                        {activePropTab === 'meals_packages' && renderMealsPackagesTab()}
                        {activePropTab === 'financial' && renderFinancialTab()}
                        {activePropTab === 'taxes' && renderTaxesTab()}
                        {activePropTab === 'payment_methods' && renderPaymentMethodsTab()}
                        {activePropTab === 'segments_types' && renderSegmentsTypesTab()}
                        {activePropTab === 'cxl' && renderCxlTab()}
                        {activePropTab === 'feedback_forms' && renderFeedbackFormsTab()}
                        {activePropTab === 'alert_notifications' && renderAlertsNotificationsTab()}
                        {activePropTab === 'calls' && renderCallsTab()}
                        {activePropTab === 'users' && renderUsersTab()}
                    </div>
                </div>
            );
        }

        return (
        <div className="space-y-4 animate-in fade-in duration-300">
            {properties.map((prop: any) => (
                <div key={prop.id} className="p-4 rounded-xl border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <div className="flex items-center gap-2">
                                {prop.logoUrl ? (
                                    <img
                                        src={prop.logoUrl}
                                        alt={`${prop.name} logo`}
                                        className="w-20 h-12 rounded-md object-contain border p-1 bg-white/80"
                                        style={{ borderColor: colors.border }}
                                    />
                                ) : null}
                                <h2 className="text-lg font-bold" style={{ color: colors.textMain }}>{prop.name}</h2>
                            </div>
                            <p className="text-xs flex items-center gap-1.5 mt-0.5" style={{ color: colors.textMuted }}>
                                <MapPin size={12} /> {prop.city}, {prop.country}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => openModal('property', prop)}
                                className="p-1.5 rounded-lg border hover:bg-white/5 transition-all" style={{ borderColor: colors.border, color: colors.textMuted }}>
                                <Edit size={14} />
                            </button>
                            <button
                                onClick={() => setManagingProperty(prop)}
                                className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-transform hover:scale-105"
                                style={{ backgroundColor: colors.primary, color: '#000' }}>
                                Manage Property
                            </button>
                            <button
                                onClick={() => handleDelete('property', prop.id)}
                                className="p-1.5 rounded-lg border hover:bg-red-500/10 transition-all text-red-500"
                                style={{ borderColor: 'rgba(239, 68, 68, 0.2)' }}
                                title="Delete Property"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
                        <div className="p-3 rounded-lg bg-black/10 border" style={{ borderColor: colors.border }}>
                            <label className="text-[9px] uppercase font-bold tracking-wider opacity-60 mb-1 block" style={{ color: colors.textMuted }}>Contact Email</label>
                            <p className="font-bold text-sm" style={{ color: colors.textMain }}>{prop.email}</p>
                        </div>
                        <div className="p-4 rounded-lg bg-black/10 border" style={{ borderColor: colors.border }}>
                            <label className="text-[9px] uppercase font-bold tracking-wider opacity-60 mb-1 block" style={{ color: colors.textMuted }}>Contact Phone</label>
                            <p className="font-bold text-sm" style={{ color: colors.textMain }}>{prop.phone}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-black/10 border" style={{ borderColor: colors.border }}>
                            <label className="text-[9px] uppercase font-bold tracking-wider opacity-60 mb-1 block" style={{ color: colors.textMuted }}>Inventory</label>
                            <p className="font-bold text-sm" style={{ color: colors.textMain }}>
                                {prop.totalRooms} Rooms
                            </p>
                        </div>
                    </div>

                    {/* Assigned Users Section */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: colors.textMuted }}>
                            <Users size={12} /> Assigned Users
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {users.filter(u => userAssignedToProperty(u, prop.id)).map(user => (
                                <div key={user.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/5 border group relative" style={{ borderColor: colors.border }}>
                                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold" style={{ color: colors.primary }}>
                                        {(user.name || user.username || "?").charAt(0)}
                                    </div>
                                    <span className="text-xs font-medium" style={{ color: colors.textMain }}>{user.name}</span>
                                    <button
                                        onClick={() => handleUnassign(user.id, prop.id)}
                                        className="w-4 h-4 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity ml-1"
                                    >
                                        <Trash2 size={10} />
                                    </button>
                                </div>
                            ))}
                            <button
                                onClick={() => openModal('assignUser', { propertyId: prop.id, selectedUserIds: users.filter(u => userAssignedToProperty(u, prop.id)).map(u => u.id) })}
                                className="px-3 py-1.5 rounded-lg border border-dashed flex items-center justify-center gap-1.5 hover:bg-white/5 transition-colors text-xs font-medium"
                                style={{ borderColor: colors.border, color: colors.textMuted }}>
                                <Plus size={14} /> Assign
                            </button>
                        </div>
                    </div>
                </div>
            ))}

            <button
                onClick={() => openModal('property')}
                className="w-full py-4 rounded-xl border border-dashed flex items-center justify-center gap-2 hover:bg-white/5 transition-all group"
                style={{ borderColor: colors.border, color: colors.textMuted }}>
                <Plus size={20} className="group-hover:scale-110 transition-transform" />
                <span className="text-sm font-bold">Add New Property</span>
            </button>
        </div>
        );
    };

    const renderPaymentMethodsTab = () => {
        const pid = managingProperty?.id;
        if (!pid) return null;

        const persistPaymentMethods = (next: string[]) => {
            savePaymentMethodsForProperty(pid, next);
            setPaymentMethodsList(resolvePaymentMethodsForProperty(pid, { ...managingProperty, paymentMethods: next }));
        };
        const addPaymentMethod = () => {
            const v = newPaymentMethodLabel.trim();
            if (!v) return;
            if (paymentMethodsList.some((x) => x.toLowerCase() === v.toLowerCase())) return;
            persistPaymentMethods([...paymentMethodsList, v]);
            setNewPaymentMethodLabel('');
        };

        return (
            <div className="space-y-6 animate-in fade-in duration-300">
                <div>
                    <h2 className="text-xl font-bold mb-1" style={{ color: colors.textMain }}>Payment methods</h2>
                    <p className="text-sm opacity-70" style={{ color: colors.textMuted }}>
                        Options shown when posting a deposit on requests for{' '}
                        <span className="font-semibold" style={{ color: colors.textMain }}>{managingProperty.name}</span>.
                        Each property can have its own list (e.g. wire transfer, Mada, corporate invoice).
                    </p>
                </div>

                <div className="rounded-xl border overflow-hidden" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                    <div className="p-4 border-b" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                        <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: colors.textMain }}>Deposit payment options</h3>
                    </div>
                    <div className="p-4 space-y-3">
                        <div className="flex gap-2">
                            <input
                                value={newPaymentMethodLabel}
                                onChange={(e) => setNewPaymentMethodLabel(e.target.value)}
                                placeholder="e.g. Wire Transfer, Mada"
                                className="flex-1 px-3 py-2 rounded-lg border text-sm"
                                style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                onKeyDown={(e) => e.key === 'Enter' && addPaymentMethod()}
                            />
                            <button
                                type="button"
                                onClick={addPaymentMethod}
                                className="px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1 shrink-0"
                                style={{ backgroundColor: colors.primary, color: '#000' }}
                            >
                                <Plus size={16} /> Add
                            </button>
                        </div>
                        <ul className="divide-y" style={{ borderColor: colors.border }}>
                            {paymentMethodsList.map((name, i) => (
                                <li key={`pay-${i}-${name}`} className="py-3 flex items-center gap-2 justify-between">
                                    {editPaymentIdx === i ? (
                                        <input
                                            value={editPaymentVal}
                                            onChange={(e) => setEditPaymentVal(e.target.value)}
                                            className="flex-1 px-3 py-1.5 rounded-lg border text-sm"
                                            style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                        />
                                    ) : (
                                        <span className="text-sm font-medium flex-1" style={{ color: colors.textMain }}>{name}</span>
                                    )}
                                    <div className="flex items-center gap-1 shrink-0">
                                        {editPaymentIdx === i ? (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const v = editPaymentVal.trim();
                                                    if (!v) return;
                                                    const next = [...paymentMethodsList];
                                                    const dup = next.some((s, j) => j !== i && s.toLowerCase() === v.toLowerCase());
                                                    if (dup) return;
                                                    next[i] = v;
                                                    persistPaymentMethods(next);
                                                    setEditPaymentIdx(null);
                                                }}
                                                className="p-1.5 rounded hover:bg-white/10"
                                                style={{ color: colors.primary }}
                                            >
                                                <Check size={14} />
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setEditPaymentIdx(i);
                                                    setEditPaymentVal(name);
                                                }}
                                                className="p-1.5 rounded hover:bg-white/10"
                                                style={{ color: colors.textMuted }}
                                            >
                                                <Edit size={14} />
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (editPaymentIdx === i) setEditPaymentIdx(null);
                                                persistPaymentMethods(paymentMethodsList.filter((_, j) => j !== i));
                                            }}
                                            className="p-1.5 rounded hover:bg-red-500/10 text-red-500"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                        {paymentMethodsList.length === 0 && (
                            <p className="text-xs italic opacity-50" style={{ color: colors.textMuted }}>
                                No payment methods configured (system defaults will apply).
                            </p>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const renderSegmentsTypesTab = () => {
        const pid = managingProperty?.id;
        if (!pid) return null;

        const persistSegments = (list: string[]) => {
            saveSegmentsForProperty(pid, list);
            setTaxonomySegments(list);
        };
        const persistTypes = (list: string[]) => {
            saveAccountTypesForProperty(pid, list);
            setTaxonomyAccountTypes(list);
        };

        const addSegment = () => {
            const v = taxonomyNewSegment.trim();
            if (!v || taxonomySegments.includes(v)) return;
            persistSegments([...taxonomySegments, v]);
            setTaxonomyNewSegment('');
        };
        const addType = () => {
            const v = taxonomyNewType.trim();
            if (!v || taxonomyAccountTypes.includes(v)) return;
            persistTypes([...taxonomyAccountTypes, v]);
            setTaxonomyNewType('');
        };

        return (
            <div className="space-y-8 animate-in fade-in duration-300">
                <div>
                    <h2 className="text-xl font-bold mb-1" style={{ color: colors.textMain }}>Segments &amp; account types</h2>
                    <p className="text-sm opacity-70" style={{ color: colors.textMuted }}>
                        Configure lists for <span className="font-semibold" style={{ color: colors.textMain }}>{managingProperty.name}</span>.
                        Segments are used when creating requests and on the dashboard distribution chart. Account types appear on accounts and the account-type chart.
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="rounded-xl border overflow-hidden" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                            <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: colors.textMain }}>Segments</h3>
                        </div>
                        <div className="p-4 space-y-3">
                            <div className="flex gap-2">
                                <input
                                    value={taxonomyNewSegment}
                                    onChange={(e) => setTaxonomyNewSegment(e.target.value)}
                                    placeholder="New segment name..."
                                    className="flex-1 px-3 py-2 rounded-lg border text-sm"
                                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                    onKeyDown={(e) => e.key === 'Enter' && addSegment()}
                                />
                                <button
                                    type="button"
                                    onClick={addSegment}
                                    className="px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1"
                                    style={{ backgroundColor: colors.primary, color: '#000' }}
                                >
                                    <Plus size={16} /> Add
                                </button>
                            </div>
                            <ul className="divide-y" style={{ borderColor: colors.border }}>
                                {taxonomySegments.map((name, i) => (
                                    <li key={`seg-${i}`} className="py-3 flex items-center gap-2 justify-between">
                                        {editSegIdx === i ? (
                                            <input
                                                value={editSegVal}
                                                onChange={(e) => setEditSegVal(e.target.value)}
                                                className="flex-1 px-3 py-1.5 rounded-lg border text-sm"
                                                style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                            />
                                        ) : (
                                            <span className="text-sm font-medium flex-1" style={{ color: colors.textMain }}>{name}</span>
                                        )}
                                        <div className="flex items-center gap-1 shrink-0">
                                            {editSegIdx === i ? (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const v = editSegVal.trim();
                                                        if (!v) return;
                                                        const next = [...taxonomySegments];
                                                        const dup = next.some((s, j) => j !== i && s === v);
                                                        if (dup) return;
                                                        next[i] = v;
                                                        persistSegments(next);
                                                        setEditSegIdx(null);
                                                    }}
                                                    className="p-1.5 rounded hover:bg-white/10"
                                                    style={{ color: colors.primary }}
                                                >
                                                    <Check size={14} />
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => { setEditSegIdx(i); setEditSegVal(name); }}
                                                    className="p-1.5 rounded hover:bg-white/10"
                                                    style={{ color: colors.textMuted }}
                                                >
                                                    <Edit size={14} />
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (editSegIdx === i) setEditSegIdx(null);
                                                    persistSegments(taxonomySegments.filter((_, j) => j !== i));
                                                }}
                                                className="p-1.5 rounded hover:bg-red-500/10 text-red-500"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                            {taxonomySegments.length === 0 && (
                                <p className="text-xs italic opacity-50" style={{ color: colors.textMuted }}>No segments yet.</p>
                            )}
                        </div>
                    </div>

                    <div className="rounded-xl border overflow-hidden" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                            <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: colors.textMain }}>Account types</h3>
                        </div>
                        <div className="p-4 space-y-3">
                            <div className="flex gap-2">
                                <input
                                    value={taxonomyNewType}
                                    onChange={(e) => setTaxonomyNewType(e.target.value)}
                                    placeholder="New account type..."
                                    className="flex-1 px-3 py-2 rounded-lg border text-sm"
                                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                    onKeyDown={(e) => e.key === 'Enter' && addType()}
                                />
                                <button
                                    type="button"
                                    onClick={addType}
                                    className="px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1"
                                    style={{ backgroundColor: colors.primary, color: '#000' }}
                                >
                                    <Plus size={16} /> Add
                                </button>
                            </div>
                            <ul className="divide-y" style={{ borderColor: colors.border }}>
                                {taxonomyAccountTypes.map((name, i) => (
                                    <li key={`typ-${i}`} className="py-3 flex items-center gap-2 justify-between">
                                        {editTypeIdx === i ? (
                                            <input
                                                value={editTypeVal}
                                                onChange={(e) => setEditTypeVal(e.target.value)}
                                                className="flex-1 px-3 py-1.5 rounded-lg border text-sm"
                                                style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                            />
                                        ) : (
                                            <span className="text-sm font-medium flex-1" style={{ color: colors.textMain }}>{name}</span>
                                        )}
                                        <div className="flex items-center gap-1 shrink-0">
                                            {editTypeIdx === i ? (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const v = editTypeVal.trim();
                                                        if (!v) return;
                                                        const next = [...taxonomyAccountTypes];
                                                        const dup = next.some((s, j) => j !== i && s === v);
                                                        if (dup) return;
                                                        next[i] = v;
                                                        persistTypes(next);
                                                        setEditTypeIdx(null);
                                                    }}
                                                    className="p-1.5 rounded hover:bg-white/10"
                                                    style={{ color: colors.primary }}
                                                >
                                                    <Check size={14} />
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => { setEditTypeIdx(i); setEditTypeVal(name); }}
                                                    className="p-1.5 rounded hover:bg-white/10"
                                                    style={{ color: colors.textMuted }}
                                                >
                                                    <Edit size={14} />
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (editTypeIdx === i) setEditTypeIdx(null);
                                                    persistTypes(taxonomyAccountTypes.filter((_, j) => j !== i));
                                                }}
                                                className="p-1.5 rounded hover:bg-red-500/10 text-red-500"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                            {taxonomyAccountTypes.length === 0 && (
                                <p className="text-xs italic opacity-50" style={{ color: colors.textMuted }}>No account types yet.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderMealsPackagesTab = () => {
        const pid = managingProperty?.id;
        if (!pid) return null;

        const persistMeals = (list: MealPlanEntry[]) => {
            saveMealPlansForProperty(pid, list);
            setMealPlansList(list);
        };
        const persistPkgs = (list: EventPackageEntry[]) => {
            saveEventPackagesForProperty(pid, list);
            setEventPackagesList(list);
        };

        const addMeal = () => {
            const name = newMealName.trim();
            const code = newMealCode.trim().toUpperCase();
            if (!name || !code) return;
            if (mealPlansList.some((m) => m.code.toUpperCase() === code)) return;
            persistMeals([...mealPlansList, { id: `mp-${Date.now()}`, name, code }]);
            setNewMealName('');
            setNewMealCode('');
        };

        const addPkg = () => {
            const name = newPkgName.trim();
            const code = newPkgCode.trim();
            if (!name || !code) return;
            if (eventPackagesList.some((p) => p.name === name)) return;
            persistPkgs([
                ...eventPackagesList,
                { id: `ep-${Date.now()}`, name, code, timingId: newPkgTimingId },
            ]);
            setNewPkgName('');
            setNewPkgCode('');
            setNewPkgTimingId('coffee_1');
        };

        return (
            <div className="space-y-8 animate-in fade-in duration-300">
                <div>
                    <h2 className="text-xl font-bold mb-1" style={{ color: colors.textMain }}>Meals &amp; packages</h2>
                    <p className="text-sm opacity-70" style={{ color: colors.textMuted }}>
                        Room <strong>meal plans</strong> (name + code) drive the meal plan dropdown in accommodation requests.{' '}
                        <strong>Event packages</strong> (name + code + timing layout) drive the Section 5 agenda package list and which catering time fields appear per row.
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="rounded-xl border overflow-hidden" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                            <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: colors.textMain }}>Room meal plans</h3>
                        </div>
                        <div className="p-4 space-y-3">
                            <div className="flex flex-col sm:flex-row gap-2">
                                <input
                                    value={newMealName}
                                    onChange={(e) => setNewMealName(e.target.value)}
                                    placeholder="Meal name (e.g. Breakfast)"
                                    className="flex-1 px-3 py-2 rounded-lg border text-sm"
                                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                />
                                <input
                                    value={newMealCode}
                                    onChange={(e) => setNewMealCode(e.target.value)}
                                    placeholder="Code (e.g. BB)"
                                    className="w-full sm:w-28 px-3 py-2 rounded-lg border text-sm font-mono uppercase"
                                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                    onKeyDown={(e) => e.key === 'Enter' && addMeal()}
                                />
                                <button
                                    type="button"
                                    onClick={addMeal}
                                    className="px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-1 shrink-0"
                                    style={{ backgroundColor: colors.primary, color: '#000' }}
                                >
                                    <Plus size={16} /> Add
                                </button>
                            </div>
                            <ul className="divide-y" style={{ borderColor: colors.border }}>
                                {mealPlansList.map((row, i) => (
                                    <li key={row.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
                                        {editMealIdx === i ? (
                                            <div className="flex flex-1 flex-col sm:flex-row gap-2">
                                                <input
                                                    value={editMealName}
                                                    onChange={(e) => setEditMealName(e.target.value)}
                                                    className="flex-1 px-3 py-1.5 rounded-lg border text-sm"
                                                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                                />
                                                <input
                                                    value={editMealCode}
                                                    onChange={(e) => setEditMealCode(e.target.value)}
                                                    className="w-full sm:w-28 px-3 py-1.5 rounded-lg border text-sm font-mono uppercase"
                                                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                                />
                                            </div>
                                        ) : (
                                            <span className="text-sm font-medium flex-1" style={{ color: colors.textMain }}>
                                                {row.name}{' '}
                                                <span className="ml-2 text-xs font-mono opacity-60">({row.code})</span>
                                            </span>
                                        )}
                                        <div className="flex items-center gap-1 shrink-0">
                                            {editMealIdx === i ? (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const name = editMealName.trim();
                                                        const code = editMealCode.trim().toUpperCase();
                                                        if (!name || !code) return;
                                                        const next = [...mealPlansList];
                                                        if (next.some((m, j) => j !== i && m.code.toUpperCase() === code)) return;
                                                        next[i] = { ...next[i], name, code };
                                                        persistMeals(next);
                                                        setEditMealIdx(null);
                                                    }}
                                                    className="p-1.5 rounded hover:bg-white/10"
                                                    style={{ color: colors.primary }}
                                                >
                                                    <Check size={14} />
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setEditMealIdx(i);
                                                        setEditMealName(row.name);
                                                        setEditMealCode(row.code);
                                                    }}
                                                    className="p-1.5 rounded hover:bg-white/10"
                                                    style={{ color: colors.textMuted }}
                                                >
                                                    <Edit size={14} />
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (editMealIdx === i) setEditMealIdx(null);
                                                    persistMeals(mealPlansList.filter((_, j) => j !== i));
                                                }}
                                                className="p-1.5 rounded hover:bg-red-500/10 text-red-500"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                            {mealPlansList.length === 0 && (
                                <p className="text-xs italic opacity-50" style={{ color: colors.textMuted }}>No meal plans yet.</p>
                            )}
                        </div>
                    </div>

                    <div className="rounded-xl border overflow-hidden" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                            <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: colors.textMain }}>Event packages</h3>
                        </div>
                        <div className="p-4 space-y-3">
                            <div className="space-y-2">
                                <div className="flex flex-col gap-2">
                                    <input
                                        value={newPkgName}
                                        onChange={(e) => setNewPkgName(e.target.value)}
                                        placeholder="Package name"
                                        className="w-full px-3 py-2 rounded-lg border text-sm"
                                        style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                    />
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <input
                                            value={newPkgCode}
                                            onChange={(e) => setNewPkgCode(e.target.value)}
                                            placeholder="Code (e.g. CB)"
                                            className="w-full sm:w-32 px-3 py-2 rounded-lg border text-sm font-mono"
                                            style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                        />
                                        <select
                                            value={newPkgTimingId}
                                            onChange={(e) => setNewPkgTimingId(e.target.value as EventPackageTimingId)}
                                            className="flex-1 px-3 py-2 rounded-lg border text-xs"
                                            style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                        >
                                            {EVENT_PACKAGE_TIMING_OPTIONS.map((o) => (
                                                <option key={o.id} value={o.id}>{o.label}</option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            onClick={addPkg}
                                            className="px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-1 shrink-0"
                                            style={{ backgroundColor: colors.primary, color: '#000' }}
                                        >
                                            <Plus size={16} /> Add
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <ul className="divide-y" style={{ borderColor: colors.border }}>
                                {eventPackagesList.map((row, i) => (
                                    <li key={row.id} className="py-3 space-y-2">
                                        {editPkgIdx === i ? (
                                            <div className="space-y-2">
                                                <input
                                                    value={editPkgName}
                                                    onChange={(e) => setEditPkgName(e.target.value)}
                                                    className="w-full px-3 py-1.5 rounded-lg border text-sm"
                                                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                                />
                                                <div className="flex flex-col sm:flex-row gap-2">
                                                    <input
                                                        value={editPkgCode}
                                                        onChange={(e) => setEditPkgCode(e.target.value)}
                                                        className="w-full sm:w-28 px-3 py-1.5 rounded-lg border text-sm font-mono"
                                                        style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                                    />
                                                    <select
                                                        value={editPkgTimingId}
                                                        onChange={(e) => setEditPkgTimingId(e.target.value as EventPackageTimingId)}
                                                        className="flex-1 px-3 py-1.5 rounded-lg border text-xs"
                                                        style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                                    >
                                                        {EVENT_PACKAGE_TIMING_OPTIONS.map((o) => (
                                                            <option key={o.id} value={o.id}>{o.label}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-1">
                                                <span className="text-sm font-medium" style={{ color: colors.textMain }}>
                                                    {row.name}{' '}
                                                    <span className="ml-2 text-xs font-mono opacity-60">({row.code})</span>
                                                </span>
                                                <span className="text-[10px] uppercase tracking-wider opacity-50" style={{ color: colors.textMuted }}>
                                                    {EVENT_PACKAGE_TIMING_OPTIONS.find((o) => o.id === row.timingId)?.label || row.timingId}
                                                </span>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-1 justify-end">
                                            {editPkgIdx === i ? (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const name = editPkgName.trim();
                                                        const code = editPkgCode.trim();
                                                        if (!name || !code) return;
                                                        const next = [...eventPackagesList];
                                                        if (next.some((p, j) => j !== i && p.name === name)) return;
                                                        next[i] = { ...next[i], name, code, timingId: editPkgTimingId };
                                                        persistPkgs(next);
                                                        setEditPkgIdx(null);
                                                    }}
                                                    className="p-1.5 rounded hover:bg-white/10"
                                                    style={{ color: colors.primary }}
                                                >
                                                    <Check size={14} />
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setEditPkgIdx(i);
                                                        setEditPkgName(row.name);
                                                        setEditPkgCode(row.code);
                                                        setEditPkgTimingId(row.timingId);
                                                    }}
                                                    className="p-1.5 rounded hover:bg-white/10"
                                                    style={{ color: colors.textMuted }}
                                                >
                                                    <Edit size={14} />
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (editPkgIdx === i) setEditPkgIdx(null);
                                                    persistPkgs(eventPackagesList.filter((_, j) => j !== i));
                                                }}
                                                className="p-1.5 rounded hover:bg-red-500/10 text-red-500"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                            {eventPackagesList.length === 0 && (
                                <p className="text-xs italic opacity-50" style={{ color: colors.textMuted }}>No event packages yet.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderRoomTypesTab = () => {
        const pid = managingProperty?.id;
        const persistOccupancyTypes = (next: string[]) => {
            if (!pid) return;
            saveOccupancyTypesForProperty(pid, next);
            setOccupancyTypesList(resolveOccupancyTypesForProperty(pid, { ...managingProperty, occupancyTypes: next }));
        };
        const addOccupancyType = () => {
            const v = newOccupancyLabel.trim();
            if (!v) return;
            if (occupancyTypesList.some((x) => x.toLowerCase() === v.toLowerCase())) return;
            persistOccupancyTypes([...occupancyTypesList, v]);
            setNewOccupancyLabel('');
        };
        return (
            <div className="space-y-6 animate-in fade-in duration-300">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold" style={{ color: colors.textMain }}>Room Types Configuration</h2>
                    <button
                        onClick={() => openModal('room')}
                        className="px-4 py-2 rounded flex items-center gap-2 hover:brightness-110 transition-all text-sm font-bold"
                        style={{ backgroundColor: colors.primary, color: '#000' }}>
                        <Plus size={16} /> Add Room Type
                    </button>
                </div>
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: colors.border }}>
                    <table className="w-full text-left">
                        <thead style={{ backgroundColor: colors.bg }}>
                            <tr>
                                <th className="p-4 text-xs font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>Room Type</th>
                                <th className="p-4 text-xs font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>Size</th>
                                <th className="p-4 text-xs font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>Capacity</th>
                                <th className="p-4 text-xs font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>Inventory</th>
                                <th className="p-4 text-xs font-bold uppercase tracking-wider text-right" style={{ color: colors.textMuted }}>Base Rate</th>
                                <th className="p-4 text-xs font-bold uppercase tracking-wider text-right" style={{ color: colors.textMuted }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y" style={{ borderColor: colors.border }}>
                            {safeRoomTypes.map((room) => (
                                <tr key={room.id} className="hover:bg-white/5 transition-colors">
                                    <td className="p-4 font-medium" style={{ color: colors.textMain }}>{room.name}</td>
                                    <td className="p-4 text-sm font-mono" style={{ color: colors.primary }}>{room.size || '-'}</td>
                                    <td className="p-4 text-sm" style={{ color: colors.textMain }}>{room.capacity} Pax</td>
                                    <td className="p-4 text-sm" style={{ color: colors.textMain }}>
                                        <span className="px-2 py-1 rounded bg-black/20 border" style={{ borderColor: colors.border }}>
                                            {room.count} Rooms
                                        </span>
                                    </td>
                                    <td className="p-4 text-right font-mono text-sm" style={{ color: colors.primary }}>{formatMoney(Number(room.baseRate || 0), 0)}</td>
                                    <td className="p-4 text-right">
                                        <button
                                            onClick={() => openModal('room', room)}
                                            className="p-1.5 rounded hover:bg-white/10 mr-2" style={{ color: colors.textMuted }}><Edit size={14} /></button>
                                        <button
                                            onClick={() => handleDelete('room', room.id)}
                                            className="p-1.5 rounded hover:bg-red-500/10" style={{ color: colors.red }}><Trash2 size={14} /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="rounded-xl border overflow-hidden" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                    <div className="p-4 border-b" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                        <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: colors.textMain }}>Occupancy types</h3>
                        <p className="text-xs mt-1 opacity-70" style={{ color: colors.textMuted }}>
                            Labels for the occupancy dropdown on each room row (accommodation, series group, event + rooms). Defaults: Single, Double, Triple, Quad — add e.g. Twin for this property.
                        </p>
                    </div>
                    <div className="p-4 space-y-3">
                        <div className="flex gap-2">
                            <input
                                value={newOccupancyLabel}
                                onChange={(e) => setNewOccupancyLabel(e.target.value)}
                                placeholder="e.g. Twin"
                                className="flex-1 px-3 py-2 rounded-lg border text-sm"
                                style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                onKeyDown={(e) => e.key === 'Enter' && addOccupancyType()}
                            />
                            <button
                                type="button"
                                onClick={addOccupancyType}
                                className="px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1 shrink-0"
                                style={{ backgroundColor: colors.primary, color: '#000' }}
                            >
                                <Plus size={16} /> Add
                            </button>
                        </div>
                        <ul className="divide-y" style={{ borderColor: colors.border }}>
                            {occupancyTypesList.map((name, i) => (
                                <li key={`occ-${i}-${name}`} className="py-3 flex items-center gap-2 justify-between">
                                    {editOccIdx === i ? (
                                        <input
                                            value={editOccVal}
                                            onChange={(e) => setEditOccVal(e.target.value)}
                                            className="flex-1 px-3 py-1.5 rounded-lg border text-sm"
                                            style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                        />
                                    ) : (
                                        <span className="text-sm font-medium flex-1" style={{ color: colors.textMain }}>{name}</span>
                                    )}
                                    <div className="flex items-center gap-1 shrink-0">
                                        {editOccIdx === i ? (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const v = editOccVal.trim();
                                                    if (!v) return;
                                                    const next = [...occupancyTypesList];
                                                    const dup = next.some((s, j) => j !== i && s.toLowerCase() === v.toLowerCase());
                                                    if (dup) return;
                                                    next[i] = v;
                                                    persistOccupancyTypes(next);
                                                    setEditOccIdx(null);
                                                }}
                                                className="p-1.5 rounded hover:bg-white/10"
                                                style={{ color: colors.primary }}
                                            >
                                                <Check size={14} />
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setEditOccIdx(i);
                                                    setEditOccVal(name);
                                                }}
                                                className="p-1.5 rounded hover:bg-white/10"
                                                style={{ color: colors.textMuted }}
                                            >
                                                <Edit size={14} />
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (editOccIdx === i) setEditOccIdx(null);
                                                persistOccupancyTypes(occupancyTypesList.filter((_, j) => j !== i));
                                            }}
                                            className="p-1.5 rounded hover:bg-red-500/10 text-red-500"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                        {occupancyTypesList.length === 0 && (
                            <p className="text-xs italic opacity-50" style={{ color: colors.textMuted }}>No occupancy types (defaults will apply).</p>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const renderVenuesTab = () => (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold" style={{ color: colors.textMain }}>Venue Management</h2>
                <button
                    onClick={() => openModal('venue')}
                    className="px-4 py-2 rounded flex items-center gap-2 hover:brightness-110 transition-all text-sm font-bold"
                    style={{ backgroundColor: colors.primary, color: '#000' }}>
                    <Plus size={16} /> Add Venue
                </button>
            </div>
            <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                <table className="w-full text-left">
                    <thead style={{ backgroundColor: colors.bg }}>
                        <tr>
                            <th className="p-4 text-xs font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>Venue Name / Dimensions</th>
                            <th className="p-4 text-xs font-bold uppercase tracking-wider text-center" style={{ color: colors.textMuted }}>Capacity</th>
                            <th className="p-4 text-xs font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>Available Shapes & Setups</th>
                            <th className="p-4 text-xs font-bold uppercase tracking-wider text-right" style={{ color: colors.textMuted }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: colors.border }}>
                        {safeVenues.map((venue) => (
                            <tr key={venue.id} className="hover:bg-white/5 transition-colors">
                                <td className="p-4">
                                    <div className="flex items-center gap-2">
                                        <p className="font-bold" style={{ color: colors.textMain }}>{venue.name}</p>
                                        {venue.isCombined && (
                                            <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-500 border border-emerald-500/10">
                                                Combined
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[10px] mt-1 font-mono" style={{ color: colors.textMuted }}>
                                        {venue.width}m x {venue.length || venue.height || 0}m ({venue.area}m²) {venue.height && venue.length && `· C: ${venue.height}m`}
                                    </p>
                                </td>
                                <td className="p-4 text-center">
                                    <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: colors.primary + '20', color: colors.primary }}>
                                        {venue.capacity} Pax
                                    </span>
                                </td>
                                <td className="p-4">
                                    <div className="flex flex-wrap gap-2">
                                        {venue.shapes.map((shape: any, idx: number) => (
                                            <div key={idx} className="px-2 py-1 rounded bg-black/20 border flex items-center gap-2" style={{ borderColor: colors.border }}>
                                                <span className="text-[10px] font-bold" style={{ color: colors.textMain }}>{shape.name}</span>
                                                <span className="text-[9px] font-mono opacity-60" style={{ color: colors.textMuted }}>{shape.capacity}</span>
                                            </div>
                                        ))}
                                    </div>
                                </td>
                                <td className="p-4 text-right">
                                    <button
                                        onClick={() => openModal('venue', venue)}
                                        className="p-1.5 rounded hover:bg-white/10 mr-2" style={{ color: colors.textMuted }}><Edit size={14} /></button>
                                    <button
                                        onClick={() => handleDelete('venue', venue.id)}
                                        className="p-1.5 rounded hover:bg-red-500/10" style={{ color: colors.red }}><Trash2 size={14} /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );

    const renderTaxesTab = () => (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold" style={{ color: colors.textMain }}>Tax & Fee Configuration</h2>
                <div className="flex items-center gap-3">
                    {saveStatus === 'saved' && <span className="text-[10px] font-bold text-emerald-500 animate-pulse">SAVED SUCCESSFULLY!</span>}
                    {saveStatus === 'error' && <span className="text-[10px] font-bold text-red-500">ERROR SAVING!</span>}
                    <button
                        onClick={handleSaveTaxes}
                        disabled={saveStatus === 'saving'}
                        className="px-6 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl flex items-center gap-2 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
                        style={{ backgroundColor: colors.primary, color: '#000' }}
                    >
                        {saveStatus === 'saving' ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                        {saveStatus === 'saving' ? 'Saving...' : 'Save Configuration'}
                    </button>
                </div>
            </div>
            
            <div className="space-y-6">
                {safeTaxes.map((tax, idx) => (
                    <div key={tax.id} className="p-6 rounded-xl border flex flex-col md:flex-row gap-6" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        {/* Details */}
                        <div className="flex-1">
                            <div className="flex items-center justify-between mb-2">
                                <label className="font-bold text-sm uppercase tracking-wider" style={{ color: colors.textMain }}>{tax.label}</label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        value={tax.rate}
                                        onChange={(e) => {
                                            const newTaxes = Array.isArray(taxes) ? [...taxes] : [];
                                            if (!newTaxes[idx]) newTaxes[idx] = { ...tax, scope: { ...tax.scope } };
                                            newTaxes[idx].rate = Number(e.target.value);
                                            setTaxes(newTaxes);
                                        }}
                                        className="w-16 px-2 py-1 rounded border bg-black/20 text-right outline-none text-sm"
                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                    />
                                    <span className="text-sm" style={{ color: colors.textMuted }}>%</span>
                                </div>
                            </div>
                        </div>
                        {/* Scope */}
                        <div className="flex-1 border-l pl-6" style={{ borderColor: colors.border }}>
                            <label className="block text-[10px] font-bold uppercase tracking-wider mb-3 opacity-70" style={{ color: colors.textMuted }}>Applied To Scope</label>
                            <div className="flex flex-wrap gap-3">
                                {(Object.entries(tax.scope || {}) as [string, boolean][]).map(([scopeKey, enabled]) => (
                                    <label key={scopeKey} className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
                                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${enabled ? 'bg-primary border-primary' : 'bg-transparent'}`}
                                            style={{ borderColor: enabled ? colors.primary : colors.textMuted }}>
                                            {enabled && <Check size={10} className="text-black" />}
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={enabled}
                                            onChange={() => {
                                                const newTaxes = Array.isArray(taxes) ? [...taxes] : [];
                                                if (!newTaxes[idx]) newTaxes[idx] = { ...tax, scope: { ...tax.scope } };
                                                // @ts-ignore
                                                newTaxes[idx].scope[scopeKey] = !enabled;
                                                setTaxes(newTaxes);
                                            }}
                                            className="hidden"
                                        />
                                        <span className="text-xs" style={{ color: colors.textMain }}>
                                            {scopeKey === 'foodAndBeverage' ? 'Food and Beverage' : scopeKey.charAt(0).toUpperCase() + scopeKey.slice(1)}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderCxlTab = () => {
        const propId = managingProperty?.id;
        if (!propId) return null;

        const saveReason = async (label: string, id?: string) => {
            const clean = String(label || '').trim();
            if (!clean) return null;
            const payload: any = { label: clean, reason: clean, propertyId: propId };
            if (id) payload.id = id;
            const res = await fetch(apiUrl('/api/cxl-reasons'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error('Failed to save cancellation reason');
            return res.json();
        };

        const handleAddReason = async () => {
            const clean = String(newCxlReason || '').trim();
            if (!clean) return;
            const exists = cxlReasons.some((row: any) => String(row?.label || '').toLowerCase() === clean.toLowerCase());
            if (exists) return;
            const tempRow = {
                id: `local-${Date.now()}`,
                label: clean,
                reason: clean,
                propertyId: propId,
            };
            const optimisticRows = [...cxlReasons, tempRow];
            setCxlReasons(optimisticRows);
            persistCxlLocal(propId, optimisticRows);
            setNewCxlReason('');
            try {
                const saved = await saveReason(clean);
                if (!saved || !saved.id) return;
                setCxlReasons((prev: any[]) => {
                    const next = prev.map((row: any) => (String(row.id) === String(tempRow.id) ? saved : row));
                    persistCxlLocal(propId, next);
                    return next;
                });
            } catch (err) {
                console.error('Error adding cancellation reason:', err);
            }
        };

        const handleSaveEditReason = async (id: string) => {
            const clean = String(editCxlLabel || '').trim();
            if (!clean) return;
            setCxlReasons((prev: any[]) => {
                const next = prev.map((row: any) =>
                    String(row.id) === String(id)
                        ? { ...row, label: clean, reason: clean }
                        : row
                );
                persistCxlLocal(propId, next);
                return next;
            });
            setEditCxlId(null);
            setEditCxlLabel('');
            try {
                const saved = await saveReason(clean, id);
                if (!saved || !saved.id) return;
                setCxlReasons((prev: any[]) => {
                    const next = prev.map((row: any) => (String(row.id) === String(id) ? saved : row));
                    persistCxlLocal(propId, next);
                    return next;
                });
            } catch (err) {
                console.error('Error editing cancellation reason:', err);
            }
        };

        const handleDeleteReason = async (id: string) => {
            if (!window.confirm('Delete this cancellation reason?')) return;
            setCxlReasons((prev: any[]) => {
                const next = prev.filter((row: any) => String(row.id) !== String(id));
                persistCxlLocal(propId, next);
                return next;
            });
            if (editCxlId === id) {
                setEditCxlId(null);
                setEditCxlLabel('');
            }
            try {
                await fetch(apiUrl(`/api/cxl-reasons/${id}?propertyId=${encodeURIComponent(String(propId))}`), { method: 'DELETE' });
            } catch (err) {
                console.error('Error deleting cancellation reason:', err);
            }
        };

        return (
            <div className="space-y-6 animate-in fade-in duration-300">
                <div>
                    <h2 className="text-xl font-bold" style={{ color: colors.textMain }}>Cancellation Reasons (CXL)</h2>
                    <p className="text-sm mt-1" style={{ color: colors.textMuted }}>
                        Manage property-specific reasons shown in the cancellation popup.
                    </p>
                </div>

                <div className="p-4 rounded-xl border flex items-center gap-3" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                    <input
                        value={newCxlReason}
                        onChange={(e) => setNewCxlReason(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddReason();
                            }
                        }}
                        placeholder="Add new cancellation reason..."
                        className="flex-1 px-4 py-3 rounded-xl border bg-black/20 outline-none"
                        style={{ borderColor: colors.border, color: colors.textMain }}
                    />
                    <button
                        onClick={handleAddReason}
                        className="px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 hover:brightness-110 transition-all"
                        style={{ backgroundColor: colors.primary, color: '#000' }}
                    >
                        <Plus size={14} /> Add
                    </button>
                </div>

                <div className="rounded-xl border overflow-hidden" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                    <table className="w-full text-left">
                        <thead style={{ backgroundColor: colors.bg }}>
                            <tr>
                                <th className="p-4 text-xs font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>Reason</th>
                                <th className="p-4 text-xs font-bold uppercase tracking-wider text-right" style={{ color: colors.textMuted }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y" style={{ borderColor: colors.border }}>
                            {cxlReasons.map((row: any) => {
                                const rowId = String(row.id || '');
                                const isEditing = editCxlId === rowId;
                                return (
                                    <tr key={rowId || row.label} className="hover:bg-white/5 transition-colors">
                                        <td className="p-4">
                                            {isEditing ? (
                                                <input
                                                    value={editCxlLabel}
                                                    onChange={(e) => setEditCxlLabel(e.target.value)}
                                                    className="w-full px-3 py-2 rounded-lg border bg-black/20 outline-none"
                                                    style={{ borderColor: colors.border, color: colors.textMain }}
                                                />
                                            ) : (
                                                <span className="font-medium" style={{ color: colors.textMain }}>{row.label}</span>
                                            )}
                                        </td>
                                        <td className="p-4 text-right">
                                            {isEditing ? (
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => handleSaveEditReason(rowId)}
                                                        className="px-3 py-1.5 rounded-lg text-xs font-bold border"
                                                        style={{ borderColor: colors.primary, color: colors.primary }}
                                                    >
                                                        Save
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setEditCxlId(null);
                                                            setEditCxlLabel('');
                                                        }}
                                                        className="px-3 py-1.5 rounded-lg text-xs font-bold border"
                                                        style={{ borderColor: colors.border, color: colors.textMuted }}
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => {
                                                            setEditCxlId(rowId);
                                                            setEditCxlLabel(String(row.label || ''));
                                                        }}
                                                        className="p-1.5 rounded hover:bg-white/10"
                                                        style={{ color: colors.textMuted }}
                                                        title="Edit reason"
                                                    >
                                                        <Edit size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteReason(rowId)}
                                                        className="p-1.5 rounded hover:bg-red-500/10"
                                                        style={{ color: colors.red }}
                                                        title="Delete reason"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const renderAlertsNotificationsTab = () => {
        const propId = managingProperty?.id;
        if (!propId) return null;

        const patchRow = (kind: SystemAlertKind, field: 'enabled' | 'createTask', value: boolean) => {
            setAlertSettingsDraft((prev) => {
                const cur = prev[kind];
                const nextRow =
                    field === 'enabled'
                        ? { ...cur, enabled: value, createTask: value ? cur.createTask : false }
                        : { ...cur, createTask: value };
                return { ...prev, [kind]: nextRow };
            });
        };

        const patchDeadlineRule = (kind: DeadlineAlertKind, patch: Partial<DeadlineAlertRuleSettings>) => {
            setAlertSettingsDraft((prev) => ({
                ...prev,
                [kind]: { ...(prev[kind] as DeadlineAlertRuleSettings), ...patch },
            }));
        };

        const toggleStatus = (kind: DeadlineAlertKind, status: string) => {
            setAlertSettingsDraft((prev) => {
                const cur = prev[kind] as DeadlineAlertRuleSettings;
                const has = cur.linkedStatuses.includes(status);
                const next = has
                    ? cur.linkedStatuses.filter((s) => s !== status)
                    : [...cur.linkedStatuses, status];
                return { ...prev, [kind]: { ...cur, linkedStatuses: next } };
            });
        };

        const toggleOffset = (kind: DeadlineAlertKind, offset: number) => {
            setAlertSettingsDraft((prev) => {
                const cur = prev[kind] as DeadlineAlertRuleSettings;
                const has = cur.offsets.includes(offset);
                const next = has
                    ? cur.offsets.filter((o) => o !== offset)
                    : [...cur.offsets, offset].sort((a, b) => a - b);
                return { ...prev, [kind]: { ...cur, offsets: next } };
            });
        };

        const handleSaveAlertSettings = async () => {
            setAlertSettingsSaveStatus('saving');
            try {
                const clean = mergePropertyAlertSettings(alertSettingsDraft);
                const ok = await saveAlertSettingsForProperty(propId, clean);
                if (!ok) throw new Error('save failed');
                const nextProp = { ...managingProperty, alertSettings: clean };
                setManagingProperty(nextProp);
                setProperties((prev: any[]) => prev.map((p: any) => (p.id === propId ? { ...p, alertSettings: clean } : p)));
                setAlertSettingsSaveStatus('saved');
                setTimeout(() => setAlertSettingsSaveStatus('idle'), 3000);
            } catch (err) {
                console.error('Error saving alert settings:', err);
                setAlertSettingsSaveStatus('error');
            }
        };

        return (
            <div className="space-y-6 animate-in fade-in duration-300">
                <div className="flex flex-col gap-4 lg:flex-row lg:justify-between lg:items-start">
                    <div className="min-w-0 flex-1">
                        <h2 className="text-xl font-bold" style={{ color: colors.textMain }}>Alerts &amp; notifications</h2>
                        <p className="text-sm mt-1 max-w-3xl" style={{ color: colors.textMuted }}>
                            Control which automated request alerts run for this property. When Auto-task is on, the system creates a task assigned to the
                            request owner (subject, description, client, priority, due date) while the alert is active. New alert types added in code appear here automatically.
                        </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        {alertSettingsSaveStatus === 'saved' && (
                            <span className="text-[10px] font-bold text-emerald-500 animate-pulse">SAVED SUCCESSFULLY!</span>
                        )}
                        {alertSettingsSaveStatus === 'error' && (
                            <span className="text-[10px] font-bold text-red-500">ERROR SAVING!</span>
                        )}
                        <button
                            type="button"
                            onClick={handleSaveAlertSettings}
                            disabled={alertSettingsSaveStatus === 'saving'}
                            className="px-6 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl flex items-center gap-2 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
                            style={{ backgroundColor: colors.primary, color: '#000' }}
                        >
                            {alertSettingsSaveStatus === 'saving' ? (
                                <RefreshCw size={14} className="animate-spin" />
                            ) : (
                                <Save size={14} />
                            )}
                            {alertSettingsSaveStatus === 'saving' ? 'Saving...' : 'Save configuration'}
                        </button>
                    </div>
                </div>

                <div className="space-y-4">
                    <h3 className="text-sm font-bold uppercase tracking-widest" style={{ color: colors.textMuted }}>
                        Deadline alert rules
                    </h3>
                    <p className="text-xs -mt-2" style={{ color: colors.textMuted }}>
                        These reflect the current system behavior by default. Change linked statuses, trigger days, message,
                        tag, or accent color, then Save. Urgent escalation (red, &quot;Urgent.&quot; prefix) and the
                        &quot;X days left&quot; wording are added automatically near the deadline.
                    </p>
                    {DEADLINE_ALERT_KINDS.map((kind) => {
                        const def = ALERT_TYPE_REGISTRY.find((d) => d.kind === kind)!;
                        const rule = alertSettingsDraft[kind] as DeadlineAlertRuleSettings;
                        return (
                            <div
                                key={kind}
                                className="rounded-xl border p-4 space-y-4"
                                style={{ borderColor: colors.border, backgroundColor: colors.card }}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="font-bold text-sm" style={{ color: colors.textMain }}>{def.title}</div>
                                        <p className="text-xs mt-1" style={{ color: colors.textMuted }}>{def.description}</p>
                                    </div>
                                    <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest shrink-0" style={{ color: colors.textMuted }}>
                                        <input
                                            type="checkbox"
                                            checked={rule.enabled}
                                            onChange={(e) => patchDeadlineRule(kind, { enabled: e.target.checked, createTask: e.target.checked ? rule.createTask : false })}
                                            className="w-4 h-4 rounded border cursor-pointer"
                                            style={{ accentColor: colors.primary, borderColor: colors.border }}
                                        />
                                        Active
                                    </label>
                                </div>

                                <div className={`grid gap-4 md:grid-cols-2 ${rule.enabled ? '' : 'opacity-40 pointer-events-none'}`}>
                                    <div>
                                        <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: colors.textMuted }}>Linked statuses</div>
                                        <div className="flex flex-wrap gap-2">
                                            {REQUEST_STATUS_OPTIONS.map((st) => (
                                                <label key={st} className="flex items-center gap-1.5 text-xs cursor-pointer px-2 py-1 rounded-lg border" style={{ borderColor: colors.border, color: colors.textMain }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={rule.linkedStatuses.includes(st)}
                                                        onChange={() => toggleStatus(kind, st)}
                                                        className="w-3.5 h-3.5 rounded cursor-pointer"
                                                        style={{ accentColor: colors.primary }}
                                                    />
                                                    {st}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: colors.textMuted }}>Trigger days</div>
                                        <div className="flex flex-wrap gap-2">
                                            {DEADLINE_OFFSET_OPTIONS.map((opt) => (
                                                <label key={opt.value} className="flex items-center gap-1.5 text-xs cursor-pointer px-2 py-1 rounded-lg border" style={{ borderColor: colors.border, color: colors.textMain }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={rule.offsets.includes(opt.value)}
                                                        onChange={() => toggleOffset(kind, opt.value)}
                                                        className="w-3.5 h-3.5 rounded cursor-pointer"
                                                        style={{ accentColor: colors.primary }}
                                                    />
                                                    {opt.label}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="md:col-span-2">
                                        <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: colors.textMuted }}>Message</div>
                                        <input
                                            type="text"
                                            value={rule.message}
                                            onChange={(e) => patchDeadlineRule(kind, { message: e.target.value })}
                                            className="w-full px-3 py-2 rounded-lg border text-sm"
                                            style={{ borderColor: colors.border, backgroundColor: colors.bg, color: colors.textMain }}
                                        />
                                        <p className="text-[10px] mt-1" style={{ color: colors.textMuted }}>Tokens: {'{contact}'} {'{request}'} {'{account}'} {'{days}'}</p>
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: colors.textMuted }}>Tag (optional)</div>
                                        <input
                                            type="text"
                                            value={rule.tag}
                                            placeholder="e.g. Urgent"
                                            onChange={(e) => patchDeadlineRule(kind, { tag: e.target.value })}
                                            className="w-full px-3 py-2 rounded-lg border text-sm"
                                            style={{ borderColor: colors.border, backgroundColor: colors.bg, color: colors.textMain }}
                                        />
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: colors.textMuted }}>Accent color</div>
                                        <select
                                            value={rule.accent}
                                            onChange={(e) => patchDeadlineRule(kind, { accent: e.target.value as DeadlineAlertRuleSettings['accent'] })}
                                            className="w-full px-3 py-2 rounded-lg border text-sm"
                                            style={{ borderColor: colors.border, backgroundColor: colors.bg, color: colors.textMain }}
                                        >
                                            {DEADLINE_ACCENT_OPTIONS.map((o) => (
                                                <option key={o.value} value={o.value}>{o.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <label className="flex items-center gap-2 text-xs" style={{ color: colors.textMain }}>
                                        <input
                                            type="checkbox"
                                            checked={rule.createTask}
                                            onChange={(e) => patchDeadlineRule(kind, { createTask: e.target.checked })}
                                            className="w-4 h-4 rounded border cursor-pointer"
                                            style={{ accentColor: colors.primary, borderColor: colors.border }}
                                        />
                                        Auto-task for request owner
                                    </label>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="rounded-xl border overflow-hidden" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                    <table className="w-full text-left">
                        <thead style={{ backgroundColor: colors.bg }}>
                            <tr>
                                <th className="p-4 text-[10px] uppercase font-bold tracking-widest" style={{ color: colors.textMuted }}>Alert type</th>
                                <th className="p-4 text-[10px] uppercase font-bold tracking-widest text-center w-28" style={{ color: colors.textMuted }}>Active</th>
                                <th className="p-4 text-[10px] uppercase font-bold tracking-widest text-center w-44" style={{ color: colors.textMuted }}>Auto-task (owner)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y" style={{ borderColor: colors.border }}>
                            {ALERT_TYPE_REGISTRY.filter((def) => !(DEADLINE_ALERT_KINDS as readonly string[]).includes(def.kind)).map((def) => {
                                const row = alertSettingsDraft[def.kind];
                                return (
                                    <tr key={def.kind} className="hover:bg-white/5 transition-colors align-top">
                                        <td className="p-4">
                                            <div className="font-bold text-sm" style={{ color: colors.textMain }}>{def.title}</div>
                                            <p className="text-xs mt-1 leading-relaxed" style={{ color: colors.textMuted }}>{def.description}</p>
                                        </td>
                                        <td className="p-4 text-center">
                                            <input
                                                type="checkbox"
                                                checked={row.enabled}
                                                onChange={(e) => patchRow(def.kind, 'enabled', e.target.checked)}
                                                className="w-4 h-4 rounded border cursor-pointer align-middle"
                                                style={{ accentColor: colors.primary, borderColor: colors.border }}
                                            />
                                        </td>
                                        <td className="p-4 text-center">
                                            <input
                                                type="checkbox"
                                                disabled={!row.enabled}
                                                checked={row.createTask}
                                                onChange={(e) => patchRow(def.kind, 'createTask', e.target.checked)}
                                                className="w-4 h-4 rounded border cursor-pointer align-middle disabled:opacity-40 disabled:cursor-not-allowed"
                                                style={{ accentColor: colors.primary, borderColor: colors.border }}
                                                title={!row.enabled ? 'Turn on the alert type first' : 'Create task for request owner when this alert fires'}
                                            />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <details className="rounded-xl border p-4" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                    <summary className="text-sm font-bold cursor-pointer" style={{ color: colors.textMain }}>
                        How &quot;Post-stay / post-event client feedback&quot; works (rules)
                    </summary>
                    <div className="mt-3 text-xs space-y-2 leading-relaxed" style={{ color: colors.textMuted }}>
                        <p>
                            <span className="font-bold" style={{ color: colors.textMain }}>When it can appear.</span>{' '}
                            The request must not be Cancelled or Lost. The system picks the latest relevant end date for the stay or event
                            (checkout, last room departure, agenda dates, or MICE event window end). The alert is eligible from the{' '}
                            <span className="font-semibold" style={{ color: colors.textMain }}>first calendar day after</span> that end date,
                            through <span className="font-semibold" style={{ color: colors.textMain }}>{CLIENT_FEEDBACK_LOOKBACK_DAYS} calendar days</span>{' '}
                            past the end date (then it stops). It does not show on the end date itself.
                        </p>
                        <p>
                            <span className="font-bold" style={{ color: colors.textMain }}>Daily behavior.</span>{' '}
                            The app recomputes alerts when you use it (and the main shell refreshes date context periodically). There is no separate
                            overnight job: each time lists are evaluated, &quot;today&quot; determines whether you are inside that window. Dismissing the alert
                            records a per-user dismiss for that day (same pattern as other system alerts).
                        </p>
                        <p>
                            <span className="font-bold" style={{ color: colors.textMain }}>Urgent vs normal.</span>{' '}
                            Inside the window, the last <span className="font-semibold" style={{ color: colors.textMain }}>{CLIENT_FEEDBACK_URGENT_LAST_DAYS} days</span>{' '}
                            (closest to the end of the window) are marked <span className="font-semibold text-red-400">urgent</span> (red styling). Earlier days in the window use a softer accent.
                            If Auto-task is enabled, urgent rows also get <span className="font-semibold" style={{ color: colors.textMain }}>High</span> priority; otherwise Medium.
                        </p>
                        <p>
                            <span className="font-bold" style={{ color: colors.textMain }}>One row per request end.</span>{' '}
                            The dismiss key is tied to that end date, so you get one feedback reminder stream per request/end anchor until you dismiss or the window passes.
                        </p>
                    </div>
                </details>
            </div>
        );
    };

    const renderCallsTab = () => {
        const propId = managingProperty?.id;
        if (!propId) return null;

        const patchCallRule = (kind: DeadlineCallKind, patch: Partial<DeadlineCallRuleSettings>) => {
            setCallSettingsDraft((prev) => ({ ...prev, [kind]: { ...prev[kind], ...patch } }));
        };
        const toggleCallStatus = (kind: DeadlineCallKind, status: string) => {
            setCallSettingsDraft((prev) => {
                const cur = prev[kind];
                const has = cur.linkedStatuses.includes(status);
                const next = has ? cur.linkedStatuses.filter((s) => s !== status) : [...cur.linkedStatuses, status];
                return { ...prev, [kind]: { ...cur, linkedStatuses: next } };
            });
        };
        const toggleCallOffset = (kind: DeadlineCallKind, offset: number) => {
            setCallSettingsDraft((prev) => {
                const cur = prev[kind];
                const has = cur.offsets.includes(offset);
                const next = has ? cur.offsets.filter((o) => o !== offset) : [...cur.offsets, offset].sort((a, b) => a - b);
                return { ...prev, [kind]: { ...cur, offsets: next } };
            });
        };

        const handleSaveCallSettings = async () => {
            setCallSettingsSaveStatus('saving');
            try {
                const clean = mergePropertyCallSettings(callSettingsDraft);
                const ok = await saveCallSettingsForProperty(propId, clean);
                if (!ok) throw new Error('save failed');
                const nextProp = { ...managingProperty, callSettings: clean };
                setManagingProperty(nextProp);
                setProperties((prev: any[]) => prev.map((p: any) => (p.id === propId ? { ...p, callSettings: clean } : p)));
                setCallSettingsSaveStatus('saved');
                setTimeout(() => setCallSettingsSaveStatus('idle'), 3000);
            } catch (err) {
                console.error('Error saving call settings:', err);
                setCallSettingsSaveStatus('error');
            }
        };

        return (
            <div className="space-y-6 animate-in fade-in duration-300">
                <div className="flex flex-col gap-4 lg:flex-row lg:justify-between lg:items-start">
                    <div className="min-w-0 flex-1">
                        <h2 className="text-xl font-bold" style={{ color: colors.textMain }}>Calls</h2>
                        <p className="text-sm mt-1 max-w-3xl" style={{ color: colors.textMuted }}>
                            Control the CRM follow-up calls auto-created from request deadlines. Defaults match the current
                            system behavior. Choose which request statuses generate each call, when the call is due
                            (relative to the deadline), and the call description. The call contact is always the request&apos;s
                            booker.
                        </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        {callSettingsSaveStatus === 'saved' && (
                            <span className="text-[10px] font-bold text-emerald-500 animate-pulse">SAVED SUCCESSFULLY!</span>
                        )}
                        {callSettingsSaveStatus === 'error' && (
                            <span className="text-[10px] font-bold text-red-500">ERROR SAVING!</span>
                        )}
                        <button
                            type="button"
                            onClick={handleSaveCallSettings}
                            disabled={callSettingsSaveStatus === 'saving'}
                            className="px-6 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl flex items-center gap-2 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
                            style={{ backgroundColor: colors.primary, color: '#000' }}
                        >
                            {callSettingsSaveStatus === 'saving' ? (
                                <RefreshCw size={14} className="animate-spin" />
                            ) : (
                                <Save size={14} />
                            )}
                            {callSettingsSaveStatus === 'saving' ? 'Saving...' : 'Save configuration'}
                        </button>
                    </div>
                </div>

                <div className="space-y-4">
                    {DEADLINE_CALL_KINDS.map((kind) => {
                        const def = CALL_TYPE_REGISTRY.find((d) => d.kind === kind)!;
                        const rule = callSettingsDraft[kind];
                        return (
                            <div
                                key={kind}
                                className="rounded-xl border p-4 space-y-4"
                                style={{ borderColor: colors.border, backgroundColor: colors.card }}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="font-bold text-sm" style={{ color: colors.textMain }}>{def.title}</div>
                                        <p className="text-xs mt-1" style={{ color: colors.textMuted }}>{def.description}</p>
                                    </div>
                                    <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest shrink-0" style={{ color: colors.textMuted }}>
                                        <input
                                            type="checkbox"
                                            checked={rule.enabled}
                                            onChange={(e) => patchCallRule(kind, { enabled: e.target.checked })}
                                            className="w-4 h-4 rounded border cursor-pointer"
                                            style={{ accentColor: colors.primary, borderColor: colors.border }}
                                        />
                                        Active
                                    </label>
                                </div>

                                <div className={`grid gap-4 md:grid-cols-2 ${rule.enabled ? '' : 'opacity-40 pointer-events-none'}`}>
                                    <div>
                                        <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: colors.textMuted }}>Linked statuses</div>
                                        <div className="flex flex-wrap gap-2">
                                            {REQUEST_STATUS_OPTIONS.map((st) => (
                                                <label key={st} className="flex items-center gap-1.5 text-xs cursor-pointer px-2 py-1 rounded-lg border" style={{ borderColor: colors.border, color: colors.textMain }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={rule.linkedStatuses.includes(st)}
                                                        onChange={() => toggleCallStatus(kind, st)}
                                                        className="w-3.5 h-3.5 rounded cursor-pointer"
                                                        style={{ accentColor: colors.primary }}
                                                    />
                                                    {st}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: colors.textMuted }}>Call due (relative to deadline)</div>
                                        <div className="flex flex-wrap gap-2">
                                            {DEADLINE_OFFSET_OPTIONS.map((opt) => (
                                                <label key={opt.value} className="flex items-center gap-1.5 text-xs cursor-pointer px-2 py-1 rounded-lg border" style={{ borderColor: colors.border, color: colors.textMain }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={rule.offsets.includes(opt.value)}
                                                        onChange={() => toggleCallOffset(kind, opt.value)}
                                                        className="w-3.5 h-3.5 rounded cursor-pointer"
                                                        style={{ accentColor: colors.primary }}
                                                    />
                                                    {opt.label}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="md:col-span-2">
                                        <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: colors.textMuted }}>Description</div>
                                        <input
                                            type="text"
                                            value={rule.description}
                                            onChange={(e) => patchCallRule(kind, { description: e.target.value })}
                                            className="w-full px-3 py-2 rounded-lg border text-sm"
                                            style={{ borderColor: colors.border, backgroundColor: colors.bg, color: colors.textMain }}
                                        />
                                        <p className="text-[10px] mt-1" style={{ color: colors.textMuted }}>Tokens: {'{title}'} {'{reqId}'} {'{request}'} {'{account}'} {'{contact}'} {'{date}'}</p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderFeedbackFormsTab = () => {
        const propId = managingProperty?.id;
        if (!propId) return null;

        const template = feedbackTemplatesDraft[feedbackTemplateType];

        const setTemplate = (nextTemplate: FeedbackTemplate) => {
            setFeedbackTemplatesDraft((prev) => ({ ...prev, [feedbackTemplateType]: nextTemplate }));
        };

        const updateSection = (sectionIndex: number, patch: Record<string, unknown>) => {
            const sections = (template.sections || []).map((s: any, idx: number) =>
                idx === sectionIndex ? { ...s, ...patch } : s
            );
            setTemplate({ ...template, sections });
        };

        const updateQuestion = (sectionIndex: number, questionIndex: number, patch: Record<string, unknown>) => {
            const sections = (template.sections || []).map((s: any, sIdx: number) => {
                if (sIdx !== sectionIndex) return s;
                const questions = (Array.isArray(s.questions) ? s.questions : []).map((q: any, qIdx: number) =>
                    qIdx === questionIndex ? { ...q, ...patch } : q
                );
                return { ...s, questions };
            });
            setTemplate({ ...template, sections });
        };

        const addSection = () => {
            const sections = [...(template.sections || [])];
            const sectionNumber = sections.length + 1;
            sections.push({
                title: `Section ${sectionNumber}`,
                questions: [
                    {
                        id: `q_${feedbackTemplateType}_${sectionNumber}_1`,
                        prompt: 'New question',
                        type: 'text',
                    },
                ],
            });
            setTemplate({ ...template, sections });
        };

        const removeSection = (sectionIndex: number) => {
            const sections = (template.sections || []).filter((_: any, idx: number) => idx !== sectionIndex);
            setTemplate({ ...template, sections: sections.length ? sections : template.sections });
        };

        const addQuestion = (sectionIndex: number) => {
            const sections = (template.sections || []).map((s: any, idx: number) => {
                if (idx !== sectionIndex) return s;
                const questions = Array.isArray(s.questions) ? s.questions : [];
                const questionNumber = questions.length + 1;
                return {
                    ...s,
                    questions: [
                        ...questions,
                        {
                            id: `q_${feedbackTemplateType}_${sectionIndex + 1}_${questionNumber}`,
                            prompt: 'New question',
                            type: 'text',
                        },
                    ],
                };
            });
            setTemplate({ ...template, sections });
        };

        const removeQuestion = (sectionIndex: number, questionIndex: number) => {
            const sections = (template.sections || []).map((s: any, idx: number) => {
                if (idx !== sectionIndex) return s;
                const questions = (Array.isArray(s.questions) ? s.questions : []).filter((_: any, qIdx: number) => qIdx !== questionIndex);
                return { ...s, questions: questions.length ? questions : s.questions };
            });
            setTemplate({ ...template, sections });
        };

        const resetCurrentTemplateToDefault = () => {
            const defaults = buildDefaultFeedbackTemplateStore();
            setFeedbackTemplatesDraft((prev) => ({ ...prev, [feedbackTemplateType]: defaults[feedbackTemplateType] }));
        };

        const saveFeedbackForms = async () => {
            setFeedbackFormsSaveStatus('saving');
            try {
                const payload = {
                    ...managingProperty,
                    feedbackTemplates: feedbackTemplatesDraft,
                };
                const res = await fetch(apiUrl('/api/properties'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                if (!res.ok) throw new Error('Failed to save feedback forms');
                const nextProp = { ...managingProperty, feedbackTemplates: feedbackTemplatesDraft };
                setManagingProperty(nextProp);
                setProperties((prev: any[]) =>
                    prev.map((p: any) =>
                        String(p.id) === String(propId) ? { ...p, feedbackTemplates: feedbackTemplatesDraft } : p
                    )
                );
                setFeedbackFormsSaveStatus('saved');
                setTimeout(() => setFeedbackFormsSaveStatus('idle'), 3000);
            } catch (err) {
                console.error('Error saving feedback forms:', err);
                setFeedbackFormsSaveStatus('error');
            }
        };

        const typeOptions: Array<{ id: FeedbackTemplateType; label: string }> = [
            { id: 'accommodation', label: 'Accommodation' },
            { id: 'event', label: 'Event' },
            { id: 'event_rooms', label: 'Event + Rooms' },
        ];

        return (
            <div className="space-y-6 animate-in fade-in duration-300">
                <div className="flex flex-col gap-4 lg:flex-row lg:justify-between lg:items-start">
                    <div className="min-w-0 flex-1">
                        <h2 className="text-xl font-bold" style={{ color: colors.textMain }}>Client feedback forms</h2>
                        <p className="text-sm mt-1 max-w-3xl" style={{ color: colors.textMuted }}>
                            Customize the public feedback forms for this property by request type. You can edit the introduction, question content, response type, and post-submission message.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {feedbackFormsSaveStatus === 'saved' && (
                            <span className="text-[10px] font-bold text-emerald-500 animate-pulse">SAVED SUCCESSFULLY!</span>
                        )}
                        {feedbackFormsSaveStatus === 'error' && (
                            <span className="text-[10px] font-bold text-red-500">ERROR SAVING!</span>
                        )}
                        <button
                            type="button"
                            onClick={resetCurrentTemplateToDefault}
                            className="px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest"
                            style={{ borderColor: colors.border, color: colors.textMain }}
                        >
                            Reset current type
                        </button>
                        <button
                            type="button"
                            onClick={saveFeedbackForms}
                            disabled={feedbackFormsSaveStatus === 'saving'}
                            className="px-6 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl flex items-center gap-2 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
                            style={{ backgroundColor: colors.primary, color: '#000' }}
                        >
                            {feedbackFormsSaveStatus === 'saving' ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                            {feedbackFormsSaveStatus === 'saving' ? 'Saving...' : 'Save forms'}
                        </button>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    {typeOptions.map((opt) => (
                        <button
                            key={opt.id}
                            type="button"
                            onClick={() => setFeedbackTemplateType(opt.id)}
                            className="px-4 py-2 rounded-lg border text-xs font-bold transition-all"
                            style={{
                                borderColor: feedbackTemplateType === opt.id ? colors.primary : colors.border,
                                color: feedbackTemplateType === opt.id ? colors.primary : colors.textMain,
                                backgroundColor: feedbackTemplateType === opt.id ? `${colors.primary}12` : 'transparent',
                            }}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>

                <div className="rounded-xl border p-4 space-y-4" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                    <div>
                        <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: colors.textMuted }}>Introduction message</label>
                        <textarea
                            value={template.intro}
                            onChange={(e) => setTemplate({ ...template, intro: e.target.value })}
                            className="w-full min-h-[110px] p-3 rounded-lg border text-sm"
                            style={{ borderColor: colors.border, color: colors.textMain, backgroundColor: colors.bg }}
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: colors.textMuted }}>Post-submission message</label>
                        <textarea
                            value={template.submitMessage}
                            onChange={(e) => setTemplate({ ...template, submitMessage: e.target.value })}
                            className="w-full min-h-[110px] p-3 rounded-lg border text-sm"
                            style={{ borderColor: colors.border, color: colors.textMain, backgroundColor: colors.bg }}
                        />
                    </div>
                </div>

                <div className="space-y-4">
                    {(template.sections || []).map((section: any, sectionIndex: number) => (
                        <div key={`section-${sectionIndex}`} className="rounded-xl border p-4 space-y-4" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={section.title}
                                    onChange={(e) => updateSection(sectionIndex, { title: e.target.value })}
                                    className="flex-1 p-2 rounded-lg border text-sm"
                                    style={{ borderColor: colors.border, color: colors.textMain, backgroundColor: colors.bg }}
                                />
                                {(template.sections || []).length > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => removeSection(sectionIndex)}
                                        className="px-3 py-2 rounded-lg border text-xs font-bold text-red-500"
                                        style={{ borderColor: 'rgba(239,68,68,.35)' }}
                                    >
                                        Remove section
                                    </button>
                                )}
                            </div>

                            <div className="space-y-3">
                                {(Array.isArray(section.questions) ? section.questions : []).map((q: any, questionIndex: number) => (
                                    <div key={q.id || `q-${questionIndex}`} className="rounded-lg border p-3 space-y-2" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-2">
                                            <textarea
                                                value={q.prompt}
                                                onChange={(e) => updateQuestion(sectionIndex, questionIndex, { prompt: e.target.value })}
                                                className="lg:col-span-3 min-h-[68px] p-2 rounded-lg border text-sm"
                                                style={{ borderColor: colors.border, color: colors.textMain, backgroundColor: colors.card }}
                                            />
                                            <select
                                                value={q.type}
                                                onChange={(e) => updateQuestion(sectionIndex, questionIndex, { type: e.target.value })}
                                                className="p-2 rounded-lg border text-sm"
                                                style={{ borderColor: colors.border, color: colors.textMain, backgroundColor: colors.card }}
                                            >
                                                {FEEDBACK_QUESTION_TYPE_OPTIONS.map((opt) => (
                                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                        {(Array.isArray(section.questions) ? section.questions : []).length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => removeQuestion(sectionIndex, questionIndex)}
                                                className="px-2 py-1 rounded border text-[10px] font-bold text-red-500"
                                                style={{ borderColor: 'rgba(239,68,68,.35)' }}
                                            >
                                                Remove question
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <button
                                type="button"
                                onClick={() => addQuestion(sectionIndex)}
                                className="px-3 py-2 rounded-lg border text-xs font-bold"
                                style={{ borderColor: colors.border, color: colors.textMain }}
                            >
                                + Add question
                            </button>
                        </div>
                    ))}
                </div>

                <button
                    type="button"
                    onClick={addSection}
                    className="px-4 py-2 rounded-xl border text-xs font-black uppercase tracking-widest"
                    style={{ borderColor: colors.border, color: colors.textMain }}
                >
                    + Add section
                </button>
            </div>
        );
    };

    const renderUsersTab = () => {
        if (selectedUserForStats) {
            return (
                <div className="space-y-6">
                    <button
                        onClick={() => setSelectedUserForStats(null)}
                        className="flex items-center gap-2 text-sm font-bold hover:opacity-70 transition-opacity"
                        style={{ color: colors.primary }}
                    >
                        <ChevronLeft size={16} /> Back to User List
                    </button>
                    <Suspense fallback={<ProfileDashboardFallback />}>
                        <UserPerformanceDashboard
                            user={selectedUserForStats}
                            propertyId={managingProperty?.id || activeProperty?.id}
                            isOwnProfile={false}
                            {...userPerformanceDashboardSharedProps}
                        />
                    </Suspense>
                </div>
            );
        }

        const filteredUsers = managingProperty 
            ? users.filter(u => userAssignedToProperty(u, managingProperty.id))
            : users;

        return (
            <div className="space-y-6 animate-in fade-in duration-300">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold" style={{ color: colors.textMain }}>
                        {managingProperty ? `${managingProperty.name} Staff Management` : 'Global Staff Management'}
                    </h2>
                    <button
                        onClick={() => openModal('user', managingProperty ? { propertyId: managingProperty.id } : null)}
                        className="px-6 py-2.5 rounded-xl flex items-center gap-2 hover:brightness-110 transition-all text-sm font-bold shadow-lg shadow-primary/20"
                        style={{ backgroundColor: colors.primary, color: '#000' }}>
                        <Plus size={16} /> Add New Staff Member
                    </button>
                </div>
                <div className="rounded-2xl border overflow-hidden" style={{ borderColor: colors.border }}>
                    <table className="w-full text-left">
                        <thead style={{ backgroundColor: colors.bg }}>
                            <tr>
                                <th className="p-4 text-[10px] uppercase font-bold tracking-widest" style={{ color: colors.textMuted }}>Full Name</th>
                                <th className="p-4 text-[10px] uppercase font-bold tracking-widest" style={{ color: colors.textMuted }}>Email Context</th>
                                <th className="p-4 text-[10px] uppercase font-bold tracking-widest" style={{ color: colors.textMuted }}>Assigned Property</th>
                                <th className="p-4 text-[10px] uppercase font-bold tracking-widest" style={{ color: colors.textMuted }}>System Role</th>
                                <th className="p-4 text-[10px] uppercase font-bold tracking-widest text-center" style={{ color: colors.textMuted }}>Management</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y" style={{ borderColor: colors.border }}>
                            {filteredUsers.map((user) => {
                                const property = properties.find(p => p.id === user.propertyId);
                                return (
                                    <tr key={user.id} className="hover:bg-white/5 transition-all group">
                                        <td className="p-4 cursor-pointer" onClick={() => setSelectedUserForStats(user)}>
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs" style={{ backgroundColor: colors.primaryDim, color: colors.primary }}>
                                                    {(user.name || user.username || "?").charAt(0)}
                                                </div>
                                                <span className="font-bold group-hover:text-primary transition-colors" style={{ color: colors.textMain }}>{user.name}</span>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <span className="text-sm font-mono opacity-60" style={{ color: colors.textMain }}>{user.email}</span>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex flex-wrap gap-1.5 items-center">
                                                {properties.filter(p => userAssignedToProperty(user, p.id)).length > 0 ? (
                                                    properties.filter(p => userAssignedToProperty(user, p.id)).map(p => (
                                                        <div key={p.id} className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 border border-white/5">
                                                            <Building size={12} className="text-emerald-400" />
                                                            <span className="text-[10px] font-medium" style={{ color: colors.textMain }}>{p.name}</span>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="flex items-center gap-2 opacity-40">
                                                        <Building size={12} />
                                                        <span className="text-xs">Unassigned</span>
                                                    </div>
                                                )}
                                            </div>
                                        </td>

                                        <td className="p-4">
                                            <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-white/5 border" style={{ borderColor: colors.border, color: colors.textMain }}>
                                                {user.role}
                                            </span>
                                        </td>
                                        <td className="p-4 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => openModal('user', user)}
                                                    className="p-2 rounded-xl border border-transparent hover:border-white/10 hover:bg-white/5 transition-all" style={{ color: colors.textMuted }}><Edit size={16} /></button>
                                                {managingProperty && (
                                                    <button
                                                        onClick={() => handleUnassign(user.id)}
                                                        className="p-2 rounded-xl border border-transparent hover:border-orange-500/20 hover:bg-orange-500/5 transition-all"
                                                        style={{ color: colors.orange }}
                                                        title="Unassign from this property"
                                                    >
                                                        <UserMinus size={16} />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleDelete('user', user.id)}
                                                    className="p-2 rounded-xl border border-transparent hover:border-red-500/20 hover:bg-red-500/5 transition-all" style={{ color: colors.red }}><Trash2 size={16} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const renderProfileTab = () => {
        const mappedUser = {
            ...currentUser,
            name: currentUser?.name || userProfile.name,
            email: currentUser?.email || userProfile.email,
            role: currentUser?.role || userProfile.title || 'Staff',
        };
        return (
            <Suspense fallback={<ProfileDashboardFallback />}>
                <UserPerformanceDashboard
                    user={mappedUser}
                    isOwnProfile={true}
                    propertyId={activeProperty?.id}
                    {...userPerformanceDashboardSharedProps}
                />
            </Suspense>
        );
    };

    const renderFinancialTab = () => (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold" style={{ color: colors.textMain }}>Financial and KPI Management</h2>
                    <p className="text-sm" style={{ color: colors.textMuted }}>Manage budget, forecast, and sales call targets</p>
                </div>
                <button
                    onClick={() => {
                        setFinancialData((prev: any[]) => {
                            const baseRows =
                                Array.isArray(prev) && prev.length
                                    ? prev
                                    : [{ year: new Date().getFullYear(), months: generateInitialMonths() }];
                            const maxYear = baseRows.reduce((max, row) => {
                                const y = Number(row?.year || 0);
                                return Number.isFinite(y) ? Math.max(max, y) : max;
                            }, 0);
                            return [...baseRows, { year: Math.max(maxYear, new Date().getFullYear()) + 1, months: generateInitialMonths() }];
                        });
                    }}
                    className="px-4 py-2 rounded flex items-center gap-2 hover:brightness-110 transition-all text-sm font-bold"
                    style={{ backgroundColor: colors.primary, color: '#000' }}
                >
                    <Plus size={16} /> Add Year {nextFinancialYear}
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {normalizedFinancialData.map((data) => (
                    <div
                        key={data.year}
                        onClick={() => setSelectedYearDetails(data)}
                        className="p-6 rounded-2xl border cursor-pointer hover:border-primary/50 transition-all group relative overflow-hidden"
                        style={{ backgroundColor: colors.card, borderColor: colors.border }}
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                            <Calculator size={80} style={{ color: colors.primary }} />
                        </div>
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-2xl font-black italic tracking-tighter" style={{ color: colors.primary }}>YEAR {data.year}</h3>
                            <div className="p-2 rounded-lg bg-white/5 group-hover:bg-primary/20 transition-colors">
                                <ChevronRight size={20} style={{ color: colors.primary }} />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex justify-between items-center border-b border-white/5 pb-2">
                                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>Rooms Budget</span>
                                <span className="font-mono text-sm" style={{ color: colors.textMain }}>
                                    {formatMoney(data.months.reduce((acc: number, m: any) => acc + m.roomsBudget, 0), 0)}
                                </span>
                            </div>
                            <div className="flex justify-between items-center border-b border-white/5 pb-2">
                                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>Food and Beverage Budget</span>
                                <span className="font-mono text-sm" style={{ color: colors.textMain }}>
                                    {formatMoney(data.months.reduce((acc: number, m: any) => acc + m.foodAndBeverageBudget, 0), 0)}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>Sales Calls</span>
                                <span className="font-mono text-sm" style={{ color: colors.cyan }}>
                                    {data.months.reduce((acc: number, m: any) => acc + m.salesCalls, 0)} Targets
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Year Details Modal */}
            {selectedYearDetails && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300"
                        style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        {/* Modal Header */}
                        <div className="p-6 border-b flex items-center justify-between" style={{ borderColor: colors.border }}>
                            <div className="flex items-center gap-4">
                                <div className="p-3 rounded-2xl" style={{ backgroundColor: colors.primaryDim }}>
                                    <TrendingUp size={24} style={{ color: colors.primary }} />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-bold" style={{ color: colors.textMain }}>Year {selectedYearDetails.year} Financials</h3>
                                    <p className="text-xs" style={{ color: colors.textMuted }}>Monthly Budget and KPI Breakdown</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                {!isEditingFinancials ? (
                                    <button
                                        onClick={() => {
                                            setTempYearData(JSON.parse(JSON.stringify(selectedYearDetails)));
                                            setIsEditingFinancials(true);
                                        }}
                                        className="px-6 py-2 rounded-xl flex items-center gap-2 hover:brightness-110 transition-all font-bold"
                                        style={{ backgroundColor: colors.primary, color: '#000' }}
                                    >
                                        <Edit size={16} /> Edit Data
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => {
                                            setFinancialData(financialData.map(y => y.year === tempYearData.year ? tempYearData : y));
                                            setSelectedYearDetails(tempYearData);
                                            setIsEditingFinancials(false);
                                            fetch(apiUrl('/api/financials'), {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ ...tempYearData, propertyId: managingProperty?.id })
                                            });
                                        }}
                                        className="px-6 py-2 rounded-xl flex items-center gap-2 hover:brightness-110 transition-all font-bold"
                                        style={{ backgroundColor: colors.green, color: '#000' }}
                                    >
                                        <Save size={16} /> Save Changes
                                    </button>
                                )}
                                <button
                                    onClick={() => {
                                        if (window.confirm(`Are you sure you want to delete all financial data for ${selectedYearDetails.year}?`)) {
                                            setFinancialData((prev: any[]) => {
                                                const kept = (Array.isArray(prev) ? prev : []).filter((y: any) => y.year !== selectedYearDetails.year);
                                                return kept.length ? kept : [{ year: new Date().getFullYear(), months: generateInitialMonths() }];
                                            });
                                            const itemId = selectedYearDetails.id || `${managingProperty?.id}_${selectedYearDetails.year}`;
                                            const suffix = managingProperty?.id ? `?propertyId=${encodeURIComponent(String(managingProperty.id))}` : '';
                                            fetch(apiUrl(`/api/financials/${itemId}${suffix}`), { method: 'DELETE' });
                                            setSelectedYearDetails(null);
                                            setIsEditingFinancials(false);
                                        }
                                    }}
                                    className="p-2 rounded-xl border border-red-500/30 text-red-500 hover:bg-red-500/10 transition-colors"
                                    title="Delete Year"
                                >
                                    <Trash2 size={24} />
                                </button>
                                <button onClick={() => { setSelectedYearDetails(null); setIsEditingFinancials(false); }} className="p-2 rounded-xl hover:bg-white/10" style={{ color: colors.textMuted }}>
                                    <X size={24} />
                                </button>
                            </div>
                        </div>

                        {/* Modal Content */}
                        <div className="flex-1 overflow-auto p-6 custom-scrollbar">
                            <table className="w-full text-left border-collapse">
                                <thead className="sticky top-0 z-10" style={{ backgroundColor: colors.card }}>
                                    <tr className="border-b" style={{ borderColor: colors.border }}>
                                        <th className="py-4 px-2 text-[10px] uppercase font-bold tracking-widest" style={{ color: colors.textMuted }}>Month</th>
                                        <th className="py-4 px-2 text-[10px] uppercase font-bold tracking-widest" style={{ color: colors.primary }}>Rooms Budget</th>
                                        <th className="py-4 px-2 text-[10px] uppercase font-bold tracking-widest text-opacity-70" style={{ color: colors.primary }}>Rooms Forecast</th>
                                        <th className="py-4 px-2 text-[10px] uppercase font-bold tracking-widest text-blue-400">Food and Beverage Budget</th>
                                        <th className="py-4 px-2 text-[10px] uppercase font-bold tracking-widest text-blue-400 text-opacity-70">Food and Beverage Forecast</th>
                                        <th className="py-4 px-2 text-[10px] uppercase font-bold tracking-widest text-orange-400">Sales Calls</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y" style={{ borderColor: colors.border }}>
                                    {(isEditingFinancials ? tempYearData : selectedYearDetails).months.map((m: any, idx: number) => (
                                        <tr key={m.month} className="hover:bg-white/5 transition-colors">
                                            <td className="py-4 px-2 text-sm font-bold" style={{ color: colors.textMain }}>{m.month}</td>
                                            <td className="py-4 px-2">
                                                {isEditingFinancials ? (
                                                    <input
                                                        type="number"
                                                        value={m.roomsBudget}
                                                        onChange={(e) => {
                                                            const newMonths = [...tempYearData.months];
                                                            newMonths[idx].roomsBudget = Number(e.target.value);
                                                            setTempYearData({ ...tempYearData, months: newMonths });
                                                        }}
                                                        className="w-full bg-black/20 border-0 p-2 rounded outline-none focus:ring-1 ring-primary/50 text-sm font-mono"
                                                        style={{ color: colors.textMain }}
                                                    />
                                                ) : <span className="font-mono text-sm">{formatMoney(Number(m.roomsBudget || 0), 0)}</span>}
                                            </td>
                                            <td className="py-4 px-2">
                                                {isEditingFinancials ? (
                                                    <input
                                                        type="number"
                                                        value={m.roomsForecast}
                                                        onChange={(e) => {
                                                            const newMonths = [...tempYearData.months];
                                                            newMonths[idx].roomsForecast = Number(e.target.value);
                                                            setTempYearData({ ...tempYearData, months: newMonths });
                                                        }}
                                                        className="w-full bg-black/20 border-0 p-2 rounded outline-none focus:ring-1 ring-primary/30 text-sm font-mono"
                                                        style={{ color: colors.textMain }}
                                                    />
                                                ) : <span className="font-mono text-sm opacity-60">{formatMoney(Number(m.roomsForecast || 0), 0)}</span>}
                                            </td>
                                            <td className="py-4 px-2">
                                                {isEditingFinancials ? (
                                                    <input
                                                        type="number"
                                                        value={m.foodAndBeverageBudget}
                                                        onChange={(e) => {
                                                            const newMonths = [...tempYearData.months];
                                                            newMonths[idx].foodAndBeverageBudget = Number(e.target.value);
                                                            setTempYearData({ ...tempYearData, months: newMonths });
                                                        }}
                                                        className="w-full bg-black/20 border-0 p-2 rounded outline-none focus:ring-1 ring-blue-500/50 text-sm font-mono"
                                                        style={{ color: colors.textMain }}
                                                    />
                                                ) : <span className="font-mono text-sm">{formatMoney(Number(m.foodAndBeverageBudget || 0), 0)}</span>}
                                            </td>
                                            <td className="py-4 px-2">
                                                {isEditingFinancials ? (
                                                    <input
                                                        type="number"
                                                        value={m.foodAndBeverageForecast}
                                                        onChange={(e) => {
                                                            const newMonths = [...tempYearData.months];
                                                            newMonths[idx].foodAndBeverageForecast = Number(e.target.value);
                                                            setTempYearData({ ...tempYearData, months: newMonths });
                                                        }}
                                                        className="w-full bg-black/20 border-0 p-2 rounded outline-none focus:ring-1 ring-blue-500/30 text-sm font-mono"
                                                        style={{ color: colors.textMain }}
                                                    />
                                                ) : <span className="font-mono text-sm opacity-60">{formatMoney(Number(m.foodAndBeverageForecast || 0), 0)}</span>}
                                            </td>
                                            <td className="py-4 px-2">
                                                {isEditingFinancials ? (
                                                    <input
                                                        type="number"
                                                        value={m.salesCalls}
                                                        onChange={(e) => {
                                                            const newMonths = [...tempYearData.months];
                                                            newMonths[idx].salesCalls = Number(e.target.value);
                                                            setTempYearData({ ...tempYearData, months: newMonths });
                                                        }}
                                                        className="w-full bg-black/20 border-0 p-2 rounded outline-none focus:ring-1 ring-orange-400/50 text-sm font-bold text-center"
                                                        style={{ color: colors.textMain }}
                                                    />
                                                ) : <div className="text-center font-bold" style={{ color: colors.orange }}>{m.salesCalls}</div>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="sticky bottom-0 z-10" style={{ backgroundColor: colors.card }}>
                                    <tr className="border-t-2 font-black" style={{ borderColor: colors.primary + '40' }}>
                                        <td className="py-4 px-2 text-xs uppercase" style={{ color: colors.textMuted }}>Yearly Totals</td>
                                        <td className="py-4 px-2 font-mono text-sm" style={{ color: colors.primary }}>
                                            {formatMoney((isEditingFinancials ? tempYearData : selectedYearDetails).months.reduce((acc: any, m: any) => acc + m.roomsBudget, 0), 0)}
                                        </td>
                                        <td className="py-4 px-2 font-mono text-sm opacity-60" style={{ color: colors.primary }}>
                                            {formatMoney((isEditingFinancials ? tempYearData : selectedYearDetails).months.reduce((acc: any, m: any) => acc + m.roomsForecast, 0), 0)}
                                        </td>
                                        <td className="py-4 px-2 font-mono text-sm" style={{ color: colors.blue }}>
                                            {formatMoney((isEditingFinancials ? tempYearData : selectedYearDetails).months.reduce((acc: any, m: any) => acc + m.foodAndBeverageBudget, 0), 0)}
                                        </td>
                                        <td className="py-4 px-2 font-mono text-sm opacity-60" style={{ color: colors.blue }}>
                                            {formatMoney((isEditingFinancials ? tempYearData : selectedYearDetails).months.reduce((acc: any, m: any) => acc + m.foodAndBeverageForecast, 0), 0)}
                                        </td>
                                        <td className="py-4 px-2 text-center" style={{ color: colors.orange }}>
                                            {(isEditingFinancials ? tempYearData : selectedYearDetails).months.reduce((acc: any, m: any) => acc + m.salesCalls, 0)}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    const renderConfigTab = () => {
        const pruneFormOverrideLocal = (ov: FormOverride | undefined) => {
            if (!ov) return undefined;
            const fr = ov.fieldRequired && Object.keys(ov.fieldRequired).length ? ov.fieldRequired : undefined;
            const so = ov.sectionOrder && ov.sectionOrder.length ? ov.sectionOrder : undefined;
            if (!fr && !so) return undefined;
            return { ...(fr ? { fieldRequired: fr } : {}), ...(so ? { sectionOrder: so } : {}) };
        };

        const toggleFieldRequired = (fieldId: string, checked: boolean) => {
            setFormConfigStore((prev) => {
                const cur = { ...(prev[configFormId] || {}) };
                const fr = { ...(cur.fieldRequired || {}) };
                const defSchema = getDefaultFormSchema(configFormId);
                let defaultReq = false;
                outer: for (const s of defSchema.sections) {
                    for (const f of s.fields) {
                        if (f.id === fieldId) {
                            defaultReq = !!f.required;
                            break outer;
                        }
                    }
                }
                if (checked === defaultReq) delete fr[fieldId];
                else fr[fieldId] = checked;
                const nextCur: FormOverride = { ...cur };
                if (Object.keys(fr).length) nextCur.fieldRequired = fr;
                else delete nextCur.fieldRequired;
                const cleaned = pruneFormOverrideLocal(nextCur);
                const out: PropertyFormConfigStore = { ...prev };
                if (cleaned) out[configFormId] = cleaned;
                else delete out[configFormId];
                return out;
            });
        };

        const moveConfigSection = (sectionId: string, delta: number) => {
            if (!configTargetPropertyId) return;
            setFormConfigStore((prev) => {
                const curSchema = getResolvedFormSchemaFromStores(configTargetPropertyId, configFormId, prev);
                const order = curSchema.sections.map((s) => s.id);
                const i = order.indexOf(sectionId);
                const j = i + delta;
                if (i < 0 || j < 0 || j >= order.length) return prev;
                const nextOrder = [...order];
                [nextOrder[i], nextOrder[j]] = [nextOrder[j], nextOrder[i]];
                const cur = { ...(prev[configFormId] || {}) };
                const cleaned = pruneFormOverrideLocal({ ...cur, sectionOrder: nextOrder });
                const out: PropertyFormConfigStore = { ...prev };
                if (cleaned) out[configFormId] = cleaned;
                else delete out[configFormId];
                return out;
            });
        };

        const resolved = configTargetPropertyId
            ? getResolvedFormSchemaFromStores(configTargetPropertyId, configFormId, formConfigStore)
            : null;

        return (
            <div className="space-y-6 animate-in fade-in duration-300">
                <p className="text-sm leading-relaxed max-w-3xl" style={{ color: colors.textMuted }}>
                    Choose which fields are required and reorder sections for operational forms. Settings apply to the
                    selected property (same scope as Requests and CRM for that property).
                </p>
                <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                    <div className="flex-1 min-w-[12rem] space-y-1">
                        <label className="text-xs font-bold uppercase tracking-wider opacity-70" style={{ color: colors.textMuted }}>
                            Property
                        </label>
                        <select
                            className="w-full px-3 py-2 rounded-lg border text-sm font-semibold outline-none"
                            style={{ backgroundColor: colors.card, borderColor: colors.border, color: colors.textMain }}
                            value={configTargetPropertyId}
                            onChange={(e) => setConfigTargetPropertyId(e.target.value)}
                        >
                            {properties.length === 0 ? (
                                <option value="">No properties loaded</option>
                            ) : (
                                properties.map((p: any) => (
                                    <option key={p.id} value={p.id}>
                                        {p.name || p.id}
                                    </option>
                                ))
                            )}
                        </select>
                    </div>
                </div>

                <div className="flex flex-col lg:flex-row gap-6">
                    <div className="w-full lg:w-64 space-y-2 shrink-0">
                        <label className="text-xs font-bold uppercase tracking-wider opacity-70" style={{ color: colors.textMuted }}>
                            Form
                        </label>
                        <div
                            className="flex flex-col gap-0.5 p-2 rounded-lg border max-h-[min(70vh,28rem)] overflow-y-auto custom-scrollbar"
                            style={{ borderColor: colors.border, backgroundColor: colors.card }}
                        >
                            {FORM_CONFIGURATION_META.map((form) => (
                                <button
                                    key={form.id}
                                    type="button"
                                    onClick={() => setConfigFormId(form.id)}
                                    className={`text-left px-3 py-2 rounded text-xs transition-colors ${
                                        configFormId === form.id ? 'bg-primary/20 font-bold' : 'hover:bg-white/5'
                                    }`}
                                    style={{ color: configFormId === form.id ? colors.primary : colors.textMain }}
                                >
                                    {form.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 min-w-0 p-5 sm:p-6 rounded-xl border bg-black/5" style={{ borderColor: colors.border }}>
                        {!resolved ? (
                            <p className="text-sm" style={{ color: colors.textMuted }}>
                                Select a property to edit form configuration.
                            </p>
                        ) : (
                            <>
                                <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                                    <h3 className="font-bold flex items-center gap-2 text-sm sm:text-base" style={{ color: colors.textMain }}>
                                        <Box size={18} /> Sections & fields
                                    </h3>
                                </div>
                                <div className="space-y-5">
                                    {resolved.sections.map((sec, secIdx) => (
                                        <div
                                            key={sec.id}
                                            className="rounded-xl border overflow-hidden"
                                            style={{ borderColor: colors.border, backgroundColor: colors.bg }}
                                        >
                                            <div
                                                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b"
                                                style={{ borderColor: colors.border, backgroundColor: colors.card }}
                                            >
                                                <span className="text-xs font-black uppercase tracking-widest" style={{ color: colors.textMain }}>
                                                    {sec.title}
                                                </span>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        title="Move section up"
                                                        disabled={secIdx === 0}
                                                        onClick={() => moveConfigSection(sec.id, -1)}
                                                        className="p-1.5 rounded-lg border disabled:opacity-30 hover:bg-white/5"
                                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                                    >
                                                        <ChevronUp size={16} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        title="Move section down"
                                                        disabled={secIdx >= resolved.sections.length - 1}
                                                        onClick={() => moveConfigSection(sec.id, 1)}
                                                        className="p-1.5 rounded-lg border disabled:opacity-30 hover:bg-white/5"
                                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                                    >
                                                        <ChevronDown size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                            <ul className="divide-y" style={{ borderColor: colors.border }}>
                                                {sec.fields.map((field) => (
                                                    <li
                                                        key={field.id}
                                                        className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
                                                    >
                                                        <span className="text-sm font-medium" style={{ color: colors.textMain }}>
                                                            {field.label}
                                                        </span>
                                                        <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                                                            <input
                                                                type="checkbox"
                                                                className="accent-primary rounded"
                                                                checked={field.required}
                                                                onChange={(e) => toggleFieldRequired(field.id, e.target.checked)}
                                                            />
                                                            <span style={{ color: colors.textMuted }}>Required</span>
                                                        </label>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-8 pt-5 border-t flex flex-wrap justify-end gap-3" style={{ borderColor: colors.border }}>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            if (!configTargetPropertyId) {
                                                alert('Select a property first.');
                                                return;
                                            }
                                            const next: PropertyFormConfigStore = { ...formConfigStore };
                                            delete next[configFormId];
                                            setFormConfigStore(next);
                                            const ok = await persistFormConfigurationsForProperty(configTargetPropertyId, next);
                                            if (!ok) {
                                                alert('Could not save the reset to the server. Check your connection and try again.');
                                                return;
                                            }
                                            const propId = configTargetPropertyId;
                                            setProperties((prev: any[]) =>
                                                prev.map((p: any) => (String(p.id) === String(propId) ? { ...p, formConfigurations: next } : p))
                                            );
                                            if (managingProperty && String(managingProperty.id) === String(propId)) {
                                                setManagingProperty({ ...managingProperty, formConfigurations: next });
                                            }
                                        }}
                                        className="px-4 py-2 rounded-lg text-xs font-bold border hover:bg-white/5"
                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                    >
                                        Reset this form to defaults
                                    </button>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            if (!configTargetPropertyId) {
                                                alert('Select a property first.');
                                                return;
                                            }
                                            const ok = await persistFormConfigurationsForProperty(
                                                configTargetPropertyId,
                                                formConfigStore
                                            );
                                            if (!ok) {
                                                alert('Could not save form configuration to the server. Check your connection and try again.');
                                                return;
                                            }
                                            const propId = configTargetPropertyId;
                                            setProperties((prev: any[]) =>
                                                prev.map((p: any) =>
                                                    String(p.id) === String(propId) ? { ...p, formConfigurations: formConfigStore } : p
                                                )
                                            );
                                            if (managingProperty && String(managingProperty.id) === String(propId)) {
                                                setManagingProperty({ ...managingProperty, formConfigurations: formConfigStore });
                                            }
                                        }}
                                        className="px-6 py-2 rounded-lg text-xs font-bold bg-primary text-black hover:opacity-90"
                                    >
                                        Save configuration
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // --- Main Render ---

    return (
        <div className="h-full flex flex-col overflow-hidden w-full max-w-[1550px] mx-auto px-4">
            {/* Header Removed */}

            {/* Tabs Navigation */}
            <div className="shrink-0 border-b overflow-hidden" style={{ borderColor: colors.border }}>
                <div className="flex flex-nowrap justify-between w-full">
                    {tabs.map((tab: any) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => {
                                    setActiveTab(tab.id);
                                    if (tab.id === 'users') setManagingProperty(null);
                                }}
                                className={`flex items-center gap-1.5 px-3 py-3 border-b-2 transition-all group shrink-0 ${isActive ? 'font-bold' : 'font-medium opacity-70 hover:opacity-100'}`}
                                style={{
                                    borderColor: isActive ? colors.primary : 'transparent',
                                    color: isActive ? colors.primary : colors.textMain
                                }}
                            >
                                <Icon size={14} className={`transition-transform group-hover:scale-110 ${isActive ? 'scale-110' : ''}`} />
                                <span className="text-[11px] whitespace-nowrap uppercase tracking-widest">{tab.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Tab Content Area */}
            <div className="flex-1 overflow-auto py-4 custom-scrollbar">
                {activeTab === 'property' && renderPropertyTab()}
                {activeTab === 'rooms' && renderRoomTypesTab()}
                {activeTab === 'venues' && renderVenuesTab()}
                {activeTab === 'taxes' && renderTaxesTab()}
                {activeTab === 'users' && renderUsersTab()}
                {activeTab === 'profile' && renderProfileTab()}
                {activeTab === 'financial' && renderFinancialTab()}
                {activeTab === 'config' && renderConfigTab()}
            </div>

            {/* Admin Action Modal */}
            {showModal && (
                <div className="fixed inset-0 z-[100] overflow-y-auto overscroll-contain bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="flex min-h-full items-center justify-center p-4 py-6">
                    <div
                        className={`my-auto w-full rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[min(88vh,100dvh-2.5rem)] animate-in zoom-in-95 duration-300 ${modalType === 'user' ? 'max-w-3xl' : 'max-w-2xl'}`}
                        style={{ backgroundColor: colors.card, borderColor: colors.border }}
                    >
                        <div className="shrink-0 px-4 py-3 sm:px-5 sm:py-3.5 border-b flex items-center justify-between gap-3" style={{ borderColor: colors.border }}>
                            <h3 className="text-lg sm:text-xl font-bold font-mono tracking-tighter" style={{ color: colors.primary }}>
                                {modalType === 'user'
                                    ? editingItem?.id
                                        ? 'EDIT'
                                        : 'ADD'
                                    : editingItem
                                      ? 'EDIT'
                                      : 'ADD'}{' '}
                                {modalType?.toUpperCase()}
                            </h3>
                            <button onClick={() => setShowModal(false)} className="p-2 rounded-xl hover:bg-white/10 shrink-0" style={{ color: colors.textMuted }}>
                                <X size={22} />
                            </button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain custom-scrollbar px-4 py-3 sm:px-5 sm:py-4 space-y-3 sm:space-y-4">
                            {modalType === 'property' && (
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="col-span-2">
                                            <label className="text-[10px] uppercase font-bold tracking-widest mb-1 block opacity-50" style={{ color: colors.textMain }}>Property Name</label>
                                            <input type="text" placeholder="e.g. Shaden Resort" className="w-full p-3 bg-black/10 border rounded-xl outline-none" style={{ borderColor: colors.border, color: colors.textMain }}
                                                value={modalFormData.name || ''} onChange={e => setModalFormData({ ...modalFormData, name: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase font-bold tracking-widest mb-1 block opacity-50" style={{ color: colors.textMain }}>Contact Email</label>
                                            <input type="email" placeholder="info@hotel.com" className="w-full p-3 bg-black/10 border rounded-xl outline-none" style={{ borderColor: colors.border, color: colors.textMain }}
                                                value={modalFormData.email || ''} onChange={e => setModalFormData({ ...modalFormData, email: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase font-bold tracking-widest mb-1 block opacity-50" style={{ color: colors.textMain }}>Phone Number</label>
                                            <input type="text" placeholder="+966..." className="w-full p-3 bg-black/10 border rounded-xl outline-none" style={{ borderColor: colors.border, color: colors.textMain }}
                                                value={modalFormData.phone || ''} onChange={e => setModalFormData({ ...modalFormData, phone: e.target.value })} />
                                        </div>
                                        <div className="col-span-2">
                                            <label className="text-[10px] uppercase font-bold tracking-widest mb-1 block opacity-50" style={{ color: colors.textMain }}>Number of Rooms</label>
                                            <input type="number" placeholder="120" className="w-full p-3 bg-black/10 border rounded-xl outline-none font-mono" style={{ borderColor: colors.border, color: colors.textMain }}
                                                value={modalFormData.totalRooms || ''} onChange={e => setModalFormData({ ...modalFormData, totalRooms: Number(e.target.value) })} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase font-bold tracking-widest mb-1 block opacity-50" style={{ color: colors.textMain }}>City</label>
                                            <input type="text" placeholder="AlUla" className="w-full p-3 bg-black/10 border rounded-xl outline-none" style={{ borderColor: colors.border, color: colors.textMain }}
                                                value={modalFormData.city || ''} onChange={e => setModalFormData({ ...modalFormData, city: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase font-bold tracking-widest mb-1 block opacity-50" style={{ color: colors.textMain }}>Country</label>
                                            <input type="text" placeholder="Saudi Arabia" className="w-full p-3 bg-black/10 border rounded-xl outline-none" style={{ borderColor: colors.border, color: colors.textMain }}
                                                value={modalFormData.country || ''} onChange={e => setModalFormData({ ...modalFormData, country: e.target.value })} />
                                        </div>
                                        <div className="col-span-2">
                                            <label className="text-[10px] uppercase font-bold tracking-widest mb-1 block opacity-50" style={{ color: colors.textMain }}>Property Logo</label>
                                            <div className="p-3 rounded-xl border bg-black/10 flex items-center gap-3" style={{ borderColor: colors.border }}>
                                                {modalFormData.logoUrl ? (
                                                    <img
                                                        src={modalFormData.logoUrl}
                                                        alt="Property logo preview"
                                                        className="w-28 h-16 rounded-lg object-contain border p-1 bg-white/80"
                                                        style={{ borderColor: colors.border }}
                                                    />
                                                ) : (
                                                    <div className="w-28 h-16 rounded-lg border grid place-items-center text-[9px] font-bold opacity-50" style={{ borderColor: colors.border, color: colors.textMuted }}>
                                                        No Logo
                                                    </div>
                                                )}
                                                <label className="px-3 py-2 rounded-lg border text-xs font-bold cursor-pointer hover:bg-white/5 transition-colors" style={{ borderColor: colors.border, color: colors.textMain }}>
                                                    Upload Logo
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        className="hidden"
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (!file) return;
                                                            if (!file.type.startsWith('image/')) return;
                                                            const reader = new FileReader();
                                                            reader.onload = () => {
                                                                setModalFormData((prev: any) => ({
                                                                    ...prev,
                                                                    logoUrl: String(reader.result || ''),
                                                                }));
                                                            };
                                                            reader.readAsDataURL(file);
                                                            e.target.value = '';
                                                        }}
                                                    />
                                                </label>
                                                {modalFormData.logoUrl ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => setModalFormData((prev: any) => ({ ...prev, logoUrl: '' }))}
                                                        className="px-3 py-2 rounded-lg border text-xs font-bold hover:bg-red-500/10 transition-colors"
                                                        style={{ borderColor: 'rgba(239,68,68,0.35)', color: colors.red }}
                                                    >
                                                        Remove
                                                    </button>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                            {modalType === 'room' && (
                                <>
                                    <input type="text" placeholder="Room Type Name" className="w-full p-3 bg-black/20 border rounded-xl outline-none" style={{ borderColor: colors.border, color: colors.textMain }}
                                        value={modalFormData.name || ''} onChange={e => setModalFormData({ ...modalFormData, name: e.target.value })} />
                                    <div className="flex gap-4">
                                        <input type="text" placeholder="Size (e.g. 39sqm)" className="flex-1 p-3 bg-black/20 border rounded-xl outline-none" style={{ borderColor: colors.border, color: colors.textMain }}
                                            value={modalFormData.size || ''} onChange={e => setModalFormData({ ...modalFormData, size: e.target.value })} />
                                        <input type="number" placeholder="Pax Capacity" className="w-24 p-3 bg-black/20 border rounded-xl outline-none font-mono" style={{ borderColor: colors.border, color: colors.textMain }}
                                            value={modalFormData.capacity || ''} onChange={e => setModalFormData({ ...modalFormData, capacity: Number(e.target.value) })} />
                                    </div>
                                    <div className="flex gap-4">
                                        <input type="number" placeholder="Base Rate" className="w-1/2 p-3 bg-black/20 border rounded-xl outline-none font-mono" style={{ borderColor: colors.border, color: colors.textMain }}
                                            value={modalFormData.baseRate || ''} onChange={e => setModalFormData({ ...modalFormData, baseRate: Number(e.target.value) })} />
                                        <input type="number" placeholder="Inventory Count" className="w-1/2 p-3 bg-black/20 border rounded-xl outline-none font-mono" style={{ borderColor: colors.border, color: colors.textMain }}
                                            value={modalFormData.count || ''} onChange={e => setModalFormData({ ...modalFormData, count: Number(e.target.value) })} />
                                    </div>
                                </>
                            )}
                            {modalType === 'venue' && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="col-span-2">
                                            <label className="text-[10px] uppercase font-bold tracking-widest mb-1 block opacity-50">Venue Name</label>
                                            <input type="text" placeholder="e.g. Grand Ballroom" className="w-full p-3 bg-black/20 border rounded-xl outline-none" style={{ borderColor: colors.border, color: colors.textMain }}
                                                value={modalFormData.name || ''} onChange={e => setModalFormData({ ...modalFormData, name: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase font-bold tracking-widest mb-1 block opacity-50">Total Pax Capacity</label>
                                            <input type="number" placeholder="500" className="w-full p-3 bg-black/20 border rounded-xl outline-none font-mono" style={{ borderColor: colors.border, color: colors.textMain }}
                                                value={modalFormData.capacity || ''} onChange={e => setModalFormData({ ...modalFormData, capacity: Number(e.target.value) })} />
                                        </div>
                                        <div className="grid grid-cols-4 gap-2 col-span-2">
                                            <div>
                                                <label className="text-[9px] uppercase font-bold tracking-widest mb-1 block opacity-50">Width (m)</label>
                                                <input type="number" placeholder="30" className="w-full p-2 bg-black/20 border rounded-lg outline-none font-mono text-xs" style={{ borderColor: colors.border, color: colors.textMain }}
                                                    value={modalFormData.width || ''} 
                                                    onChange={e => {
                                                        const w = Number(e.target.value);
                                                        const l = modalFormData.length || 0;
                                                        setModalFormData({ ...modalFormData, width: w, area: w * l });
                                                    }} />
                                            </div>
                                            <div>
                                                <label className="text-[9px] uppercase font-bold tracking-widest mb-1 block opacity-50">Length (m)</label>
                                                <input type="number" placeholder="15" className="w-full p-2 bg-black/20 border rounded-lg outline-none font-mono text-xs" style={{ borderColor: colors.border, color: colors.textMain }}
                                                    value={modalFormData.length || ''} 
                                                    onChange={e => {
                                                        const l = Number(e.target.value);
                                                        const w = modalFormData.width || 0;
                                                        setModalFormData({ ...modalFormData, length: l, area: w * l });
                                                    }} />
                                            </div>
                                            <div>
                                                <label className="text-[9px] uppercase font-bold tracking-widest mb-1 block opacity-50">Height (m)</label>
                                                <input type="number" placeholder="4" className="w-full p-2 bg-black/20 border rounded-lg outline-none font-mono text-xs" style={{ borderColor: colors.border, color: colors.textMain }}
                                                    value={modalFormData.height || ''} 
                                                    onChange={e => setModalFormData({ ...modalFormData, height: Number(e.target.value) })} />
                                            </div>
                                            <div>
                                                <label className="text-[9px] uppercase font-bold tracking-widest mb-1 block opacity-50">Area (sqm)</label>
                                                <input type="number" placeholder="Area" className="w-full p-2 bg-black/20 border-dashed rounded-lg outline-none font-mono text-xs cursor-not-allowed" 
                                                    style={{ borderColor: colors.border, color: colors.primary }}
                                                    value={modalFormData.area || ''} readOnly />
                                            </div>
                                        </div>
                                        <div className="col-span-2 flex items-center gap-3 pt-2">
                                            <input 
                                                type="checkbox" 
                                                id="combined-checkbox" 
                                                className="w-4 h-4 rounded border-2" 
                                                style={{ borderColor: colors.border, accentColor: colors.primary }}
                                                checked={modalFormData.isCombined || false}
                                                onChange={e => setModalFormData({ ...modalFormData, isCombined: e.target.checked })}
                                            />
                                            <label htmlFor="combined-checkbox" className="text-[10px] font-bold uppercase tracking-widest cursor-pointer" style={{ color: colors.textMain }}>
                                                Combined to Hall
                                                <span className="block text-[8px] opacity-40 normal-case font-medium mt-0.5">Check if this venue is part of a combined hall configuration</span>
                                            </label>
                                        </div>
                                    </div>

                                    {/* Shapes Section */}
                                    <div className="space-y-3 pt-4 border-t" style={{ borderColor: colors.border }}>
                                        <div className="flex justify-between items-center">
                                            <label className="text-[10px] uppercase font-bold tracking-widest opacity-50">Available Shapes & Capacities</label>
                                            <button
                                                onClick={() => {
                                                    const shapes = modalFormData.shapes || [];
                                                    setModalFormData({ ...modalFormData, shapes: [...shapes, { name: 'Theater', capacity: 0 }] });
                                                }}
                                                className="text-[10px] font-bold text-primary hover:underline">+ Add Shape</button>
                                        </div>
                                        <div className="space-y-2 max-h-40 overflow-auto pr-2 custom-scrollbar">
                                            {(modalFormData.shapes || []).map((shape: any, idx: number) => (
                                                <div key={idx} className="flex gap-2 items-center">
                                                    <select
                                                        className="flex-1 p-2 bg-black/20 border rounded-lg outline-none text-xs"
                                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                                        value={shape.name}
                                                        onChange={(e) => {
                                                            const newShapes = [...modalFormData.shapes];
                                                            newShapes[idx].name = e.target.value;
                                                            setModalFormData({ ...modalFormData, shapes: newShapes });
                                                        }}
                                                    >
                                                        {['Theater', 'Classroom', 'Banquet', 'U-Shape', 'Boardroom', 'Cocktail', 'Cabaret'].map(s => (
                                                            <option key={s} value={s} className="bg-black">{s}</option>
                                                        ))}
                                                    </select>
                                                    <input
                                                        type="number"
                                                        placeholder="Cap"
                                                        className="w-20 p-2 bg-black/20 border rounded-lg outline-none font-mono text-xs"
                                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                                        value={shape.capacity}
                                                        onChange={(e) => {
                                                            const newShapes = [...modalFormData.shapes];
                                                            newShapes[idx].capacity = Number(e.target.value);
                                                            setModalFormData({ ...modalFormData, shapes: newShapes });
                                                        }}
                                                    />
                                                    <button
                                                        onClick={() => {
                                                            const newShapes = modalFormData.shapes.filter((_: any, i: number) => i !== idx);
                                                            setModalFormData({ ...modalFormData, shapes: newShapes });
                                                        }}
                                                        className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg">
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                            {modalType === 'user' && (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[10px] uppercase font-bold tracking-widest mb-0.5 block opacity-50">Full Name</label>
                                            <input type="text" placeholder="John Doe" className="w-full p-2.5 bg-black/20 border rounded-lg outline-none text-sm" style={{ borderColor: colors.border, color: colors.textMain }}
                                                value={modalFormData.name || ''} onChange={e => setModalFormData({ ...modalFormData, name: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase font-bold tracking-widest mb-0.5 block opacity-50">Username</label>
                                            <input type="text" placeholder="johndoe" className="w-full p-2.5 bg-black/20 border rounded-lg outline-none text-sm" style={{ borderColor: colors.border, color: colors.textMain }}
                                                value={modalFormData.username || ''} onChange={e => setModalFormData({ ...modalFormData, username: e.target.value })} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] uppercase font-bold tracking-widest mb-0.5 block opacity-50">Email Address</label>
                                        <input type="email" placeholder="john@advancedsales.com" className="w-full p-2.5 bg-black/20 border rounded-lg outline-none text-sm" style={{ borderColor: colors.border, color: colors.textMain }}
                                            value={modalFormData.email || ''} onChange={e => setModalFormData({ ...modalFormData, email: e.target.value })} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[10px] uppercase font-bold tracking-widest mb-0.5 block opacity-50">Property Assignment</label>
                                            <select className="w-full p-2.5 bg-black/20 border rounded-lg outline-none text-sm" style={{ borderColor: colors.border, color: colors.textMain }}
                                                value={modalFormData.propertyId || ''} onChange={e => setModalFormData({ ...modalFormData, propertyId: e.target.value })}>
                                                <option value="" className="bg-black">Unassigned</option>
                                                {properties.map(p => <option key={p.id} value={p.id} className="bg-black">{p.name}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase font-bold tracking-widest mb-0.5 block opacity-50">User type / role</label>
                                            <select className="w-full p-2.5 bg-black/20 border rounded-lg outline-none text-sm" style={{ borderColor: colors.border, color: colors.textMain }}
                                                value={modalFormData.role || 'Sales Executive'}
                                                onChange={(e) =>
                                                    setModalFormData({
                                                        ...modalFormData,
                                                        role: e.target.value,
                                                        permissionGrants: [],
                                                        permissionRevokes: [],
                                                    })
                                                }>
                                                {USER_ROLE_OPTIONS.map((r) => (
                                                    <option key={r} value={r} className="bg-black">{r}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    {normalizeUserRole({ role: modalFormData.role }) === 'Admin' ? (
                                        <p className="text-xs rounded-lg border p-2.5 leading-snug" style={{ borderColor: colors.border, color: colors.textMuted }}>
                                            Administrators have full access including Global Staff Management and all settings. Individual permission toggles do not apply.
                                        </p>
                                    ) : (
                                        <div className="space-y-1.5 rounded-lg border p-3" style={{ borderColor: colors.border }}>
                                            <label
                                                className="text-[9px] uppercase font-bold tracking-widest block opacity-60 leading-tight"
                                                style={{ color: colors.textMain }}
                                            >
                                                Permissions (defaults for this role; pick a section, then toggle)
                                            </label>
                                            <div
                                                className="flex flex-wrap gap-1 pb-1.5 border-b max-h-[4.5rem] overflow-y-auto custom-scrollbar"
                                                style={{ borderColor: colors.border }}
                                            >
                                                {USER_MODAL_SECTIONS.map((sec) => (
                                                    <button
                                                        key={sec.id}
                                                        type="button"
                                                        onClick={() => setUserModalPermSection(sec.id)}
                                                        className={`px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wide border transition-all ${
                                                            userModalPermSection === sec.id ? 'border-2' : 'opacity-75 hover:opacity-100'
                                                        }`}
                                                        style={{
                                                            borderColor:
                                                                userModalPermSection === sec.id ? colors.primary : colors.border,
                                                            backgroundColor:
                                                                userModalPermSection === sec.id ? colors.primary + '18' : 'transparent',
                                                            color: colors.textMain,
                                                        }}
                                                    >
                                                        {sec.title}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="space-y-1 max-h-[min(32vh,14rem)] overflow-y-auto custom-scrollbar pr-1 pt-1 min-h-[3rem]">
                                                {USER_MODAL_SECTIONS.filter((s) => s.id === userModalPermSection).map((sec) => (
                                                    <div key={sec.id}>
                                                        {sec.description ? (
                                                            <p className="text-[11px] mb-2 leading-snug" style={{ color: colors.textMuted }}>
                                                                {sec.description}
                                                            </p>
                                                        ) : null}
                                                        {sec.permissions.length === 0 && !sec.description ? (
                                                            <p className="text-xs" style={{ color: colors.textMuted }}>
                                                                No toggles in this section yet.
                                                            </p>
                                                        ) : null}
                                                        {sec.permissions.map((perm) => {
                                                            const checked = getEffectivePermissionSet({
                                                                role: modalFormData.role,
                                                                permissionGrants: modalFormData.permissionGrants,
                                                                permissionRevokes: modalFormData.permissionRevokes,
                                                            }).has(perm);
                                                            return (
                                                                <label
                                                                    key={perm}
                                                                    className="flex items-start gap-2 cursor-pointer text-[11px] py-0.5"
                                                                    style={{ color: colors.textMain }}
                                                                >
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={checked}
                                                                        onChange={() => toggleUserPermission(perm)}
                                                                        className="mt-0.5 rounded border shrink-0"
                                                                        style={{ borderColor: colors.border }}
                                                                    />
                                                                    <span className="leading-snug">{PERMISSION_LABELS[perm]}</span>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Yearly Sales Targets */}
                                    <div className="space-y-2 pt-3 border-t" style={{ borderColor: colors.border }}>
                                        <div className="flex justify-between items-center gap-2">
                                            <label className="text-[9px] uppercase font-bold tracking-widest opacity-50" style={{ color: colors.textMain }}>Yearly Sales Calls Targets</label>
                                            <button
                                                onClick={() => {
                                                    const currentYear = new Date().getFullYear();
                                                    const targets = modalFormData.stats?.yearlyTargets || {};
                                                    const years = Object.keys(targets).map(Number);
                                                    const nextYear = years.length > 0 ? Math.max(...years) + 1 : currentYear;

                                                    setModalFormData({
                                                        ...modalFormData,
                                                        stats: {
                                                            ...modalFormData.stats,
                                                            yearlyTargets: { ...targets, [nextYear]: 0 }
                                                        }
                                                    });
                                                }}
                                                className="text-[10px] font-bold text-primary hover:underline">+ Add Target for Next Year</button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 max-h-28 overflow-auto pr-1 custom-scrollbar">
                                            {Object.entries(modalFormData.stats?.yearlyTargets || {}).map(([year, target]: [string, any]) => (
                                                <div key={year} className="flex gap-2 items-center bg-black/10 p-2 rounded-xl border border-white/5">
                                                    <span className="text-[10px] font-black italic w-12" style={{ color: colors.primary }}>{year}</span>
                                                    <input
                                                        type="number"
                                                        placeholder="Annual Target"
                                                        className="flex-1 bg-transparent border-none outline-none font-mono text-xs"
                                                        style={{ color: colors.textMain }}
                                                        value={target}
                                                        onChange={(e) => {
                                                            setModalFormData({
                                                                ...modalFormData,
                                                                stats: {
                                                                    ...modalFormData.stats,
                                                                    yearlyTargets: {
                                                                        ...modalFormData.stats.yearlyTargets,
                                                                        [year]: Number(e.target.value)
                                                                    }
                                                                }
                                                            });
                                                        }}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {!editingItem?.id ? (
                                        <div>
                                            <label className="text-[10px] uppercase font-bold tracking-widest mb-0.5 block opacity-50">Initial Password</label>
                                            <input type="password" placeholder="••••••••" className="w-full p-2.5 bg-black/20 border rounded-lg outline-none text-sm" style={{ borderColor: colors.border, color: colors.textMain }}
                                                value={modalFormData.password || ''} onChange={e => setModalFormData({ ...modalFormData, password: e.target.value })} />
                                        </div>
                                    ) : (
                                        <div className="pt-3 border-t" style={{ borderColor: colors.border }}>
                                            {!modalFormData.showReset ? (
                                                <button
                                                    onClick={() => setModalFormData({ ...modalFormData, showReset: true })}
                                                    className="w-full py-2.5 rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-all font-bold text-[11px]"
                                                >
                                                    Reset Security Credentials
                                                </button>
                                            ) : (
                                                <div className="space-y-3">
                                                    <div className="flex justify-between items-center">
                                                        <h4 className="text-[10px] uppercase font-bold tracking-widest text-primary">Set new password</h4>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setModalFormData({
                                                                    ...modalFormData,
                                                                    showReset: false,
                                                                    newPass: '',
                                                                    confirmPass: '',
                                                                    currentPass: '',
                                                                })
                                                            }
                                                            className="text-[10px] text-muted-foreground hover:text-white"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                    {appIsAdmin ? (
                                                        <p className="text-[11px] leading-relaxed" style={{ color: colors.textMuted }}>
                                                            Enter the new password twice, then click Update user. Must be at least 8 characters and use 3 of: lowercase, uppercase, digit, symbol. The user will be signed out of existing sessions.
                                                        </p>
                                                    ) : null}
                                                    <div className="grid grid-cols-1 gap-3">
                                                        <input
                                                            type="password"
                                                            placeholder="New password"
                                                            autoComplete="new-password"
                                                            className="w-full p-2.5 bg-black/40 border rounded-lg text-xs outline-none"
                                                            style={{ borderColor: colors.border, color: colors.textMain }}
                                                            value={modalFormData.newPass || ''}
                                                            onChange={(e) => setModalFormData({ ...modalFormData, newPass: e.target.value })}
                                                        />
                                                        <input
                                                            type="password"
                                                            placeholder="Confirm new password"
                                                            autoComplete="new-password"
                                                            className="w-full p-2.5 bg-black/40 border rounded-lg text-xs outline-none"
                                                            style={{ borderColor: colors.border, color: colors.textMain }}
                                                            value={modalFormData.confirmPass || ''}
                                                            onChange={(e) =>
                                                                setModalFormData({ ...modalFormData, confirmPass: e.target.value })
                                                            }
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                            {modalType === 'assignUser' && (
                                <div className="space-y-4">
                                    <p className="text-sm" style={{ color: colors.textMuted }}>Select users to assign to this property:</p>
                                    <div className="max-h-60 overflow-auto space-y-2 custom-scrollbar pr-2">
                                        {users.map(user => {
                                            const isSelected = modalFormData.selectedUserIds?.includes(user.id);
                                            return (
                                                <div
                                                    key={user.id}
                                                    onClick={() => {
                                                        const current = modalFormData.selectedUserIds || [];
                                                        const next = isSelected
                                                            ? current.filter((id: string) => id !== user.id)
                                                            : [...current, user.id];
                                                        setModalFormData({ ...modalFormData, selectedUserIds: next });
                                                    }}
                                                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${isSelected ? 'bg-primary/10 border-primary' : 'bg-black/20 border-transparent hover:border-white/10'}`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold" style={{ color: isSelected ? colors.primary : colors.textMain }}>
                                                            {(user.name || user.username || "?").charAt(0)}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-bold" style={{ color: colors.textMain }}>{user.name}</p>
                                                            <p className="text-[10px]" style={{ color: colors.textMuted }}>{user.role}</p>
                                                        </div>
                                                    </div>
                                                    {isSelected && <Check size={16} className="text-primary" />}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="shrink-0 px-4 py-3 sm:px-5 sm:py-3.5 border-t flex justify-end gap-2 sm:gap-3" style={{ borderColor: colors.border }}>
                            <button onClick={() => setShowModal(false)} className="px-4 sm:px-6 py-2 rounded-xl text-sm font-bold border hover:bg-white/5" style={{ borderColor: colors.border, color: colors.textMain }}>Cancel</button>
                            <button onClick={handleSave} className="px-5 sm:px-8 py-2 rounded-xl bg-primary text-black text-sm font-bold hover:opacity-90 transition-all shadow-lg shadow-primary/20">
                                {modalType === 'user'
                                    ? editingItem?.id
                                        ? 'Update'
                                        : 'Create'
                                    : editingItem
                                      ? 'Update'
                                      : 'Create'}{' '}
                                {modalType}
                            </button>
                        </div>
                    </div>
                    </div>
                </div>
            )}
        </div>
    );
}
