'use client';

import { ChevronRight, File, Folder, LayoutDashboard } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type * as React from 'react';
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
import type { TranslationTreeNode } from '@/lib/shell-types';

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
    entries: TranslationTreeNode[];
    rootName: string;
    selectedFilePath?: string | null;
};

export const AppSidebar = ({ entries, rootName, selectedFilePath, ...props }: AppSidebarProps) => {
    const pathname = usePathname();

    return (
        <Sidebar {...props}>
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel>Changes</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            <SidebarMenuItem>
                                <SidebarMenuButton asChild isActive={pathname === '/dashboard'} tooltip="Dashboard">
                                    <Link href="/dashboard">
                                        <LayoutDashboard />
                                        <span className="min-w-0 truncate">Dashboard</span>
                                    </Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>

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

type TreeProps = { item: TranslationTreeNode; selectedFilePath?: string | null };

const Tree = ({ item, selectedFilePath }: TreeProps) => {
    if (item.kind === 'file') {
        const encodedPath = encodeURIComponent(item.relativePath);
        const href = `/translations/${encodedPath}`;
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
                                selectedFilePath={selectedFilePath}
                            />
                        ))}
                    </SidebarMenuSub>
                </CollapsibleContent>
            </Collapsible>
        </SidebarMenuItem>
    );
};
