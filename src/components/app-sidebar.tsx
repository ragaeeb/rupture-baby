'use client';

import { Link, useLocation, useNavigate, useRouter, useSearch } from '@tanstack/react-router';
import {
    BarChart3,
    CheckSquare,
    ChevronRight,
    File,
    Folder,
    LayoutDashboard,
    Settings2,
    Trash2,
    X,
} from 'lucide-react';
import type * as React from 'react';
import { useMemo, useState } from 'react';
import { DeleteConfirmDialog } from '@/components/delete-button';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarRail,
} from '@/components/ui/sidebar';
import { mergeBrowseFilters, pickBrowseFilters, sanitizeSearch } from '@/lib/browse-search';
import { THINKING_TIME_BUCKETS } from '@/lib/reasoning-time';
import { deleteTranslationFiles } from '@/lib/server-functions';
import type { TranslationStats, TranslationTreeNode } from '@/lib/shell-types';
import { filterTranslationTreeEntries } from '@/lib/translation-tree-filter';

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
    entries: TranslationTreeNode[];
    rootName: string;
    translationStats?: TranslationStats | null;
    selectedFilePath?: string | null;
};

const buildSearchHref = (pathname: string, search: Record<string, unknown>) => {
    const searchParams = new URLSearchParams();

    for (const [key, value] of Object.entries(search)) {
        if (typeof value === 'string' && value.length > 0) {
            searchParams.set(key, value);
        }
    }

    const searchString = searchParams.toString();
    return searchString ? `${pathname}?${searchString}` : pathname;
};

const getVisibleFilePaths = (nodes: TranslationTreeNode[]): string[] =>
    nodes.flatMap((node) => (node.kind === 'file' ? [node.relativePath] : getVisibleFilePaths(node.children ?? [])));

const NavigationSection = ({
    dashboardPath,
    filterSearch,
    isDashboardPath,
    pathname,
}: {
    dashboardPath: '/' | '/dashboard';
    filterSearch: Record<string, unknown>;
    isDashboardPath: boolean;
    pathname: string;
}) => (
    <SidebarGroup>
        <SidebarGroupLabel>Navigation</SidebarGroupLabel>
        <SidebarGroupContent>
            <SidebarMenu>
                <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isDashboardPath} tooltip="Dashboard">
                        <Link resetScroll={false} search={filterSearch} to={dashboardPath}>
                            <LayoutDashboard />
                            <span className="min-w-0 truncate">Dashboard</span>
                        </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === '/analytics'} tooltip="Analytics">
                        <Link resetScroll={false} search={filterSearch} to="/analytics">
                            <BarChart3 />
                            <span className="min-w-0 truncate">Analytics</span>
                        </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === '/prompts'} tooltip="Prompts">
                        <Link resetScroll={false} search={filterSearch} to="/prompts">
                            <File />
                            <span className="min-w-0 truncate">Prompts</span>
                        </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === '/settings'} tooltip="Settings">
                        <Link resetScroll={false} search={filterSearch} to="/settings">
                            <Settings2 />
                            <span className="min-w-0 truncate">Settings</span>
                        </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            </SidebarMenu>
        </SidebarGroupContent>
    </SidebarGroup>
);

