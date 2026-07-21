import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, Plus, Building2, Camera, GitMerge, AlertCircle, ChevronRight } from 'lucide-react';
import CRMProfileView from './CRMProfileView';
import AddAccountModal from './AddAccountModal';
import { accountToLead, leadToAccount, contactDisplayName } from './accountLeadMapping';
import { resolveAccountTypesForProperty } from './propertyTaxonomy';
import {
    CONTRACTS_CHANGED_EVENT,
    attachSignedContractFile,
    deleteContractRecord,
    downloadContractArtifact,
    getContractRecords,
    triggerBlobDownload,
    updateContractRecordMeta,
    updateContractRecordStatus,
    type ContractRecord,
    type ContractStatus,
} from './contractsStore';
import {
    flattenCrmLeads,
    filterRequestsForAccount,
    filterSalesCallsForAccount,
    buildRequestStatsByAccount,
} from './accountProfileData';
import { formatCompactCurrency } from './formatCompactCurrency';
import {
    isAccountsPageReadOnly,
    canDeleteAccounts,
    canDeleteContracts,
    canManageManualTimeline,
    isSystemAdmin,
    canMergeAccountsAndAssignOwner,
} from './userPermissions';
import type { CurrencyCode } from './currency';

export type AccountPerfDateRange = { from: string; to: string };
import { apiUrl } from './backendApi';
import ConfirmDialog from './ConfirmDialog';
import AccountLinkedRequestsModal from './AccountLinkedRequestsModal';
import AccountBillingPanel from './AccountBillingPanel';
import SystemNoticeModal from './SystemNoticeModal';
import {
    canDeleteRequests,
    canLinkRequestPromotions,
    canMutateOperational,
} from './userPermissions';
import { resolveUserAttributionId, recordVisibleOnProperty, requestInProperty } from './userProfileMetrics';
import { applyAccountMergeInMemory, persistAccountMergeToBackend } from './accountMergeUtils';
import { repointContractRecordsForAccountMerge } from './contractsStore';
import {
    compareAccountNames,
    findPotentialDuplicateAccounts,
    normalizeAccountNameKey,
    isScanDuplicateQueueItemStale,
    isScannedContactOnAccount,
    buildSystemDuplicateItems,
} from './accountDuplicateUtils';
import { getAccountProfileGaps, isAccountProfileIncomplete, meaningfulContactEmail, meaningfulContactPhone } from './accountProfileCompleteness';
import { getResolvedFormSchema } from './formConfigurations';
import {
    deleteAccountDuplicateQueueItem,
    extractBusinessCard,
    listAccountDuplicateQueue,
    upsertAccountDuplicateQueueItem,
} from './accountScanApi';

const COLUMN_STORAGE_KEY = 'visatour_accounts_column_order_v2';
const DEFAULT_COLUMN_ORDER = ['name', 'segment', 'city', 'contact', 'phone', 'email', 'totalRev', 'totalReq'];
const DEFAULT_CONTACT_COLUMN_ORDER = ['contact', 'segment', 'city', 'phone', 'email', 'accountName'];

type AccountsListSort = 'name_az' | 'rev_high' | 'rev_low';
type AccountsPageTab = 'accounts' | 'contacts';
type AccountsListPageSize = 30 | 60 | 100;

interface AccountsPageProps {
    theme: any;
    accounts: any[];
    setAccounts: React.Dispatch<React.SetStateAction<any[]>>;
    sharedRequests: any[];
    crmLeads: Record<string, any[]>;
    currentUser: any;
    onOpenRequest: (requestId: string) => void;
    onNavigateToCrmWithAccount: (accountId: string) => void;
    onNavigateToContractsWithAccount?: (accountId: string) => void;
    setCrmLeads: React.Dispatch<React.SetStateAction<Record<string, any[]>>>;
    accountTypeOptions?: string[];
    currency?: CurrencyCode;
    activeProperty?: any;
    /** Controlled from AS shell header when viewing an account profile. */
    shellAccountPerformanceRange: AccountPerfDateRange;
    onShellAccountPerformanceRangeChange: (r: AccountPerfDateRange) => void;
    onAccountProfileShellStateChange?: (state: { open: boolean; leadKey: string | null }) => void;
    setSharedRequests: React.Dispatch<React.SetStateAction<any[]>>;
    assignableUsersForAccounts?: { id: string; name: string }[];
    segmentOptions?: string[];
    promotionOptions?: any[];
    onAfterRequestsMutate?: () => void;
}

