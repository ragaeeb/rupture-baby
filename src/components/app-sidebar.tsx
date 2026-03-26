'use client';

import { ChevronRight, File, Folder, LayoutDashboard, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
import type { DashboardStatsResponse, TranslationTreeNode } from '@/lib/shell-types';

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
    entries: TranslationTreeNode[];
    rootName: string;
    translationStats?: DashboardStatsResponse['translationStats'];
    selectedFilePath?: string | null;
};

export const AppSidebar = ({ entries, rootName, selectedFilePath, translationStats, ...props }: AppSidebarProps) => {
    const pathname = usePathname();
    const router = useRouter();
    const searchParams = useSearchParams();
    const dashboardPath = pathname === '/dashboard' ? '/dashboard' : '/';
    const isDashboardPath = pathname === '/' || pathname === '/dashboard';
    const filterQuery = (() => {
        const params = new URLSearchParams();
        const model = searchParams.get('model');
        const status = searchParams.get('status');

        if (model) {
            params.set('model', model);
        }
        if (status) {
            params.set('status', status);
        }

        const query = params.toString();
        return query ? `?${query}` : '';
    })();
    const modelFilter = searchParams.get('model') || 'all';
    const statusFilter = searchParams.get('status') || 'all';
    const hasActiveFilters = modelFilter !== 'all' || statusFilter !== 'all';
    const models = translationStats ? Object.keys(translationStats.modelBreakdown) : [];

    const setFilter = (newFilter: { model?: string | 'all'; status?: 'all' | 'valid' | 'invalid' }) => {
        const params = new URLSearchParams(searchParams.toString());

        if (newFilter.model !== undefined) {
            if (newFilter.model === 'all') {
                params.delete('model');
            } else {
                params.set('model', newFilter.model);
            }
        }

        if (newFilter.status !== undefined) {
            if (newFilter.status === 'all') {
                params.delete('status');
            } else {
                params.set('status', newFilter.status);
            }
        }

        const query = params.toString();
        const currentPath = pathname.startsWith('/translations') ? pathname : dashboardPath;
        router.push(query ? `${currentPath}?${query}` : currentPath, { scroll: false });
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
                                    <Link href={`${dashboardPath}${filterQuery}`}>
                                        <LayoutDashboard />
                                        <span className="min-w-0 truncate">Dashboard</span>
                                    </Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                            <SidebarMenuItem>
                                <SidebarMenuButton asChild isActive={pathname === '/prompts'} tooltip="Prompts">
                                    <Link href={`/prompts${filterQuery}`}>
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
                                            {entries.map((item) => (
                                                <Tree
                                                    item={item}
                                                    key={item.relativePath || item.name}
                                                    linkQuery={filterQuery}
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

type TreeProps = { item: TranslationTreeNode; linkQuery: string; selectedFilePath?: string | null };

const Tree = ({ item, linkQuery, selectedFilePath }: TreeProps) => {
    if (item.kind === 'file') {
        const href = `/translations/${encodeURIComponent(item.relativePath)}${linkQuery}`;
        return (
            <SidebarMenuItem>
                <SidebarMenuButton
                    asChild
                    className="data-[active=true]:bg-sidebar-accent"
                    isActive={selectedFilePath === item.relativePath}
                >
                    <Link href={href}>
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
                                linkQuery={linkQuery}
                                selectedFilePath={selectedFilePath}
                            />
                        ))}
                    </SidebarMenuSub>
                </CollapsibleContent>
            </Collapsible>
        </SidebarMenuItem>
    );
};