const FiltersSection = ({
    hasActiveFilters,
    modelFilter,
    models,
    setFilter,
    statusFilter,
    thinkingTimeFilter,
}: {
    hasActiveFilters: boolean;
    modelFilter: string;
    models: string[];
    setFilter: (newFilter: {
        model?: string | 'all';
        status?: 'all' | 'valid' | 'invalid';
        thinkingTime?: 'all' | '10_to_30s' | '1m_plus' | '30_to_60s' | 'lt_10s';
    }) => void;
    statusFilter: 'all' | 'invalid' | 'valid';
    thinkingTimeFilter: 'all' | '10_to_30s' | '1m_plus' | '30_to_60s' | 'lt_10s';
}) => (
    <SidebarGroup>
        <div className="flex items-center justify-between px-2">
            <SidebarGroupLabel>Filters</SidebarGroupLabel>
            {hasActiveFilters ? (
                <Button
                    aria-label="Clear filters"
                    className="size-7"
                    onClick={() => setFilter({ model: 'all', status: 'all', thinkingTime: 'all' })}
                    size="icon"
                    variant="ghost"
                >
                    <X />
                </Button>
            ) : null}
        </div>
        <SidebarGroupContent>
            <div className="space-y-4 px-2">
                <div className="space-y-2">
                    <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">Model</p>
                    <select
                        aria-label="Filter by model"
                        className="h-9 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        value={modelFilter}
                        onChange={(event) => setFilter({ model: event.target.value as string | 'all' })}
                    >
                        <option value="all">All</option>
                        {models.map((model) => (
                            <option key={model} value={model}>
                                {model}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="space-y-2">
                    <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">Status</p>
                    <select
                        aria-label="Filter by status"
                        className="h-9 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        value={statusFilter}
                        onChange={(event) => setFilter({ status: event.target.value as 'all' | 'valid' | 'invalid' })}
                    >
                        <option value="all">All</option>
                        <option value="valid">Valid</option>
                        <option value="invalid">Invalid</option>
                    </select>
                </div>

                <div className="space-y-2">
                    <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                        Thinking Time
                    </p>
                    <select
                        aria-label="Filter by thinking time"
                        className="h-9 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        value={thinkingTimeFilter}
                        onChange={(event) =>
                            setFilter({
                                thinkingTime: event.target.value as
                                    | 'all'
                                    | '10_to_30s'
                                    | '1m_plus'
                                    | '30_to_60s'
                                    | 'lt_10s',
                            })
                        }
                    >
                        <option value="all">All</option>
                        {THINKING_TIME_BUCKETS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
        </SidebarGroupContent>
    </SidebarGroup>
);

const FilesSection = ({
    filteredEntries,
    handleCancelSelectionMode,
    handleToggleSelectAllVisible,
    isAllVisibleSelected,
    isSelectionMode,
    isSomeVisibleSelected,
    linkSearch,
    onToggleFileSelection,
    rootName,
    selectedFilePath,
    selectedFilePaths,
    selectedVisibleFilePaths,
    setIsDeleteDialogOpen,
    setIsSelectionMode,
}: {
    filteredEntries: TranslationTreeNode[];
    handleCancelSelectionMode: () => void;
    handleToggleSelectAllVisible: (checked: boolean) => void;
    isAllVisibleSelected: boolean;
    isSelectionMode: boolean;
    isSomeVisibleSelected: boolean;
    linkSearch: Record<string, unknown>;
    onToggleFileSelection: (relativePath: string, checked: boolean) => void;
    rootName: string;
    selectedFilePath?: string | null;
    selectedFilePaths: string[];
    selectedVisibleFilePaths: string[];
    setIsDeleteDialogOpen: (open: boolean) => void;
    setIsSelectionMode: (open: boolean) => void;
}) => (
    <SidebarGroup>
        <div className="flex items-center justify-between px-2">
            <SidebarGroupLabel>Files</SidebarGroupLabel>
            <div className="flex items-center gap-1">
                {isSelectionMode ? (
                    <>
                        <Button
                            aria-label={
                                isAllVisibleSelected ? 'Deselect all visible files' : 'Select all visible files'
                            }
                            className="size-7"
                            onClick={() => handleToggleSelectAllVisible(!isAllVisibleSelected)}
                            size="icon"
                            variant="ghost"
                        >
                            <input
                                aria-checked={isSomeVisibleSelected ? 'mixed' : isAllVisibleSelected}
                                checked={isAllVisibleSelected}
                                className="pointer-events-none size-3.5 accent-primary"
                                readOnly
                                ref={(node) => {
                                    if (node) {
                                        node.indeterminate = isSomeVisibleSelected;
                                    }
                                }}
                                type="checkbox"
                            />
                        </Button>
                        <Button
                            aria-label="Delete selected files"
                            className="size-7"
                            disabled={selectedVisibleFilePaths.length === 0}
                            onClick={() => setIsDeleteDialogOpen(true)}
                            size="icon"
                            variant="ghost"
                        >
                            <Trash2 className="text-destructive" />
                        </Button>
                        <Button
                            aria-label="Cancel file selection"
                            className="size-7"
                            onClick={handleCancelSelectionMode}
                            size="icon"
                            variant="ghost"
                        >
                            <X />
                        </Button>
                    </>
                ) : (
                    <Button
                        aria-label="Select files to delete"
                        className="size-7"
                        onClick={() => setIsSelectionMode(true)}
                        size="icon"
                        variant="ghost"
                    >
                        <CheckSquare />
                    </Button>
                )}
            </div>
        </div>
        <SidebarGroupContent>
            {isSelectionMode ? (
                <div className="px-2 pb-2 text-muted-foreground text-xs">
                    {selectedVisibleFilePaths.length} selected
                </div>
            ) : null}
            <SidebarMenu>
                <SidebarMenuItem>
                    <Collapsible
                        className="group/collapsible [&[data-state=open]>button>svg:first-child]:rotate-90"
                        defaultOpen
                    >
                        <CollapsibleTrigger asChild>
                            <SidebarMenuButton>
                                <ChevronRight className="transition-transform" />
                                <Folder />
                                <span className="min-w-0 truncate text-xs" title={rootName}>
                                    {rootName}
                                </span>
                            </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <SidebarMenuSub>
                                {filteredEntries.map((item) => (
                                    <Tree
                                        item={item}
                                        key={item.relativePath || item.name}
                                        linkSearch={linkSearch}
                                        isSelectionMode={isSelectionMode}
                                        onToggleFileSelection={onToggleFileSelection}
                                        selectedFilePath={selectedFilePath}
                                        selectedFilePaths={selectedFilePaths}
                                    />
                                ))}
                            </SidebarMenuSub>
                        </CollapsibleContent>
                    </Collapsible>
                </SidebarMenuItem>
            </SidebarMenu>
        </SidebarGroupContent>
    </SidebarGroup>
);

export const AppSidebar = ({ entries, rootName, selectedFilePath, translationStats, ...props }: AppSidebarProps) => {
    const pathname = useLocation({ select: (location) => location.pathname });
    const navigate = useNavigate();
    const router = useRouter();
    const search = useSearch({ strict: false });
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedFilePaths, setSelectedFilePaths] = useState<string[]>([]);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isDeletingFiles, setIsDeletingFiles] = useState(false);
    const dashboardPath: '/' | '/dashboard' = pathname === '/dashboard' ? '/dashboard' : '/';
    const isDashboardPath = pathname === '/' || pathname === '/dashboard';
    const filterSearch = pickBrowseFilters(search);
    const translationLinkSearch = sanitizeSearch({
        ...filterSearch,
        view: pathname.startsWith('/translations') && typeof search.view === 'string' ? search.view : undefined,
    });
    const modelFilter = typeof search.model === 'string' ? search.model : 'all';
    const statusFilter = search.status === 'valid' || search.status === 'invalid' ? search.status : 'all';
    const thinkingTimeFilter =
        search.thinkingTime === 'lt_10s' ||
        search.thinkingTime === '10_to_30s' ||
        search.thinkingTime === '30_to_60s' ||
        search.thinkingTime === '1m_plus'
            ? search.thinkingTime
            : 'all';
    const hasActiveFilters = modelFilter !== 'all' || statusFilter !== 'all' || thinkingTimeFilter !== 'all';
    const models = translationStats ? Object.keys(translationStats.modelBreakdown) : [];
    const filteredEntries = filterTranslationTreeEntries(entries, translationStats, {
        model: modelFilter,
        status: statusFilter,
        thinkingTime: thinkingTimeFilter,
    });
    const visibleFilePaths = useMemo(() => getVisibleFilePaths(filteredEntries), [filteredEntries]);
    const selectedVisibleFilePaths = selectedFilePaths.filter((filePath) => visibleFilePaths.includes(filePath));
    const isAllVisibleSelected =
        visibleFilePaths.length > 0 && selectedVisibleFilePaths.length === visibleFilePaths.length;
    const isSomeVisibleSelected =
        selectedVisibleFilePaths.length > 0 && selectedVisibleFilePaths.length < visibleFilePaths.length;

    const setFilter = (newFilter: {
        model?: string | 'all';
        status?: 'all' | 'valid' | 'invalid';
        thinkingTime?: 'all' | '10_to_30s' | '1m_plus' | '30_to_60s' | 'lt_10s';
    }) => {
        const currentPath = pathname.startsWith('/translations') ? pathname : dashboardPath;
        const nextSearch = mergeBrowseFilters(search, newFilter);

        void navigate({ href: buildSearchHref(currentPath, nextSearch), resetScroll: false });
    };

    const toggleFileSelection = (relativePath: string, checked: boolean) => {
        setSelectedFilePaths((currentPaths) => {
            if (checked) {
                return currentPaths.includes(relativePath) ? currentPaths : [...currentPaths, relativePath];
            }

            return currentPaths.filter((path) => path !== relativePath);
        });
    };

    const handleToggleSelectAllVisible = (checked: boolean) => {
        setSelectedFilePaths((currentPaths) => {
            const otherSelections = currentPaths.filter((path) => !visibleFilePaths.includes(path));
            return checked ? [...otherSelections, ...visibleFilePaths] : otherSelections;
        });
    };

    const handleCancelSelectionMode = () => {
        setIsSelectionMode(false);
        setSelectedFilePaths([]);
        setIsDeleteDialogOpen(false);
    };

    const handleDeleteSelectedFiles = async () => {
        if (selectedVisibleFilePaths.length === 0 || isDeletingFiles) {
            return;
        }

        setIsDeletingFiles(true);
        try {
            await deleteTranslationFiles({ data: { relativePaths: selectedVisibleFilePaths } });
            await router.invalidate({ sync: true });

            if (selectedFilePath && selectedVisibleFilePaths.includes(selectedFilePath)) {
                await navigate({ search: pickBrowseFilters(search), to: '/' });
            }

            handleCancelSelectionMode();
        } catch (error) {
            console.error('Failed to delete translation files:', error);
            alert(error instanceof Error ? error.message : 'Failed to delete translation files');
        } finally {
            setIsDeletingFiles(false);
        }
    };

    return (
        <>
            <Sidebar {...props}>
                <SidebarContent>
                    <NavigationSection
                        dashboardPath={dashboardPath}
                        filterSearch={filterSearch}
                        isDashboardPath={isDashboardPath}
                        pathname={pathname}
                    />

                    {translationStats ? (
                        <FiltersSection
                            hasActiveFilters={hasActiveFilters}
                            modelFilter={modelFilter}
                            models={models}
                            setFilter={setFilter}
                            statusFilter={statusFilter}
                            thinkingTimeFilter={thinkingTimeFilter}
                        />
                    ) : null}

                    <FilesSection
                        filteredEntries={filteredEntries}
                        handleCancelSelectionMode={handleCancelSelectionMode}
                        handleToggleSelectAllVisible={handleToggleSelectAllVisible}
                        isAllVisibleSelected={isAllVisibleSelected}
                        isSelectionMode={isSelectionMode}
                        isSomeVisibleSelected={isSomeVisibleSelected}
                        linkSearch={translationLinkSearch}
                        onToggleFileSelection={toggleFileSelection}
                        rootName={rootName}
                        selectedFilePath={selectedFilePath}
                        selectedFilePaths={selectedFilePaths}
                        selectedVisibleFilePaths={selectedVisibleFilePaths}
                        setIsDeleteDialogOpen={setIsDeleteDialogOpen}
                        setIsSelectionMode={setIsSelectionMode}
                    />
                </SidebarContent>
                <SidebarRail />
            </Sidebar>
            <DeleteConfirmDialog
                confirmLabel="Delete"
                fileNames={selectedVisibleFilePaths}
                isDeleting={isDeletingFiles}
                onConfirm={handleDeleteSelectedFiles}
                onOpenChange={setIsDeleteDialogOpen}
                open={isDeleteDialogOpen}
                title="Delete Files"
            />
        </>
    );
};

type TreeProps = {
    item: TranslationTreeNode;
    linkSearch: Record<string, unknown>;
    isSelectionMode: boolean;
    onToggleFileSelection: (relativePath: string, checked: boolean) => void;
    selectedFilePath?: string | null;
    selectedFilePaths: string[];
};

const Tree = ({
    item,
    linkSearch,
    isSelectionMode,
    onToggleFileSelection,
    selectedFilePath,
    selectedFilePaths,
}: TreeProps) => {
    if (item.kind === 'file') {
        const isChecked = selectedFilePaths.includes(item.relativePath);

        return (
            <SidebarMenuItem>
                {isSelectionMode ? (
                    <SidebarMenuButton
                        className="data-[active=true]:bg-sidebar-accent"
                        isActive={selectedFilePath === item.relativePath}
                        onClick={() => onToggleFileSelection(item.relativePath, !isChecked)}
                    >
                        <input
                            checked={isChecked}
                            className="size-3.5 accent-primary"
                            onChange={(event) => onToggleFileSelection(item.relativePath, event.target.checked)}
                            onClick={(event) => event.stopPropagation()}
                            type="checkbox"
                        />
                        <File />
                        <span className="min-w-0 truncate text-xs" title={item.name}>
                            {item.name}
                        </span>
                    </SidebarMenuButton>
                ) : (
                    <SidebarMenuButton
                        asChild
                        className="data-[active=true]:bg-sidebar-accent"
                        isActive={selectedFilePath === item.relativePath}
                    >
                        <Link
                            params={{ fileNameId: encodeURIComponent(item.relativePath) }}
                            resetScroll={false}
                            search={linkSearch}
                            to="/translations/$fileNameId"
                        >
                            <File />
                            <span className="min-w-0 truncate text-xs" title={item.name}>
                                {item.name}
                            </span>
                        </Link>
                    </SidebarMenuButton>
                )}
            </SidebarMenuItem>
        );
    }

    return (
        <SidebarMenuItem>
            <Collapsible
                className="group/collapsible [&[data-state=open]>button>svg:first-child]:rotate-90"
                defaultOpen
            >
                <CollapsibleTrigger asChild>
                    <SidebarMenuButton>
                        <ChevronRight className="transition-transform" />
                        <Folder />
                        <span className="min-w-0 truncate text-xs" title={item.name}>
                            {item.name}
                        </span>
                    </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <SidebarMenuSub>
                        {item.children?.map((subItem) => (
                            <Tree
                                item={subItem}
                                key={subItem.relativePath || subItem.name}
                                linkSearch={linkSearch}
                                isSelectionMode={isSelectionMode}
                                onToggleFileSelection={onToggleFileSelection}
                                selectedFilePath={selectedFilePath}
                                selectedFilePaths={selectedFilePaths}
                            />
                        ))}
                    </SidebarMenuSub>
                </CollapsibleContent>
            </Collapsible>
        </SidebarMenuItem>
    );
};
