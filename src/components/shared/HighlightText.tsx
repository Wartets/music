import React from 'react';

interface HighlightTextProps {
    text: string;
    query?: string;
    markClassName?: string;
}

export const HighlightText: React.FC<HighlightTextProps> = ({
    text,
    query,
    markClassName = 'bg-dominant/30 text-white rounded-sm px-0.5'
}) => {
    const safeText = text || '';
    const safeQuery = query?.trim() || '';

    if (!safeQuery) {
        return <>{safeText}</>;
    }

    const parts = safeText.split(new RegExp(`(${safeQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));

    return (
        <>
            {parts.map((part, i) =>
                part.toLowerCase() === safeQuery.toLowerCase() ? (
                    <mark key={i} className={markClassName}>{part}</mark>
                ) : (
                    part
                )
            )}
        </>
    );
};
