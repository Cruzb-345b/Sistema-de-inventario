import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Enterprise Class-based ErrorBoundary in Dark Monochromatic Aesthetic
 * Guarantees that any unexpected render error in the UI hierarchy
 * is safely caught without crashing the entire telemetry application.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Structured logging of caught UI crash
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] Unhandled UI render exception caught:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public override render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[400px] flex items-center justify-center p-6 bg-[#0b0f17]">
          <div className="max-w-xl w-full bg-[#131823] border border-gray-800 rounded shadow-2xl p-6 text-gray-100">
            <div className="flex items-center space-x-3 border-b border-gray-800 pb-4">
              <div className="p-2 bg-gray-800 text-gray-200 border border-gray-700">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-semibold tracking-wider uppercase text-gray-100">
                  CRITICAL SUBSYSTEM FAULT INTERCEPTED
                </h2>
                <p className="text-xs text-gray-400 font-mono">
                  RESILIENT_UI_BOUNDARY_SHIELD_ACTIVE
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <p className="text-sm text-gray-300">
                The UI component encountered an unexpected error during execution. The system boundary isolated the fault to preserve platform stability.
              </p>

              {this.state.error && (
                <div className="bg-[#0b0f17] border border-gray-800 rounded p-3 text-xs font-mono text-gray-300 overflow-x-auto">
                  <div className="font-semibold text-gray-100 mb-1">
                    {this.state.error.name}: {this.state.error.message}
                  </div>
                  {this.state.error.stack && (
                    <pre className="text-gray-500 text-[11px] whitespace-pre-wrap max-h-36 overflow-y-auto">
                      {this.state.error.stack}
                    </pre>
                  )}
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-gray-800 pt-4">
              <span className="text-xs text-gray-500 font-mono">
                Hardware Resilient Framework v1.0
              </span>
              <button
                type="button"
                onClick={this.handleReset}
                className="inline-flex items-center px-4 py-2 border border-gray-700 text-xs font-medium uppercase tracking-wider text-gray-900 bg-gray-100 hover:bg-white transition-colors shadow-sm focus:outline-none cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-2" />
                Recover System State
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
