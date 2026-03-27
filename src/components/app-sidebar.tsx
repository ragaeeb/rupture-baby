'use client';

import { Link, useLocation, useNavigate, useSearch } from '@tanstack/react-router';
import { ChevronRight, File, Folder, LayoutDashboard, X } from 'lucide-react';
import type * as React from 'react';
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
import { mergeBrowseFilters, pickBrowseFilters } from '@/lib/browse-search';
import type { DashboardStatsResponse, TranslationTreeNode } from '@/lib/shell-types';
import { filterTranslationTreeEntries } from '@/lib/translation-tree-filter';

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
    entries: TranslationTreeNode[];
    rootName: string;
    translationStats?: DashboardStatsResponse['translationStats'];
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

export const AppSidebar = ({ entries, rootName, selectedFilePath, translationStats, ...props }: AppSidebarProps) => {
    const pathname = useLocation({ select: (location) => location.pathname });
    const navigate = useNavigate();
    const search = useSearch({ strict: false });
    const dashboardPath: '/' | '/dashboard' = pathname === '/dashboard' ? '/dashboard' : '/';
    const isDashboardPath = pathname === '/' || pathname === '/dashboard';
    const filterSearch = pickBrowseFilters(search);
    const modelFilter = typeof search.model === 'string' ? search.model : 'all';
    const statusFilter = search.status === 'valid' || search.status === 'invalid' ? search.status : 'all';
    const hasActiveFilters = modelFilter !== 'all' || statusFilter !== 'all';
    const models = translationStats ? Object.keys(translationStats.modelBreakdown) : [];
    const filteredEntries = filterTranslationTreeEntries(entries, translationStats, {
        model: modelFilter,
        status: statusFilter,
    });

    const setFilter = (newFilter: { model?: string | 'all'; status?: 'all' | 'valid' | 'invalid' }) => {
        const currentPath = pathname.startsWith('/translations') ? pathname : dashboardPath;
        const nextSearch = mergeBrowseFilters(search, newFilter);

        void navigate({ href: buildSearchHref(currentPath, nextSearch), resetScroll: false });
    };

    return (
        <Sidebar {...props}>
            <SidebarContent>
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
                                <SidebarMenuButton asChild isActive={pathname === '/prompts'} tooltip="Prompts">
                                    <Link resetScroll={false} search={filterSearch} to="/prompts">
                                        <File />
                                        <span className="min-w-0 truncate">Prompts</span>
                                    </Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>

                {translationStats ? (
                    <SidebarGroup>
                        <div className="flex items-center justify-between px-2">
                            <SidebarGroupLabel>Filters</SidebarGroupLabel>
                            {hasActiveFilters ? (
                                <Button
                                    aria-label="Clear filters"
                                    className="size-7"
                                    onClick={() => setFilter({ model: 'all', status: 'all' })}
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
                                    <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                                        Model
                                    </p>
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
                                    <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                                        Status
                                    </p>
                                    <select
                                        aria-label="Filter by status"
                                        className="h-9 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                        value={statusFilter}
                                        onChange={(event) =>
                                            setFilter({ status: event.target.value as 'all' | 'valid' | 'invalid' })
                                        }
                                    >
                                        <option value="all">All</option>
                                        <option value="valid">Valid</option>
                                        <option value="invalid">Invalid</option>
                                    </select>
                                </div>
                            </div>
                        </SidebarGroupContent>
                    </SidebarGroup>
                ) : null}

                <SidebarGroup>
                    <SidebarGroupLabel>Files</SidebarGroupLabel>
                    <SidebarGroupContent>
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
                                                    linkSearch={filterSearch}
                                                    selectedFilePath={selectedFilePath}
                                                />
                                            ))}
                                        </SidebarMenuSub>
                                    </CollapsibleContent>
                                </Collapsible>
                            </SidebarMenuItem>
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
            <SidebarRail />
        </Sidebar>
    );
};

type TreeProps = { item: TranslationTreeNode; linkSearch: Record<string, unknown>; selectedFilePath?: string | null };

const Tree = ({ item, linkSearch, selectedFilePath }: TreeProps) => {
    if (item.kind === 'file') {
        return (
            <SidebarMenuItem>
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
                                selectedFilePath={selectedFilePath}
                            />
                        ))}
                    </SidebarMenuSub>
                </CollapsibleContent>
            </Collapsible>
        </SidebarMenuItem>
    );
};
