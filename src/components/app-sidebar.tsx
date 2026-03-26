'use client';

import { ChevronRight, File, Folder, LayoutDashboard } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type * as React from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
        const currentPath = pathname.startsWith('/translations') ? pathname : '/dashboard';
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
                                <SidebarMenuButton asChild isActive={pathname === '/dashboard'} tooltip="Dashboard">
                                    <Link href={`/dashboard${filterQuery}`}>
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
                        <SidebarGroupLabel>Filters</SidebarGroupLabel>
                        <SidebarGroupContent>
                            <div className="space-y-4 px-2">
                                <div className="space-y-2">
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                        Model
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        <Badge
                                            variant={modelFilter === 'all' ? 'default' : 'outline'}
                                            className="cursor-pointer"
                                            onClick={() => setFilter({ model: 'all' })}
                                        >
                                            All
                                        </Badge>
                                        {models.map((model) => (
                                            <Badge
                                                key={model}
                                                variant={modelFilter === model ? 'default' : 'outline'}
                                                className="cursor-pointer"
                                                onClick={() => setFilter({ model })}
                                            >
                                                {model}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                        Status
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        <Badge
                                            variant={statusFilter === 'all' ? 'default' : 'outline'}
                                            className="cursor-pointer"
                                            onClick={() => setFilter({ status: 'all' })}
                                        >
                                            All
                                        </Badge>
                                        <Badge
                                            variant={statusFilter === 'valid' ? 'default' : 'outline'}
                                            className="cursor-pointer"
                                            onClick={() => setFilter({ status: 'valid' })}
                                        >
                                            Valid
                                        </Badge>
                                        <Badge
                                            variant={statusFilter === 'invalid' ? 'default' : 'outline'}
                                            className="cursor-pointer"
                                            onClick={() => setFilter({ status: 'invalid' })}
                                        >
                                            Invalid
                                        </Badge>
                                    </div>
                                </div>

                                {hasActiveFilters ? (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="w-full justify-start px-0"
                                        onClick={() => setFilter({ model: 'all', status: 'all' })}
                                    >
                                        Clear filters
                                    </Button>
                                ) : null}
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
