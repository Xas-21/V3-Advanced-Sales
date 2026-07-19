import React from 'react';
import { DASHBOARD_HUB_TABS, type DashboardHubTabId } from './dashboardHubTabs';
import { contrastOn } from './analyticsKit';

type DashboardHubTabBarProps = {
    activeTab: DashboardHubTabId;
    onTabClick: (tab: DashboardHubTabId) => void;
    colors: any;
};

export default function DashboardHubTabBar({ activeTab, onTabClick, colors }: DashboardHubTabBarProps) {
    return (
        <div
            className="flex flex-nowrap items-center gap-1 overflow-x-auto pb-0.5 scrollbar-thin"
            style={{ scrollbarColor: `${colors.border} transparent` }}
        >
            {DASHBOARD_HUB_TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => onTabClick(tab.id)}
                        className="inline-flex shrink-0 items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors whitespace-nowrap"
                        style={{
                            backgroundColor: isActive ? colors.primary : 'transparent',
                            color: isActive ? contrastOn(colors.primary) : colors.textMain,
                            border: `1px solid ${isActive ? colors.primary : colors.border}`,
                        }}
                    >
                        <span>{tab.label}</span>
                        {!tab.live && (
                            <span
                                className="px-1 py-px rounded text-[7px] font-black uppercase tracking-wider animate-pulse leading-none"
                                style={{
                                    color: isActive ? contrastOn(colors.primary) : colors.primary,
                                    backgroundColor: isActive
                                        ? `${contrastOn(colors.primary)}22`
                                        : `${colors.primary}22`,
                                }}
                            >
                                Soon
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
