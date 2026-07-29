import { ErrorBoundary as ReactErrorBoundary, FallbackProps } from 'react-error-boundary';
import { useState } from 'react';
import errorService from '../../services/errorService';
import { useTranslation } from '../../i18n/I18nContext';

interface Props {
  fallbackComponent?: React.ComponentType<FallbackProps>;
  children?: React.ReactNode;
}

const DefaultErrorBoundaryFallback: React.ComponentType<FallbackProps> = ({ error, resetErrorBoundary }) => {
  const { t } = useTranslation();
  const [errorId] = useState<string>(() => {
    // Log the error to our error service
    const errorToLog = error instanceof Error ? error : new Error(String(error));
    return errorService.logError(errorToLog, {
      severity: 'high',
      metadata: {
        // Note: error.componentStack might not be available in all environments
        // componentStack: errorToLog.componentStack,
        // Add any additional metadata here
      }
    });
  });

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-8">
      <h1 className="text-4xl font-bold mb-4 text-red-500">{t('errorBoundary.title')}</h1>
      <p className="text-gray-400 mb-4">{t('errorBoundary.errorId')} {errorId}</p>
      <p className="text-gray-400 mb-6">{error instanceof Error ? error.message : String(error)}</p>
      <button
        onClick={() => resetErrorBoundary()}
        className="px-6 py-2 bg-red-600 hover:bg-red-700 rounded-full transition-colors"
      >
        {t('errorBoundary.reload')}
      </button>
      <button
        onClick={() => {
          // Clear error history
          errorService.clearErrorHistory();
          // Then reload
          resetErrorBoundary();
        }}
        className="mt-4 px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded-full transition-colors"
      >
        {t('errorBoundary.clearHistory')}
      </button>
    </div>
  );
};

const ErrorBoundary: React.FC<Props> = ({ 
  fallbackComponent: FallbackComponent = DefaultErrorBoundaryFallback,
  children 
}) => {
  return (
    <ReactErrorBoundary
      FallbackComponent={FallbackComponent}
      onReset={() => {
        // Reset logic if needed
      }}
    >
      {children}
    </ReactErrorBoundary>
  );
};

export default ErrorBoundary;