export default function AccountsPage({
    theme,
    accounts,
    setAccounts,
    sharedRequests,
    crmLeads,
    currentUser,
    onOpenRequest,
    onNavigateToCrmWithAccount,
    onNavigateToContractsWithAccount,
    setCrmLeads,
    accountTypeOptions,
    currency = 'SAR',
    activeProperty,
    shellAccountPerformanceRange,
    onShellAccountPerformanceRangeChange,
    onAccountProfileShellStateChange,
    setSharedRequests,
    assignableUsersForAccounts = [],
    segmentOptions = [],
    promotionOptions = [],
    onAfterRequestsMutate,
}: AccountsPageProps) {
    const colors = theme.colors;
    const profileReadOnly = isAccountsPageReadOnly(currentUser);
    const allowDeleteAccount = canDeleteAccounts(currentUser);
    const allowDeleteContracts = canDeleteContracts(currentUser);
    const allowManualTimeline = canManageManualTimeline(currentUser);
    const allowTagAdmin = isSystemAdmin(currentUser);
    const allowAccountMergeAndOwner = canMergeAccountsAndAssignOwner(currentUser);
    const canDelRequests = canDeleteRequests(currentUser);
    const canLinkPromos = canLinkRequestPromotions(currentUser);
    const canMutate = canMutateOperational(currentUser);
    const [profileRequestsListOpen, setProfileRequestsListOpen] = useState(false);
    const [billingAccount, setBillingAccount] = useState<any | null>(null);
    const [systemNotice, setSystemNotice] = useState<{ title: string; message: string } | null>(null);
    const [search, setSearch] = useState('');
    const [listTab, setListTab] = useState<AccountsPageTab>('accounts');
    const [listSort, setListSort] = useState<AccountsListSort>('name_az');
    const [listPageSize, setListPageSize] = useState<AccountsListPageSize>(30);
    const [listCurrentPage, setListCurrentPage] = useState(1);
    const [cityFilter, setCityFilter] = useState('');
    const [segmentFilter, setSegmentFilter] = useState('');
    const [filterWithContract, setFilterWithContract] = useState(false);
    const [filterWithoutContract, setFilterWithoutContract] = useState(false);
    const [profileLead, setProfileLead] = useState<any | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditAccountModal, setShowEditAccountModal] = useState(false);
    const [editingAccountRow, setEditingAccountRow] = useState<any | null>(null);
    const flatCrmLeads = useMemo(() => flattenCrmLeads(crmLeads), [crmLeads]);
    const [columnOrder, setColumnOrder] = useState<string[]>(() => {
        try {
            const raw = localStorage.getItem(COLUMN_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length) return parsed;
            }
        } catch { /* ignore */ }
        return [...DEFAULT_COLUMN_ORDER];
    });
    const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
    const [accountContracts, setAccountContracts] = useState<ContractRecord[]>([]);
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [pendingDeleteAccountId, setPendingDeleteAccountId] = useState<string | null>(null);
    const [deleteImpactMessage, setDeleteImpactMessage] = useState('');
    const [scanBusy, setScanBusy] = useState(false);
    const [scanMeta, setScanMeta] = useState<any | null>(null);
    const [scanPrefillAccount, setScanPrefillAccount] = useState<any | null>(null);
    const [duplicateQueue, setDuplicateQueue] = useState<any[]>([]);
    const [showDuplicateQueue, setShowDuplicateQueue] = useState(false);
    const [showIncompleteQueue, setShowIncompleteQueue] = useState(false);
    const scanAccountInputRef = useRef<HTMLInputElement | null>(null);
    const scanPendingDuplicateIdsRef = useRef<string[]>([]);

    useEffect(() => {
        try {
            localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(columnOrder));
        } catch { /* ignore */ }
    }, [columnOrder]);

    useEffect(() => {
        onAccountProfileShellStateChange?.({
            open: !!profileLead,
            leadKey: profileLead ? String(profileLead.accountId || profileLead.id || '') : null,
        });
    }, [profileLead, onAccountProfileShellStateChange]);

    useEffect(() => {
        const refresh = () => setAccountContracts(getContractRecords());
        refresh();
        window.addEventListener(CONTRACTS_CHANGED_EVENT, refresh);
        return () => window.removeEventListener(CONTRACTS_CHANGED_EVENT, refresh);
    }, []);

    useEffect(() => {
        const propertyId = activeProperty?.id ? String(activeProperty.id) : '';
        listAccountDuplicateQueue(propertyId)
            .then((rows) =>
                setDuplicateQueue(
                    rows.filter((row: any) => String(row?.status || 'open') === 'open')
                )
            )
            .catch(() => setDuplicateQueue([]));
    }, [activeProperty?.id]);

    const normalizeContactKey = (contact: any) => {
        const email = String(contact?.email || '').trim().toLowerCase();
        const phone = String(contact?.phone || '').replace(/\D+/g, '');
        const name = normalizeAccountNameKey(contactDisplayName(contact));
        return email || phone || name;
    };

    const appendContactToAccount = (accountId: string, contact: any) => {
        const key = normalizeContactKey(contact);
        setAccounts((prev: any[]) =>
            prev.map((a: any) => {
                if (String(a.id) !== String(accountId)) return a;
                const existing = Array.isArray(a.contacts) ? a.contacts : [];
                const hasDup = existing.some((row: any) => normalizeContactKey(row) === key);
                if (hasDup) return a;
                return { ...a, contacts: [...existing, contact] };
            })
        );
    };

    const columnLabels: Record<string, string> = {
        name: 'Account Name',
        segment: 'Segment',
        city: 'City',
        contact: 'Contact Person',
        phone: 'Phone',
        email: 'Email',
        totalRev: 'Total Rev',
        totalReq: 'Total Req',
    };

    const contactColumnLabels: Record<string, string> = {
        contact: 'Contact Person',
        segment: 'Segment',
        city: 'City',
        phone: 'Phone',
        email: 'Email',
        accountName: 'Account Name',
    };

    const scopedSharedRequests = useMemo(() => {
        const pid = String(activeProperty?.id || '').trim();
        if (!pid) return [];
        return (Array.isArray(sharedRequests) ? sharedRequests : []).filter((r: any) =>
            requestInProperty(r, pid)
        );
    }, [sharedRequests, activeProperty?.id]);

    const accountsSameProperty = useMemo(() => {
        const pid = String(activeProperty?.id || '').trim();
        if (!pid) return [];
        return accounts.filter((a: any) => recordVisibleOnProperty(pid, a?.propertyId));
    }, [accounts, activeProperty?.id]);

    const requestStatsByAccountId = useMemo(
        () => buildRequestStatsByAccount(accountsSameProperty, scopedSharedRequests),
        [accountsSameProperty, scopedSharedRequests]
    );

    const segmentFilterOptions = useMemo(() => {
        const fromProp =
            Array.isArray(accountTypeOptions) && accountTypeOptions.length
                ? accountTypeOptions
                : resolveAccountTypesForProperty(String(activeProperty?.id || ''), activeProperty);
        return [...new Set(fromProp.map((x) => String(x).trim()).filter(Boolean))].sort((a, b) =>
            a.localeCompare(b)
        );
    }, [accountTypeOptions, activeProperty]);

    const accountIdsWithContract = useMemo(() => {
        const set = new Set<string>();
        for (const c of accountContracts) {
            const aid = String(c.accountId || '').trim();
            if (aid) set.add(aid);
        }
        return set;
    }, [accountContracts]);

    const filtered = useMemo(() => {
        const t = search.trim().toLowerCase();
        const cityQ = cityFilter.trim().toLowerCase();
        const contractNarrow = filterWithContract !== filterWithoutContract;
        const pid = String(activeProperty?.id || '').trim();

        return accounts.filter((a: any) => {
            if (!pid || !recordVisibleOnProperty(pid, a?.propertyId)) return false;
            if (t) {
                const contacts = Array.isArray(a.contacts) ? a.contacts : [];
                const contactHay = contacts.flatMap((c: any) => [
                    contactDisplayName(c),
                    c.firstName,
                    c.lastName,
                    c.phone,
                    c.email,
                    c.city,
                ]);
                const c0 = contacts[0] || {};
                const hay = [a.name, a.type, a.city, ...contactHay, c0.firstName, c0.lastName, c0.phone, c0.email]
                    .map((x) => String(x || '').toLowerCase())
                    .join(' ');
                if (!hay.includes(t)) return false;
            }
            if (cityQ) {
                if (!String(a.city || '').toLowerCase().includes(cityQ)) return false;
            }
            if (segmentFilter) {
                if (String(a.type || '').trim() !== segmentFilter) return false;
            }
            if (contractNarrow) {
                const has = accountIdsWithContract.has(String(a.id));
                if (filterWithContract && !filterWithoutContract) return has;
                if (filterWithoutContract && !filterWithContract) return !has;
            }
            return true;
        });
    }, [
        accounts,
        search,
        cityFilter,
        segmentFilter,
        filterWithContract,
        filterWithoutContract,
        accountIdsWithContract,
        activeProperty?.id,
    ]);

    const sortedFiltered = useMemo(() => {
        const rows = [...filtered];
        const stat = (id: string) => requestStatsByAccountId.get(String(id)) || { revSar: 0, reqCount: 0 };
        const byName = (a: any, b: any) =>
            compareAccountNames(a?.name, b?.name) || String(a?.id || '').localeCompare(String(b?.id || ''));
        if (listSort === 'rev_high') {
            rows.sort((a, b) => stat(b.id).revSar - stat(a.id).revSar || byName(a, b));
        } else if (listSort === 'rev_low') {
            rows.sort((a, b) => stat(a.id).revSar - stat(b.id).revSar || byName(a, b));
        } else {
            rows.sort(byName);
        }
        return rows;
    }, [filtered, listSort, requestStatsByAccountId]);

    const sortedContactRows = useMemo(() => {
        const rows: { key: string; account: any; contact: any; contactIndex: number }[] = [];
        for (const account of sortedFiltered) {
            const contacts = Array.isArray(account.contacts) ? account.contacts : [];
            contacts.forEach((contact: any, contactIndex: number) => {
                rows.push({
                    key: `${account.id}::${contactIndex}`,
                    account,
                    contact,
                    contactIndex,
                });
            });
        }
        const byContactName = (
            a: { key: string; account: any; contact: any },
            b: { key: string; account: any; contact: any }
        ) =>
            compareAccountNames(contactDisplayName(a.contact), contactDisplayName(b.contact)) ||
            compareAccountNames(a.account?.name, b.account?.name) ||
            String(a.key).localeCompare(String(b.key));
        rows.sort(byContactName);
        return rows;
    }, [sortedFiltered]);

    const listTotalItems = listTab === 'accounts' ? sortedFiltered.length : sortedContactRows.length;
    const listTotalPages = Math.max(1, Math.ceil(listTotalItems / listPageSize) || 1);

    useEffect(() => {
        setListCurrentPage(1);
    }, [search, cityFilter, segmentFilter, filterWithContract, filterWithoutContract, listSort, listTab, listPageSize]);

    useEffect(() => {
        if (listCurrentPage > listTotalPages) setListCurrentPage(listTotalPages);
    }, [listCurrentPage, listTotalPages]);

    const pagedAccounts = useMemo(() => {
        const start = (listCurrentPage - 1) * listPageSize;
        return sortedFiltered.slice(start, start + listPageSize);
    }, [sortedFiltered, listCurrentPage, listPageSize]);

    const pagedContacts = useMemo(() => {
        const start = (listCurrentPage - 1) * listPageSize;
        return sortedContactRows.slice(start, start + listPageSize);
    }, [sortedContactRows, listCurrentPage, listPageSize]);

    const listShowingFrom = listTotalItems > 0 ? (listCurrentPage - 1) * listPageSize + 1 : 0;
    const listShowingTo =
        listTotalItems > 0 ? Math.min(listCurrentPage * listPageSize, listTotalItems) : 0;

    const listPageNumbers = useMemo(() => {
        if (listTotalPages <= 12) {
            return Array.from({ length: listTotalPages }, (_, i) => i + 1);
        }
        let start = Math.max(1, listCurrentPage - 3);
        let end = Math.min(listTotalPages, start + 6);
        start = Math.max(1, end - 6);
        return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    }, [listCurrentPage, listTotalPages]);

    const systemDuplicateItems = useMemo(
        () => buildSystemDuplicateItems(accountsSameProperty),
        [accountsSameProperty]
    );

    const activeScanDuplicateQueue = useMemo(
        () => duplicateQueue.filter((item) => !isScanDuplicateQueueItemStale(item, accountsSameProperty)),
        [duplicateQueue, accountsSameProperty]
    );

    const allDuplicateItems = useMemo(() => {
        return [...systemDuplicateItems, ...activeScanDuplicateQueue];
    }, [systemDuplicateItems, activeScanDuplicateQueue]);

    useEffect(() => {
        let cancelled = false;
        const stale = duplicateQueue.filter((item) =>
            isScanDuplicateQueueItemStale(item, accountsSameProperty)
        );
        if (!stale.length) return;
        (async () => {
            const pid = activeProperty?.id ? String(activeProperty.id) : '';
            const staleIds = stale.map((x) => String(x.id));
            for (const id of staleIds) {
                if (cancelled) return;
                try {
                    await deleteAccountDuplicateQueueItem(id, pid);
                } catch {
                    // Best-effort prune of resolved scan queue rows.
                }
            }
            if (!cancelled) {
                const gone = new Set(staleIds);
                setDuplicateQueue((prev) => prev.filter((x) => !gone.has(String(x.id))));
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [duplicateQueue, accountsSameProperty, activeProperty?.id]);

    const propertyIdForForms = activeProperty?.id ? String(activeProperty.id) : undefined;

    const accountFormSchema = useMemo(
        () => getResolvedFormSchema(propertyIdForForms, 'account_new', activeProperty),
        [propertyIdForForms, activeProperty]
    );

    const incompleteAccounts = useMemo(() => {
        return accountsSameProperty
            .filter((a: any) => isAccountProfileIncomplete(a, propertyIdForForms, activeProperty, accountFormSchema))
            .sort((a: any, b: any) => compareAccountNames(a?.name, b?.name));
    }, [accountsSameProperty, propertyIdForForms, activeProperty, accountFormSchema]);

    const openAccountForEdit = (account: any) => {
        if (!account || profileReadOnly) return;
        setEditingAccountRow(account);
        setShowEditAccountModal(true);
    };

    const handleEditAccountSave = (data: any) => {
        if (!data?.id) return;
        const merged = { ...(accounts.find((a: any) => a.id === data.id) || {}), ...data };
        setAccounts((prev: any[]) => prev.map((a: any) => (a.id === data.id ? merged : a)));
        if (profileLead && String(profileLead.accountId || profileLead.id) === String(data.id)) {
            setProfileLead(accountToLead(merged));
            appendProfileAudit('Account updated', 'Account details saved from edit modal');
        }
        setShowEditAccountModal(false);
        setEditingAccountRow(null);
    };

    const handleColumnDragStart = (column: string) => setDraggedColumn(column);
    const handleColumnDrop = (targetColumn: string) => {
        if (!draggedColumn || draggedColumn === targetColumn) return;
        const newOrder = [...columnOrder];
        const di = newOrder.indexOf(draggedColumn);
        const ti = newOrder.indexOf(targetColumn);
        newOrder.splice(di, 1);
        newOrder.splice(ti, 0, draggedColumn);
        setColumnOrder(newOrder);
        setDraggedColumn(null);
    };

    const purgeScanDuplicateQueueIds = async (ids: string[]) => {
        if (!ids.length) return;
        const pid = activeProperty?.id ? String(activeProperty.id) : '';
        for (const id of ids) {
            try {
                await deleteAccountDuplicateQueueItem(id, pid);
            } catch {
                // Best-effort cleanup for resolved scan sessions.
            }
        }
        const gone = new Set(ids);
        setDuplicateQueue((prev) => prev.filter((x) => !gone.has(String(x.id))));
    };

    const handleSaveNew = (accountData: any) => {
        if (!accountData?.name) return;
        const pendingQueueIds = [...scanPendingDuplicateIdsRef.current];
        scanPendingDuplicateIdsRef.current = [];
        const u = currentUser?.name || currentUser?.username || currentUser?.email || 'User';
        const act = {
            id: `acct-${Date.now()}`,
            at: new Date().toISOString(),
            title: 'Account created',
            body: 'Account created from Accounts.',
            user: u,
        };
        setAccounts((prev: any[]) => [
            {
                id: `A${Date.now()}`,
                ...accountData,
                propertyId: accountData.propertyId || activeProperty?.id || 'P-GLOBAL',
                createdByUserId: resolveUserAttributionId(currentUser) || undefined,
                accountOwnerName: u,
                activities: [...(accountData.activities || []), act],
            },
            ...prev,
        ]);
        setShowAddModal(false);
        setScanPrefillAccount(null);
        setScanMeta(null);
        void purgeScanDuplicateQueueIds(pendingQueueIds);
    };

    const discardScanPendingDuplicateQueue = async () => {
        const pending = [...scanPendingDuplicateIdsRef.current];
        scanPendingDuplicateIdsRef.current = [];
        await purgeScanDuplicateQueueIds(pending);
    };

    const handleCloseAddModal = async () => {
        await discardScanPendingDuplicateQueue();
        setShowAddModal(false);
        setScanPrefillAccount(null);
        setScanMeta(null);
    };

    const openAccountScanPicker = () => {
        if (scanBusy) return;
        scanAccountInputRef.current?.click();
    };

    const handleAccountCardScan = async (file: File) => {
        const propertyId = activeProperty?.id ? String(activeProperty.id) : '';
        const parsed = await extractBusinessCard(file, propertyId);
        if (!parsed.ok) {
            throw new Error(parsed.error || 'Could not extract business card details.');
        }
        const prefill = {
            ...(parsed.account || {}),
            contacts: Array.isArray(parsed.contacts) && parsed.contacts.length ? parsed.contacts : [],
        };
        const matches = findPotentialDuplicateAccounts(
            String(prefill?.name || ''),
            accountsSameProperty,
            { propertyId }
        );
        scanPendingDuplicateIdsRef.current = [];
        if (matches.length && prefill.contacts?.[0]) {
            const scannedContact = prefill.contacts[0];
            const hasScannedContact = meaningfulContactEmail(scannedContact?.email) || meaningfulContactPhone(scannedContact?.phone);
            if (!hasScannedContact) {
                // No real contact details — skip queue noise from test scans.
            } else {
            for (const acc of matches) {
                if (isScannedContactOnAccount(acc, scannedContact)) continue;
                const existing = duplicateQueue.find(
                    (row: any) =>
                        String(row.propertyId || '') === propertyId &&
                        String(row.candidateAccountId || '') === String(acc.id) &&
                        normalizeAccountNameKey(String(row.scannedAccountName || '')) ===
                            normalizeAccountNameKey(String(prefill.name || ''))
                );
                if (existing) continue;
                const queueItem = {
                    propertyId,
                    createdAt: new Date().toISOString(),
                    status: 'open',
                    source: 'business-card-scan',
                    scannedAccountName: prefill.name || '',
                    candidateAccountId: String(acc.id),
                    candidateAccountName: String(acc.name || ''),
                    scannedContact,
                    rawText: parsed.rawText || '',
                };
                try {
                    const saved = await upsertAccountDuplicateQueueItem(queueItem);
                    scanPendingDuplicateIdsRef.current.push(String(saved.id));
                    setDuplicateQueue((prev) => [saved, ...prev.filter((x) => String(x.id) !== String(saved.id))]);
                } catch {
                    // Keep UI flow responsive even if queue save fails.
                }
            }
            }
        }
        setScanMeta({ confidence: parsed.confidence, rawText: parsed.rawText, unmapped: parsed.unmapped });
        setScanPrefillAccount(prefill);
        setShowAddModal(true);
    };

    const handleAccountScanInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setScanBusy(true);
        try {
            await handleAccountCardScan(file);
        } catch (err: any) {
            window.alert(err?.message || 'Could not scan this business card.');
        } finally {
            setScanBusy(false);
        }
    };

    const syncAccountFromLead = (lead: any) => {
        const aid = lead.accountId || lead.id;
        setAccounts((prev: any[]) =>
            prev.map((a: any) => (a.id === aid ? leadToAccount(lead, a) : a))
        );
        if (Array.isArray(lead.tags) && aid) {
            setCrmLeads((prev) => {
                const out = { ...prev } as Record<string, any[]>;
                (Object.keys(out) as string[]).forEach((k) => {
                    out[k] = (out[k] || []).map((l: any) =>
                        l.accountId === aid ? { ...l, tags: lead.tags } : l
                    );
                });
                return out;
            });
        }
    };

    const handleMergeAccountIntoCurrent = async (sourceAccountId: string) => {
        if (!profileLead) return;
        const destId = String(profileLead.accountId || profileLead.id || '');
        const sourceRow = accounts.find((a: any) => String(a.id) === String(sourceAccountId));
        const sourceName = String(sourceRow?.name || '').trim();
        const applied = applyAccountMergeInMemory({
            accounts,
            sharedRequests,
            crmLeads,
            destAccountId: destId,
            sourceAccountId,
        });
        if (!applied) return;
        const propertyId = String(activeProperty?.id || applied.mergedAccount?.propertyId || '').trim();
        if (!propertyId) {
            window.alert('Missing property context; cannot save merge to the server.');
            return;
        }
        try {
            await persistAccountMergeToBackend({
                mergedAccount: applied.mergedAccount,
                sourceAccountId: String(sourceAccountId),
                sourceAccountName: sourceName,
                nextRequests: applied.nextRequests,
                previousRequests: sharedRequests,
                nextCrmLeads: applied.nextCrmLeads,
                propertyId,
            });
        } catch (e: any) {
            window.alert(
                e?.message ||
                    'Could not save the merge to the server. Nothing was changed; please try again or contact support.'
            );
            return;
        }
        setAccounts(applied.nextAccounts);
        setSharedRequests(applied.nextRequests);
        setCrmLeads(applied.nextCrmLeads);
        repointContractRecordsForAccountMerge(
            String(sourceAccountId),
            destId,
            String(applied.mergedAccount.name || '')
        );
        setProfileLead(accountToLead(applied.mergedAccount));
        appendProfileAudit(
            'Accounts merged',
            `Merged duplicate account "${String(
                accounts.find((a: any) => String(a.id) === String(sourceAccountId))?.name || sourceAccountId
            )}" into this profile.`
        );
    };

    const handleAssignAccountOwner = (userId: string, ownerDisplayName: string) => {
        if (!profileLead) return;
        const destId = String(profileLead.accountId || profileLead.id || '');
        setAccounts((prev: any[]) => {
            const next = prev.map((a: any) =>
                String(a.id) === destId
                    ? { ...a, createdByUserId: userId, accountOwnerName: ownerDisplayName }
                    : a
            );
            const acc = next.find((a: any) => String(a.id) === destId);
            if (acc) setProfileLead(accountToLead(acc));
            return next;
        });
    };

    const appendProfileAudit = (action: string, details: string) => {
        if (!profileLead) return;
        const accountId = profileLead.accountId || profileLead.id;
        const entry = {
            id: `audit-${Date.now()}`,
            at: new Date().toISOString(),
            userName: currentUser?.name || currentUser?.username || 'User',
            action,
            details
        };
        setAccounts((prev: any[]) =>
            prev.map((a: any) =>
                a.id === accountId ? { ...a, profileAuditLog: [...(a.profileAuditLog || []), entry] } : a
            )
        );
        setProfileLead((prev: any) =>
            prev ? { ...prev, profileAuditLog: [...(prev.profileAuditLog || []), entry] } : prev
        );
    };

    const handleScanContactForCurrentProfile = async (file: File) => {
        if (!profileLead) return;
        const propertyId = activeProperty?.id ? String(activeProperty.id) : '';
        const parsed = await extractBusinessCard(file, propertyId);
        if (!parsed.ok) throw new Error(parsed.error || 'Could not read business card.');
        const scanned = Array.isArray(parsed.contacts) ? parsed.contacts[0] : null;
        if (!scanned) throw new Error('No contact details were extracted from this image.');
        const aid = String(profileLead.accountId || profileLead.id || '');
        appendContactToAccount(aid, scanned);
        setProfileLead((prev: any) => {
            if (!prev) return prev;
            const curContacts = Array.isArray(prev.contacts) ? prev.contacts : [];
            const already = curContacts.some((c: any) => normalizeContactKey(c) === normalizeContactKey(scanned));
            const nextContacts = already ? curContacts : [...curContacts, scanned];
            return { ...prev, contacts: nextContacts };
        });
        appendProfileAudit('Contact scanned', contactDisplayName(scanned) || 'Scanned business card contact');
    };

    const removeDuplicateQueueItem = async (item: any) => {
        const pid = activeProperty?.id ? String(activeProperty.id) : '';
        const itemId = String(item.id);
        await deleteAccountDuplicateQueueItem(itemId, pid);
        scanPendingDuplicateIdsRef.current = scanPendingDuplicateIdsRef.current.filter((id) => id !== itemId);
        setDuplicateQueue((prev) => prev.filter((x) => String(x.id) !== itemId));
    };

    const attachQueueContactToExistingAccount = async (item: any) => {
        const targetId = String(item?.candidateAccountId || '').trim();
        const contact = item?.scannedContact;
        if (!targetId || !contact) return;
        appendContactToAccount(targetId, contact);
        await removeDuplicateQueueItem(item);
    };

    const openAccountDeleteConfirm = async (accountId: string) => {
        try {
            const impactRes = await fetch(apiUrl(`/api/accounts/${encodeURIComponent(String(accountId))}/delete-impact`));
            const impact = impactRes.ok
                ? await impactRes.json()
                : { requests: [], requestsCount: 0, salesCallsCount: 0 };
            const requestLines = Array.isArray(impact.requests)
                ? impact.requests
                      .slice(0, 10)
                      .map((r: any) => `- ${r.id || 'N/A'} | ${r.requestName || 'Unnamed request'}`)
                      .join('\n')
                : '';
            const more =
                Array.isArray(impact.requests) && impact.requests.length > 10
                    ? `\n...and ${impact.requests.length - 10} more request(s).`
                    : '';
            const msg =
                `Deleting this account will also delete linked data:\n` +
                `Requests: ${impact.requestsCount || 0}\n` +
                `Sales calls: ${impact.salesCallsCount || 0}\n\n` +
                `${requestLines}${more}\n\n` +
                `Do you wish to continue?`;
            setPendingDeleteAccountId(String(accountId));
            setDeleteImpactMessage(msg);
            setConfirmDeleteOpen(true);
        } catch {
            alert('Failed to prepare delete impact.');
        }
    };

    const confirmDeleteAccount = async () => {
        if (!pendingDeleteAccountId) return;
        try {
            const res = await fetch(apiUrl(`/api/accounts/${encodeURIComponent(String(pendingDeleteAccountId))}`), {
                method: 'DELETE',
            });
            if (!res.ok) {
                alert('Failed to delete account.');
                return;
            }
            setAccounts((prev: any[]) => prev.filter((a: any) => a.id !== pendingDeleteAccountId));
            setCrmLeads((prev) => {
                const out = { ...prev } as Record<string, any[]>;
                (Object.keys(out) as string[]).forEach((k) => {
                    out[k] = (out[k] || []).filter((l: any) => l.accountId !== pendingDeleteAccountId);
                });
                return out;
            });
            setProfileLead(null);
        } catch {
            alert('Failed to delete account.');
        } finally {
            setConfirmDeleteOpen(false);
            setPendingDeleteAccountId(null);
            setDeleteImpactMessage('');
        }
    };

    const cellFor = (col: string, a: any) => {
        const c0 = (a.contacts && a.contacts[0]) || {};
        switch (col) {
            case 'name':
                return <span className="font-bold text-sm" style={{ color: colors.textMain }}>{a.name}</span>;
            case 'segment':
                return <span className="text-sm" style={{ color: colors.textMain }}>{a.type || '-'}</span>;
            case 'city':
                return <span className="text-sm" style={{ color: colors.textMain }}>{a.city || '-'}</span>;
            case 'contact':
                return <span className="text-sm" style={{ color: colors.textMain }}>{contactDisplayName(c0) || '-'}</span>;
            case 'phone':
                return <span className="text-sm" style={{ color: colors.textMain }}>{c0.phone || '-'}</span>;
            case 'email':
                return <span className="text-sm break-all" style={{ color: colors.textMain }}>{c0.email || '-'}</span>;
            case 'totalRev': {
                const st = requestStatsByAccountId.get(String(a.id)) || { revSar: 0, reqCount: 0 };
                return (
                    <span className="text-sm font-mono tabular-nums" style={{ color: colors.textMain }}>
                        {formatCompactCurrency(st.revSar, currency)}
                    </span>
                );
            }
            case 'totalReq': {
                const st = requestStatsByAccountId.get(String(a.id)) || { revSar: 0, reqCount: 0 };
                return (
                    <span className="text-sm font-mono tabular-nums" style={{ color: colors.textMain }}>
                        {st.reqCount}
                    </span>
                );
            }
            default:
                return null;
        }
    };

    const cellForContact = (col: string, row: { account: any; contact: any }) => {
        const { account, contact } = row;
        switch (col) {
            case 'contact':
                return (
                    <span className="font-bold text-sm" style={{ color: colors.textMain }}>
                        {contactDisplayName(contact) || '-'}
                    </span>
                );
            case 'segment':
                return <span className="text-sm" style={{ color: colors.textMain }}>{account.type || '-'}</span>;
            case 'city':
                return (
                    <span className="text-sm" style={{ color: colors.textMain }}>
                        {contact.city || account.city || '-'}
                    </span>
                );
            case 'phone':
                return <span className="text-sm" style={{ color: colors.textMain }}>{contact.phone || '-'}</span>;
            case 'email':
                return (
                    <span className="text-sm break-all" style={{ color: colors.textMain }}>
                        {contact.email || '-'}
                    </span>
                );
            case 'accountName':
                return <span className="text-sm" style={{ color: colors.textMain }}>{account.name || '-'}</span>;
            default:
                return null;
        }
    };

    if (profileLead) {
        const aid = profileLead.accountId || profileLead.id;
        const aname = profileLead.company;
        const linkedReq = filterRequestsForAccount(sharedRequests, aid, aname);
        const salesForAcc = filterSalesCallsForAccount(flatCrmLeads, aid, aname);
        const contractsForAccount = accountContracts.filter((c) => String(c.accountId || '') === String(aid));
        const profileAccountRow =
            accounts.find((a: any) => String(a.id) === String(aid)) || { id: aid, name: aname };
        return (
            <>
                <div className="h-full flex flex-col overflow-hidden">
                    <div className="flex-1 min-h-0 overflow-hidden">
                        <CRMProfileView
                            lead={profileLead}
                            theme={theme}
                            onClose={() => setProfileLead(null)}
                            onLeadChange={(next) => {
                                setProfileLead(next);
                                syncAccountFromLead(next);
                            }}
                            linkedRequests={linkedReq}
                            salesCalls={salesForAcc}
                            currentUser={currentUser}
                            onOpenRequest={onOpenRequest}
                            onViewAccountRequests={() => setProfileRequestsListOpen(true)}
                            onOpenBilling={() => setBillingAccount(profileAccountRow)}
                            onEditAccount={
                                profileReadOnly
                                    ? undefined
                                    : () => {
                                          const row = accounts.find((a: any) => a.id === aid) || null;
                                          setEditingAccountRow(row);
                                          setShowEditAccountModal(true);
                                      }
                            }
                            readOnly={profileReadOnly}
                            canDeleteAccount={allowDeleteAccount}
                            canManageManualTimeline={allowManualTimeline}
                            canManageAccountTags={allowTagAdmin}
                            appendAuditLog={appendProfileAudit}
                            accountContracts={contractsForAccount}
                            onUpdateContractStatus={(contractId: string, status: ContractStatus) =>
                                updateContractRecordStatus(contractId, status)
                            }
                            onUpdateContractMeta={(contractId: string, patch: { startDate?: string; endDate?: string }) =>
                                updateContractRecordMeta(contractId, patch)
                            }
                            onUploadSignedContract={async (contractId: string, file: File) => {
                                await attachSignedContractFile(contractId, file);
                            }}
                            onDownloadContractFile={(contractId: string, kind: 'word' | 'pdf' | 'signed') => {
                                const c = accountContracts.find((x) => x.id === contractId);
                                if (!c) return;
                                const f = downloadContractArtifact(c, kind);
                                if (!f) return;
                                triggerBlobDownload(f.blob, f.fileName);
                            }}
                            onStartNewContractForAccount={() => onNavigateToContractsWithAccount?.(String(aid))}
                            canDeleteContractRecords={allowDeleteContracts}
                            onDeleteContractRecord={(contractId: string) => {
                                deleteContractRecord(contractId);
                            }}
                            currency={currency}
                            onDeleteAccount={
                                allowDeleteAccount
                                    ? () => openAccountDeleteConfirm(String(aid))
                                    : undefined
                            }
                            shellAccountPerformanceRange={shellAccountPerformanceRange}
                            onShellAccountPerformanceRangeChange={onShellAccountPerformanceRangeChange}
                            canMergeAccountsAndAssignOwner={allowAccountMergeAndOwner}
                            accountOwnerUserOptions={assignableUsersForAccounts}
                            allAccountsForMergeSearch={accountsSameProperty}
                            onMergeAccountIntoCurrent={
                                allowAccountMergeAndOwner ? handleMergeAccountIntoCurrent : undefined
                            }
                            onAssignAccountOwner={allowAccountMergeAndOwner ? handleAssignAccountOwner : undefined}
                            onScanContactCard={profileReadOnly ? undefined : handleScanContactForCurrentProfile}
                            activeProperty={activeProperty}
                            segmentOptions={segmentOptions}
                        />
                    </div>
                </div>
                <AddAccountModal
                    isOpen={showEditAccountModal}
                    onClose={() => {
                        setShowEditAccountModal(false);
                        setEditingAccountRow(null);
                    }}
                    editingAccount={editingAccountRow}
                    theme={theme}
                    accountTypeOptions={accountTypeOptions}
                    configurationProperty={activeProperty || undefined}
                    configurationPropertyId={activeProperty?.id ? String(activeProperty.id) : undefined}
                    onSave={handleEditAccountSave}
                />
                <ConfirmDialog
                    isOpen={confirmDeleteOpen}
                    title="Confirm Account Deletion"
                    message={deleteImpactMessage}
                    confirmLabel="Delete Account"
                    danger
                    onConfirm={confirmDeleteAccount}
                    onCancel={() => {
                        setConfirmDeleteOpen(false);
                        setPendingDeleteAccountId(null);
                        setDeleteImpactMessage('');
                    }}
                />
                <AccountLinkedRequestsModal
                    open={profileRequestsListOpen}
                    onClose={() => setProfileRequestsListOpen(false)}
                    theme={theme}
                    accountId={String(aid)}
                    accountName={String(aname || 'Account')}
                    sharedRequests={sharedRequests}
                    activeProperty={activeProperty}
                    accounts={accounts}
                    setAccounts={setAccounts}
                    onOpenRequest={(requestId) => {
                        setProfileRequestsListOpen(false);
                        onOpenRequest(requestId);
                    }}
                    onAfterRequestsMutate={onAfterRequestsMutate}
                    currentUser={currentUser}
                    currency={currency}
                    segmentOptions={segmentOptions}
                    accountTypeOptions={accountTypeOptions}
                    canDeleteRequest={canDelRequests}
                    readOnlyOperational={!canMutate}
                    promotionOptions={promotionOptions}
                    canLinkRequestPromotions={canLinkPromos}
                />
                {billingAccount && (
                    <AccountBillingPanel
                        account={billingAccount}
                        linkedRequests={filterRequestsForAccount(
                            sharedRequests,
                            billingAccount.id,
                            billingAccount.name || aname
                        )}
                        propertyId={String(activeProperty?.id || '')}
                        currency={currency}
                        theme={theme}
                        canEdit={canMutateOperational(currentUser)}
                        currentUser={currentUser}
                        onClose={() => setBillingAccount(null)}
                        onSettleClRequests={async (requestIds) => {
                            const idSet = new Set(requestIds.map(String));
                            const updates: any[] = [];
                            for (const req of sharedRequests) {
                                if (!idSet.has(String(req?.id || ''))) continue;
                                const payload = {
                                    ...req,
                                    _update: true,
                                    paymentStatus: 'Paid',
                                    collectLater: false,
                                };
                                const res = await fetch(apiUrl('/api/requests'), {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    credentials: 'include',
                                    body: JSON.stringify(payload),
                                });
                                if (res.ok) updates.push(payload);
                            }
                            if (updates.length) {
                                setSharedRequests((prev) =>
                                    prev.map((r) => {
                                        const hit = updates.find((u) => String(u.id) === String(r.id));
                                        return hit || r;
                                    })
                                );
                                onAfterRequestsMutate?.();
                            }
                        }}
                        onRequestsPatched={(requests) => {
                            const updates = (requests || []).filter(Boolean);
                            if (!updates.length) return;
                            setSharedRequests((prev) =>
                                prev.map((r) => {
                                    const hit = updates.find((u) => String(u.id) === String(r.id));
                                    return hit || r;
                                })
                            );
                            onAfterRequestsMutate?.();
                        }}
                        onNotice={(title, message) => setSystemNotice({ title, message })}
                    />
                )}
                {systemNotice ? (
                    <SystemNoticeModal
                        title={systemNotice.title}
                        message={systemNotice.message}
                        theme={theme}
                        onClose={() => setSystemNotice(null)}
                    />
                ) : null}
            </>
        );
    }

    return (
        <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: colors.bg }}>
            <div className="shrink-0 pt-3 px-4 sm:px-6 pb-4 border-b" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,auto)_1fr_minmax(0,auto)] gap-x-4 gap-y-3 items-start">
                    <div className="shrink-0 pt-0.5">
                        <h1 className="text-2xl font-bold" style={{ color: colors.textMain }}>Accounts</h1>
                        <p className="text-sm" style={{ color: colors.textMuted }}>
                            {listTab === 'accounts'
                                ? sortedFiltered.length === accounts.length
                                    ? `${accounts.length} accounts`
                                    : `${sortedFiltered.length} of ${accounts.length} accounts`
                                : sortedContactRows.length === 0
                                  ? 'No contacts'
                                  : sortedFiltered.length === accounts.length
                                    ? `${sortedContactRows.length} contacts`
                                    : `${sortedContactRows.length} contacts (filtered)`}
                            {listTotalItems > 0 ? (
                                <span className="opacity-70">
                                    {' '}
                                    · Showing {listShowingFrom}–{listShowingTo}
                                </span>
                            ) : null}
                        </p>
                    </div>
                    <div className="flex flex-col items-center gap-2.5 w-full min-w-0 max-w-3xl justify-self-center mx-auto lg:px-2">
                    <h2
                        className="w-full text-center text-sm font-bold uppercase tracking-widest"
                        style={{ color: colors.primary }}
                    >
                        Filter
                    </h2>
                    <div className="relative w-full max-w-md">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" style={{ color: colors.textMuted }} />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={listTab === 'contacts' ? 'Search contacts...' : 'Search accounts...'}
                            className="w-full pl-10 pr-4 py-2 rounded-xl border text-sm outline-none"
                            style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                        />
                    </div>
                    <div className="flex flex-wrap items-end justify-center gap-4 w-full">
                        <div className="flex flex-col gap-1 w-full min-w-[8rem] max-w-[14rem]">
                            <label className="text-[10px] font-bold uppercase tracking-wider opacity-60 text-center" style={{ color: colors.textMuted }}>City</label>
                            <input
                                value={cityFilter}
                                onChange={(e) => setCityFilter(e.target.value)}
                                placeholder="Filter by city…"
                                className="w-full px-3 py-2 rounded-xl border text-sm outline-none"
                                style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                            />
                        </div>
                        <div className="flex flex-col gap-1 w-full min-w-[8rem] max-w-[14rem]">
                            <label className="text-[10px] font-bold uppercase tracking-wider opacity-60 text-center" style={{ color: colors.textMuted }}>Segment</label>
                            <select
                                value={segmentFilter}
                                onChange={(e) => setSegmentFilter(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border text-sm outline-none"
                                style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                            >
                                <option value="">All segments</option>
                                {segmentFilterOptions.map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1 w-full min-w-[10rem] max-w-[16rem]">
                            <label className="text-[10px] font-bold uppercase tracking-wider opacity-60 text-center" style={{ color: colors.textMuted }}>Order</label>
                            <select
                                value={listSort}
                                onChange={(e) => setListSort(e.target.value as AccountsListSort)}
                                className="w-full px-3 py-2 rounded-xl border text-sm outline-none"
                                style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                            >
                                <option value="name_az">{listTab === 'contacts' ? 'A–Z (contact)' : 'A–Z (name)'}</option>
                                {listTab === 'accounts' && (
                                    <>
                                        <option value="rev_high">Highest Rev</option>
                                        <option value="rev_low">Lowest Rev</option>
                                    </>
                                )}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1 w-full min-w-[8rem] max-w-[10rem]">
                            <label className="text-[10px] font-bold uppercase tracking-wider opacity-60 text-center" style={{ color: colors.textMuted }}>Per page</label>
                            <select
                                value={listPageSize}
                                onChange={(e) => setListPageSize(Number(e.target.value) as AccountsListPageSize)}
                                className="w-full px-3 py-2 rounded-xl border text-sm outline-none font-bold"
                                style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                            >
                                <option value={30}>30</option>
                                <option value={60}>60</option>
                                <option value={100}>100</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-6">
                        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: colors.textMain }}>
                            <input
                                type="checkbox"
                                checked={filterWithContract}
                                onChange={(e) => setFilterWithContract(e.target.checked)}
                                className="rounded border"
                                style={{ borderColor: colors.border }}
                            />
                            With contract
                        </label>
                        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: colors.textMain }}>
                            <input
                                type="checkbox"
                                checked={filterWithoutContract}
                                onChange={(e) => setFilterWithoutContract(e.target.checked)}
                                className="rounded border"
                                style={{ borderColor: colors.border }}
                            />
                            Without contract
                        </label>
                    </div>
                    </div>
                    <div className="shrink-0 flex justify-center lg:justify-end pt-0.5 w-full lg:w-[12.5rem]">
                    {!profileReadOnly && (
                        <div className="flex flex-col items-stretch gap-2 w-full max-w-[12.5rem]">
                            <button
                                type="button"
                                onClick={() => setShowAddModal(true)}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm whitespace-nowrap w-full justify-center"
                                style={{ backgroundColor: colors.primary, color: '#000' }}
                            >
                                <Plus size={18} /> New Account
                            </button>
                            <button
                                type="button"
                                onClick={openAccountScanPicker}
                                disabled={scanBusy}
                                className="flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold uppercase tracking-wider disabled:opacity-60 w-full justify-center"
                                style={{ borderColor: colors.border, color: colors.textMain }}
                            >
                                <Camera size={14} /> {scanBusy ? 'Scanning...' : 'Scan/Upload'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowDuplicateQueue(true)}
                                className="flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold uppercase tracking-wider w-full justify-center"
                                style={{ borderColor: colors.border, color: colors.textMain }}
                                title="Review possible duplicate accounts for manual merge"
                            >
                                <GitMerge size={14} />
                                <span>Duplicate</span>
                                <span className="text-red-500 font-black">({allDuplicateItems.length})</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowIncompleteQueue(true)}
                                className="flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold uppercase tracking-wider w-full justify-center"
                                style={{ borderColor: colors.border, color: colors.textMain }}
                                title="Review accounts with missing or placeholder profile details"
                            >
                                <AlertCircle size={14} />
                                <span>Incomplete</span>
                                <span className="text-red-500 font-black">({incompleteAccounts.length})</span>
                            </button>
                            <input
                                ref={scanAccountInputRef}
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="hidden"
                                onChange={handleAccountScanInput}
                            />
                        </div>
                    )}
                    </div>
                </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="shrink-0 flex items-center gap-1 px-6 pt-6 pb-2">
                    {(['accounts', 'contacts'] as AccountsPageTab[]).map((tab) => {
                        const active = listTab === tab;
                        return (
                            <button
                                key={tab}
                                type="button"
                                onClick={() => {
                                    setListTab(tab);
                                    if (tab === 'contacts' && listSort !== 'name_az') setListSort('name_az');
                                }}
                                className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
                                style={{
                                    backgroundColor: active ? colors.primary : 'transparent',
                                    color: active ? '#000' : colors.textMain,
                                    border: `1px solid ${active ? colors.primary : colors.border}`,
                                }}
                            >
                                {tab === 'accounts' ? 'Accounts' : 'Contacts'}
                            </button>
                        );
                    })}
                </div>
                <div className="flex-1 overflow-auto px-6 pb-4 min-h-0">
                {listTab === 'accounts' ? (
                !sortedFiltered.length ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center" style={{ color: colors.textMuted }}>
                        <Building2 size={48} className="opacity-20 mb-4" />
                        <p className="font-bold">{accounts.length ? 'No matching accounts' : 'No accounts yet'}</p>
                        <p className="text-sm mt-1">Create an account or adjust your search and filters.</p>
                    </div>
                ) : (
                    <table className="w-full text-left border-separate border-spacing-y-3">
                        <thead>
                            <tr>
                                {columnOrder.map((column) => (
                                    <th
                                        key={column}
                                        draggable={!profileReadOnly}
                                        onDragStart={() => !profileReadOnly && handleColumnDragStart(column)}
                                        onDragOver={(e) => e.preventDefault()}
                                        onDrop={() => !profileReadOnly && handleColumnDrop(column)}
                                        className={`px-6 py-2 text-[11px] font-bold uppercase tracking-wider opacity-60 ${profileReadOnly ? '' : 'cursor-move'}`}
                                        style={{ color: colors.textMain }}
                                    >
                                        {columnLabels[column]}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {pagedAccounts.map((a: any) => (
                                <tr
                                    key={a.id}
                                    onClick={() => setProfileLead(accountToLead(a))}
                                    className="cursor-pointer group transition-all duration-300 hover:translate-y-[-2px]"
                                >
                                    {columnOrder.map((column, colIdx) => {
                                        const isFirst = colIdx === 0;
                                        const isLast = colIdx === columnOrder.length - 1;
                                        return (
                                            <td
                                                key={column}
                                                className={`py-4 px-6 border-y ${isFirst ? 'border-l rounded-l-2xl' : ''} ${isLast ? 'border-r rounded-r-2xl' : ''}`}
                                                style={{
                                                    backgroundColor: colors.card,
                                                    borderColor: colors.border,
                                                    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                                                    borderLeft: isFirst ? `4px solid ${colors.primary}` : `1px solid ${colors.border}`
                                                }}
                                            >
                                                {cellFor(column, a)}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )
                ) : !sortedContactRows.length ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center" style={{ color: colors.textMuted }}>
                        <Building2 size={48} className="opacity-20 mb-4" />
                        <p className="font-bold">{accounts.length ? 'No matching contacts' : 'No contacts yet'}</p>
                        <p className="text-sm mt-1">Add contacts to accounts or adjust your search and filters.</p>
                    </div>
                ) : (
                    <table className="w-full text-left border-separate border-spacing-y-3">
                        <thead>
                            <tr>
                                {DEFAULT_CONTACT_COLUMN_ORDER.map((column) => (
                                    <th
                                        key={column}
                                        className="px-6 py-2 text-[11px] font-bold uppercase tracking-wider opacity-60"
                                        style={{ color: colors.textMain }}
                                    >
                                        {contactColumnLabels[column]}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {pagedContacts.map((row) => (
                                <tr
                                    key={row.key}
                                    onClick={() => setProfileLead(accountToLead(row.account))}
                                    className="cursor-pointer group transition-all duration-300 hover:translate-y-[-2px]"
                                >
                                    {DEFAULT_CONTACT_COLUMN_ORDER.map((column, colIdx) => {
                                        const isFirst = colIdx === 0;
                                        const isLast = colIdx === DEFAULT_CONTACT_COLUMN_ORDER.length - 1;
                                        return (
                                            <td
                                                key={column}
                                                className={`py-4 px-6 border-y ${isFirst ? 'border-l rounded-l-2xl' : ''} ${isLast ? 'border-r rounded-r-2xl' : ''}`}
                                                style={{
                                                    backgroundColor: colors.card,
                                                    borderColor: colors.border,
                                                    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                                                    borderLeft: isFirst ? `4px solid ${colors.primary}` : `1px solid ${colors.border}`
                                                }}
                                            >
                                                {cellForContact(column, row)}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                </div>
                {listTotalItems > 0 ? (
                    <div
                        className="shrink-0 flex flex-col sm:flex-row items-center justify-center gap-3 px-6 py-3 border-t"
                        style={{ borderColor: colors.border, backgroundColor: colors.card }}
                    >
                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>
                            Page {listCurrentPage} of {listTotalPages}
                            <span className="opacity-70 font-medium normal-case tracking-normal">
                                {' '}
                                · {listShowingFrom}–{listShowingTo} of {listTotalItems}
                            </span>
                        </span>
                        <div className="flex items-center gap-1 flex-wrap justify-center max-w-full overflow-x-auto pb-1">
                            <button
                                type="button"
                                disabled={listCurrentPage <= 1}
                                onClick={() => setListCurrentPage(listCurrentPage - 1)}
                                className="p-2 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                                style={{ color: colors.textMain }}
                                aria-label="Previous page"
                            >
                                <ChevronRight size={16} className="rotate-180" />
                            </button>
                            {listPageNumbers.map((pageNum) => (
                                <button
                                    type="button"
                                    key={pageNum}
                                    onClick={() => setListCurrentPage(pageNum)}
                                    className={`min-w-[2.25rem] h-9 px-2 rounded-lg flex items-center justify-center text-xs font-bold transition-all ${pageNum === listCurrentPage ? 'shadow-lg' : 'hover:bg-white/5'}`}
                                    style={{
                                        backgroundColor: pageNum === listCurrentPage ? colors.primary : 'transparent',
                                        color: pageNum === listCurrentPage ? '#000' : colors.textMain,
                                        boxShadow: pageNum === listCurrentPage ? `0 4px 12px ${colors.primary}40` : 'none',
                                    }}
                                >
                                    {pageNum}
                                </button>
                            ))}
                            <button
                                type="button"
                                disabled={listCurrentPage >= listTotalPages}
                                onClick={() => setListCurrentPage(listCurrentPage + 1)}
                                className="p-2 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                                style={{ color: colors.textMain }}
                                aria-label="Next page"
                            >
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                ) : null}
            </div>

            <AddAccountModal
                isOpen={showAddModal}
                onClose={handleCloseAddModal}
                onSave={handleSaveNew}
                theme={theme}
                accountTypeOptions={accountTypeOptions}
                duplicateCheckAccounts={accountsSameProperty}
                duplicateCheckPropertyId={activeProperty?.id ? String(activeProperty.id) : undefined}
                configurationProperty={activeProperty || undefined}
                configurationPropertyId={activeProperty?.id ? String(activeProperty.id) : undefined}
                prefillAccount={scanPrefillAccount}
                scanMeta={scanMeta}
            />
            <AddAccountModal
                isOpen={showEditAccountModal}
                onClose={() => {
                    setShowEditAccountModal(false);
                    setEditingAccountRow(null);
                }}
                editingAccount={editingAccountRow}
                onSave={handleEditAccountSave}
                theme={theme}
                accountTypeOptions={accountTypeOptions}
                configurationProperty={activeProperty || undefined}
                configurationPropertyId={activeProperty?.id ? String(activeProperty.id) : undefined}
            />
            {showDuplicateQueue && (
                <div className="fixed inset-0 z-[180] bg-black/70 p-4 flex items-center justify-center">
                    <div className="w-full max-w-3xl rounded-2xl border max-h-[80vh] overflow-hidden" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: colors.border }}>
                            <div>
                                <h3 className="text-lg font-bold" style={{ color: colors.textMain }}>Possible Duplicates Queue</h3>
                                <p className="text-xs" style={{ color: colors.textMuted }}>
                                    Manually review and merge/attach scanned contacts to avoid duplicate accounts.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowDuplicateQueue(false)}
                                className="px-3 py-2 rounded border text-sm"
                                style={{ borderColor: colors.border, color: colors.textMain }}
                            >
                                Close
                            </button>
                        </div>
                        <div className="p-4 overflow-auto space-y-3 max-h-[65vh]">
                            {allDuplicateItems.length === 0 ? (
                                <p className="text-sm" style={{ color: colors.textMuted }}>No duplicate candidates in the queue.</p>
                            ) : allDuplicateItems.map((item: any) => (
                                <div key={item.id} className="rounded-xl border p-3 space-y-2" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                                    <p className="text-xs font-semibold" style={{ color: colors.textMain }}>
                                        {item.source === 'system-detection'
                                            ? `Detected duplicate: ${item.baseAccountName || 'Unknown'} ↔ ${item.candidateAccountName || 'Unknown'}`
                                            : `Scanned card matches existing account: ${item.candidateAccountName || item.scannedAccountName || 'Unknown'}`}
                                    </p>
                                    <p className="text-xs" style={{ color: colors.textMuted }}>
                                        {item.source === 'system-detection'
                                            ? `Reason: ${String(item.reason || 'possible duplicate')}`
                                            : `No second account was created — review the scanned contact below and attach it to the existing profile, or dismiss if already saved.`}
                                    </p>
                                    {item.source !== 'system-detection' && (
                                        <p className="text-xs" style={{ color: colors.textMuted }}>
                                            Scanned contact: {contactDisplayName(item.scannedContact || {}) || 'N/A'} · {String(item.scannedContact?.email || '—')} · {String(item.scannedContact?.phone || '—')}
                                        </p>
                                    )}
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            className="px-3 py-1.5 rounded border text-xs font-bold"
                                            style={{ borderColor: colors.border, color: colors.textMain }}
                                            onClick={() => {
                                                const row = accounts.find((a: any) => String(a.id) === String(item.candidateAccountId));
                                                if (row) {
                                                    setProfileLead(accountToLead(row));
                                                    setShowDuplicateQueue(false);
                                                }
                                            }}
                                        >
                                            Open candidate profile
                                        </button>
                                        {item.source !== 'system-detection' && (
                                            <>
                                                <button
                                                    type="button"
                                                    className="px-3 py-1.5 rounded text-xs font-bold"
                                                    style={{ backgroundColor: colors.primary, color: '#000' }}
                                                    onClick={() => attachQueueContactToExistingAccount(item)}
                                                >
                                                    Attach contact to existing account
                                                </button>
                                                <button
                                                    type="button"
                                                    className="px-3 py-1.5 rounded border text-xs font-bold"
                                                    style={{ borderColor: colors.border, color: colors.textMuted }}
                                                    onClick={() => removeDuplicateQueueItem(item)}
                                                >
                                                    Dismiss
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
            {showIncompleteQueue && (
                <div className="fixed inset-0 z-[180] bg-black/70 p-4 flex items-center justify-center">
                    <div className="w-full max-w-3xl rounded-2xl border max-h-[80vh] overflow-hidden" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: colors.border }}>
                            <div>
                                <h3 className="text-lg font-bold" style={{ color: colors.textMain }}>Incomplete Account Profiles</h3>
                                <p className="text-xs" style={{ color: colors.textMuted }}>
                                    Accounts missing city, phone, email, contact details, or other required fields. Placeholder values like dots or dashes count as missing.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowIncompleteQueue(false)}
                                className="px-3 py-2 rounded border text-sm"
                                style={{ borderColor: colors.border, color: colors.textMain }}
                            >
                                Close
                            </button>
                        </div>
                        <div className="p-4 overflow-auto space-y-3 max-h-[65vh]">
                            {incompleteAccounts.length === 0 ? (
                                <p className="text-sm" style={{ color: colors.textMuted }}>All accounts have complete profiles.</p>
                            ) : incompleteAccounts.map((account: any) => {
                                const gaps = getAccountProfileGaps(account, propertyIdForForms, activeProperty, accountFormSchema);
                                return (
                                    <div
                                        key={account.id}
                                        className="rounded-xl border p-3 space-y-2 cursor-pointer hover:opacity-90 transition-opacity"
                                        style={{ borderColor: colors.border, backgroundColor: colors.bg }}
                                        onClick={() => {
                                            openAccountForEdit(account);
                                            setShowIncompleteQueue(false);
                                        }}
                                    >
                                        <p className="text-sm font-semibold" style={{ color: colors.textMain }}>
                                            {account.name || 'Unnamed account'}
                                        </p>
                                        <p className="text-xs" style={{ color: colors.textMuted }}>
                                            Missing: {gaps.join(', ')}
                                        </p>
                                        <button
                                            type="button"
                                            className="px-3 py-1.5 rounded text-xs font-bold"
                                            style={{ backgroundColor: colors.primary, color: '#000' }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                openAccountForEdit(account);
                                                setShowIncompleteQueue(false);
                                            }}
                                        >
                                            Edit account
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
