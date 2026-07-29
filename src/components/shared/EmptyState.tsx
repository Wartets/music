import React from 'react';

interface EmptyStateProps {
    icon: React.ReactNode;
    title: string;
    subtitle?: string;
    action?: React.ReactNode;
    className?: string;
    iconClassName?: string;
    titleClassName?: string;
    subtitleClassName?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
    icon,
    title,
    subtitle,
    action,
    className,
    iconClassName,
    titleClassName,
    subtitleClassName
}) => {
    return (
        <div className={`h-full flex flex-col items-center justify-center text-center text-gray-500 p-6 ${className || ''}`}>
            <div className={iconClassName || 'opacity-20 mb-4'}>
                {icon}
            </div>
            <p className={titleClassName || 'font-bold text-white/30 mb-1'}>
                {title}
            </p>
            {subtitle && (
                <p className={subtitleClassName || 'text-xs text-gray-600'}>
                    {subtitle}
                </p>
            )}
            {action && (
                <div className="mt-4">
                    {action}
                </div>
            )}
        </div>
    );
};
