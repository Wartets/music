import { forwardRef, ButtonHTMLAttributes } from 'react';
import { twMerge } from 'tailwind-merge';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'subtle';
}

const VARIANT_CLASSES: Record<NonNullable<ButtonProps['variant']>, string> = {
    primary: 'bg-dominant text-black hover:bg-dominant-light shadow-lg shadow-dominant/20 border border-transparent',
    secondary: 'bg-white/8 text-white border border-white/10 hover:bg-white/12',
    subtle: 'bg-transparent text-gray-300 border border-transparent hover:bg-white/5 hover:text-white',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    { variant = 'primary', className = '', children, type = 'button', disabled, ...props },
    ref
) {
    const baseClasses = [
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold',
        'transition-all duration-200 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dominant focus-visible:ring-offset-2 focus-visible:ring-offset-black',
        'active:scale-[0.98]',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:active:scale-100',
        VARIANT_CLASSES[variant],
    ].join(' ');

    return (
        <button
            ref={ref}
            type={type}
            disabled={disabled}
            className={twMerge(baseClasses, className)}
            {...props}
        >
            {children}
        </button>
    );
});

Button.displayName = 'Button';

